# Market categories — design doc

Status: predict-omen ✅ implemented; predict-polymarket ⏳ planning
Scope: `subgraphs/predict-omen`, `subgraphs/predict-polymarket`
Driver: Predict page redesign §7 — "Volume / Trades by market category" per economy (Politics, Crypto, Sports, Culture, etc.).

## Why this doc exists

The new Polystrat / Omenstrat predict page wants per-category breakdowns of trader-agent volume and trade count. Today neither predict subgraph indexes a category field — `MarketMetadata.title` (Polymarket) and `FixedProductMarketMakerCreation.question` (Omen) are free-text strings only.

The two subgraphs land in very different places after a code audit (see "Verified findings" below):

- **predict-omen**: category is already present in the on-chain payload — the existing parser splits to 4 fields and currently throws away fields[2] (category) and fields[3] (language). Adding `category` is a one-line change.
- **predict-polymarket**: category is **not** present in the on-chain payload. The UMA `ancillaryData` parser supports a fixed set of fields and `category:` is not among them. There is no realistic path to derive a true category from chain data alone.

This doc describes both paths and recommends a different strategy for each.

## Verified findings (from current code)

### predict-omen — `␟`-separated template, category at field 2

`src/realitio.ts:handleLogNewQuestion` saves the raw `event.params.question` text. `src/FPMMDeterministicFactoryMapping.ts:41` already does:

```ts
let fields = question.question.split("␟", 4);
```

…but only consumes `fields[0]` (title) and `fields[1]` (outcomes). Fields[2] (category) and fields[3] (language) are computed and discarded. The `␟` separator is also defined in `src/constants.ts:12` as `QUESTION_SEPARATOR`.

Realitio v2/v3 question templates encode markets as `title␞outcomes␞category␞language[␞...]`, so for Omen markets created via the standard template, **the category is already in memory at index time**. Confirmed by the `split("␟", 4)` call — the developer who wrote that line knew there were 4 fields, even though only two are stored.

### predict-polymarket — no category in `ancillaryData`

`src/uma-mapping.ts:extractTitle` walks a fixed delimiter list:

```ts
const delimiters = [", description:", ", outcomes:", ", res_data:", ", start:", ", id:", ", initializer:"];
```

These are the only fields known to appear in UMA `ancillaryData`. None of the test fixtures in `tests/uma-mapping.test.ts` and `tests/neg-risk-mapping.test.ts` contain a `category:` field — the closest is `description:`, which is free-text prose, not a categorical label.

Polymarket categorisation (Politics, Sports, Crypto, Culture, …) is owned by the off-chain Gamma API / CMS and is not committed to chain via UMA. We have no way to read it from inside an AssemblyScript mapping — graph-node mappings cannot make HTTP calls (only IPFS file data sources are supported, and Gamma is not an IPFS-backed source).

## Recommended path per subgraph

### predict-omen — Option B1 (parse from existing payload)

**Schema change** (`subgraphs/predict-omen/schema.graphql`):

```graphql
type FixedProductMarketMakerCreation @entity(immutable: false) {
  ...
  question: String
  outcomes: [String!]
  category: String      # NEW — nullable; raw value from Realitio template
  language: String      # NEW — nullable; raw value from Realitio template
  ...
}
```

**Mapping change** (`src/FPMMDeterministicFactoryMapping.ts`, around line 41):

```ts
let fields = question.question.split("␟", 4);

if (fields.length >= 1) {
  entity.question = fields[0];
}
if (fields.length >= 2) {
  // existing outcomes parsing — unchanged
  let outcomes = new Array<string>(0);
  let outcomesData = fields[1].split(',');
  for (let i = 0; i < outcomesData.length; i++) {
    let cleanedOutcome = outcomesData[i].replaceAll('"', '').replaceAll('/', '').trim();
    outcomes.push(cleanedOutcome)
  }
  entity.outcomes = outcomes;
}
if (fields.length >= 3) {
  entity.category = fields[2].trim();   // NEW
}
if (fields.length >= 4) {
  entity.language = fields[3].trim();   // NEW
}
```

Add a small normalisation step downstream (consumer side or constants file) to map raw Realitio category strings to the canonical Predict-page buckets — Realitio categories vary by template version.

**Risk**: not all Omen markets indexed by this subgraph went through the standard template. Markets created via custom factories or older templates may have `fields.length < 3`, in which case `category` stays null. That's acceptable — a null category bucket can render as "Other" on the page.

### predict-polymarket — Option A (off-chain enrichment) + B2 fallback

Because category is not in `ancillaryData`, on-chain extraction is impossible. Two viable paths, neither perfect:

**Option A — off-chain enrichment via Vercel (recommended)**

Strategy: Use a **Vercel Cron Job + Vercel KV or Blob** to periodically sync Polymarket market metadata (including categories) from the Gamma API, then join at query time.

**Why this approach:**
- Categories always match what Polymarket shows (Gamma is canonical)
- Zero subgraph re-indexing required
- Reliable caching means minimal Gamma API load
- Works perfectly for the `MarketParticipated` entity that already tracks all indexed markets
- Can backfill historical markets in one pass

**Implementation overview:**

1. **Vercel Cron Job** (runs daily or every 6h):
   ```
   `/api/cron/sync-polymarket-categories`
   ```
   - Query `MarketParticipated` entities from the predict-polymarket subgraph (all `conditionId`s we've indexed)
   - Map each `conditionId` → Polymarket's `questionId` (call Gamma API `/markets` endpoint, filter by `conditionId`)
   - For each market, fetch category, subcategory, and other metadata from Gamma
   - Write the full metadata map to **Vercel Blob** under a key like `polymarket:categories`
   - Log errors and deduplicate API calls (Gamma rarely changes per market)

2. **Vercel Blob** (stores the cache):
   ```
   Key: "polymarket:categories"
   Value: JSON map
   {
     "0xconditionId1": { "title": "...", "category": "Politics", "subcategory": "US Elections", "url": "..." },
     "0xconditionId2": { "title": "...", "category": "Crypto", "subcategory": "Bitcoin Price", "url": "..." },
     ...
   }
   TTL: 7 days (auto-refresh via cron, or no TTL with manual refresh on cron run)
   ```

3. **Query-time join** (in olas-website API route):
   - When building the predict page, fetch `TraderAgent` + `MarketParticipant` from GraphQL
   - For each market in the results, look up `conditionId` in the Blob cache
   - Augment the response with category data
   - If a market is missing from the cache (shouldn't happen, but fallback), either:
     - Use a keyword-based category guess (see B2 below)
     - Render as "Unknown" / "Other"

**Example code structure (pseudocode):**

```typescript
// /api/cron/sync-polymarket-categories (Vercel Cron)
import { put } from '@vercel/blob';

export const config = {
  maxDuration: 60, // 60 second timeout
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // 1. Get all markets from predict-polymarket subgraph
  const markets = await fetchAllMarketParticipatedFromSubgraph();
  
  // 2. Deduplicate conditionIds
  const conditionIds = [...new Set(markets.map(m => m.conditionId))];
  
  // 3. Fetch Gamma metadata (batch requests)
  const gammaMetadata = await fetchGammaMetadata(conditionIds);
  
  // 4. Build cache object
  const categoryCache = {};
  for (const market of gammaMetadata) {
    categoryCache[market.conditionId] = {
      title: market.title,
      category: market.category,        // e.g. "Politics"
      subcategory: market.subcategory,  // e.g. "Elections"
      url: market.url,
    };
  }
  
  // 5. Store in Blob
  await put('polymarket:categories', JSON.stringify(categoryCache), {
    access: 'public',
  });
  
  res.status(200).json({ synced: conditionIds.length });
}

// /api/predict-page (main query endpoint)
import { get } from '@vercel/blob';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // 1. Query subgraph
  const traderAgents = await queryPredictPolymarket();
  
  // 2. Load category cache from Blob
  const cacheBuf = await get('polymarket:categories');
  const categoryCache = JSON.parse(cacheBuf.text());
  
  // 3. Augment results with categories
  const enriched = traderAgents.map(agent => ({
    ...agent,
    marketCategories: agent.marketParticipants.map(market => ({
      ...market,
      category: categoryCache[market.conditionId]?.category || 'Other',
      subcategory: categoryCache[market.conditionId]?.subcategory || null,
    })),
  }));
  
  res.status(200).json(enriched);
}
```

**Gamma API notes:**
- Endpoint: `https://gamma-api.polymarket.com/markets` (public, no auth required)
- Returns: `conditionId`, `title`, `category`, `subcategory`, `slug`, `liquidity`, `volume_24h`, etc.
- Bulk fetch: supports filter params like `condition_ids=0x...,0x...,` (check docs for batch param)
- Rate limit: typically 10-50 req/sec for public endpoints; cron jobs are bursty, so batch aggressively
- Fallback: if Gamma is down, use cached categories from last successful sync

**Backfill (one-time):**
```bash
# Before first cron run, manually backfill all historical markets:
# POST /api/cron/sync-polymarket-categories?backfill=true
# This runs the same sync but logs all markets, not just new ones.
```

**Effort:** ~2–3 hours (cron handler + Blob integration + error handling)

**Pros:**
- ✅ Zero subgraph changes
- ✅ Categories always canonical (from Gamma)
- ✅ Cheap to run (cron job + Blob reads << frequent API calls)
- ✅ Can serve historical data after backfill
- ✅ Resilient to Gamma temporary outages (cached data)

**Cons:**
- ⚠️ Categories lag by up to ~6 hours (cron frequency)
- ⚠️ Requires Vercel Blob (cost: ~$1-5/mo for typical usage)
- ⚠️ New markets added to Polymarket won't have categories until next cron run
- ⚠️ Requires olas-website to be Vercel-hosted (likely already true)

---

**Option B2 — keyword classifier in the mapping (fallback only)**

If Option A is unacceptable for latency or dependency reasons, ship a deterministic keyword classifier inside `extractTitle` / `MarketMetadata` creation that buckets the title into the canonical category list ("Politics" if title matches `Trump|Election|Senate|...`, "Crypto" if `BTC|ETH|crypto|...`, etc.). Cheap and deterministic but brittle and only as good as the keyword list.

Schema addition either way:

```graphql
type MarketMetadata @entity(immutable: true) {
  ...
  category: String      # populated by Gamma sync (Option A) or keyword classifier (Option B2)
}
```

If Option A is chosen, the `category` field stays out of the schema entirely — it's enriched at query time in the Vercel API. Add the field to the schema only if we commit to B2 (keyword-based).

### Optional Option C — per-category aggregate entities

Once category is reliably populated (Omen: at market creation; Polymarket: via Vercel cron + Blob), add a rollup entity to keep the read path on the predict page cheap:

```graphql
type TraderAgentCategoryMetric @entity(immutable: false) {
  id: ID!                    # traderAgent_address + "_" + category
  traderAgent: TraderAgent!
  category: String!
  totalBets: Int!
  totalTraded: BigInt!
  totalTradedSettled: BigInt!
  totalPayout: BigInt!
}
```

Mirrors the existing `MarketParticipant` rollup pattern. Defer until B is stable; on Polymarket, only meaningful if we go down B2 (on-chain keyword).

## Open questions

- **Realitio template coverage on Omen**: of currently-indexed markets, what fraction has `fields.length >= 3` after the `␟` split? Run a one-off script over historical `Question` entities to confirm coverage before shipping. If coverage is, say, > 95%, B1 is enough; otherwise we need a B2 fallback on Omen too.
- **Realitio category vocabulary**: the categories in the Realitio template are creator-specified strings, not a fixed enum. We need a normalisation table from raw strings (`"crypto"`, `"Cryptocurrency"`, `"Blockchain"`, …) to canonical buckets (`"Crypto"`). Do this in `src/constants.ts` or in the consuming app — leaning toward the subgraph for stability. **Next PR should include this.**
- **Canonical bucket list**: align with whatever §7 of the predict-page plan settles on — the doc currently lists "politics, crypto, sports, culture" as examples, but the Figma chart shows more rows. Lock the list before either subgraph ships.
- **Polymarket — cron timing**: how fresh do categories need to be? Every 6 hours? Daily? Less frequently if we manually trigger on new market discoveries?
- **Gamma API SLA**: if Gamma is down during cron run, should we retry, or just use stale cache? (Recommended: retry with exponential backoff, use stale data as fallback.)

---

## Implementation notes

### Omen (predict-omen) — Code & Testing Status

**Code changes** (complete):
- Schema: Added `category` and `language` fields to `FixedProductMarketMakerCreation`
- Mapping: Extended parsing to extract fields[2] and fields[3] from Realitio template; fields trimmed of whitespace
- Nesting: new blocks are inside `if (fields.length >= 1)` — slightly redundant but readable, no performance impact

**Testing** (complete):
- File: `subgraphs/predict-omen/tests/category-parsing.test.ts`
- Fixtures cover:
  - Full 4-field template (category + language both populated)
  - 3-field template (category only, language null)
  - 2-field legacy template (both null)
  - Whitespace trimming
  - Complex outcomes with special characters (to ensure category parsing isn't affected by outcomes parsing)
- Run with: `graph test tests/category-parsing.test.ts` or `yarn test`

**Backfill strategy** (decided):
- Deploy to production with no re-index (future markets indexed with category)
- Historical markets (`category = null`) render as "Other" on predict page
- Optional one-off migration later if backfill coverage is needed (low priority)

## Effort estimate

| Subgraph | Path | Effort | Status |
|---|---|---|---|
| predict-omen | Schema + mapping change (B1) | ~0.5 day | ✅ **COMPLETE** |
| predict-omen | Matchstick tests for category/language parsing | ~0.25 day | ✅ **COMPLETE** |
| predict-omen | Realitio category normalisation table | ~0.25 day | Pending: next step |
| predict-omen | Backfill / re-index | 0 days initially; ~0.5 day if backfill needed later | Staged approach |
| predict-omen | Optional `TraderAgentCategoryMetric` rollup (C) | ~0.5 day | Optional |
| predict-polymarket | Vercel Cron + Blob sync (Option A) | ~2-3 days (olas-website) | Recommended |
| predict-polymarket | Option B2: keyword classifier + schema field | ~1 day + curation effort | Fallback only |

**Recommended path: Omen-B1 (complete + tested) + Polymarket-A (Vercel cron/blob)**
- Subgraph work: ~1 day (Omen normalisation table + decide backfill)
- Consuming-app work: ~2-3 days (Vercel cron handler + Blob integration in olas-website)
- **Total: ~3-4 days**, zero Polymarket re-index needed, Omen ready to ship after normalisation

**If we add per-category rollups (Option C):** add ~0.5 day per subgraph
