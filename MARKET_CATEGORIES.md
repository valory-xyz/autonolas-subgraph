# Market categories — design doc

Status: Proposal
Scope: `subgraphs/predict-polymarket`, `subgraphs/predict-omen`
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

**Option A — off-chain enrichment in the consuming app (recommended)**

Keep the subgraph as-is. In the olas-website API route, fetch categories from Polymarket's Gamma API keyed by `conditionId` / `questionId` and join them onto the trader-agent activity at query time. Cache aggressively (Gamma data rarely changes per market).

Pros: zero subgraph work, categories always match what Polymarket itself shows.
Cons: extra dependency at request time, aggregation logic moves into the API route.

This is the right default for predict-polymarket given the constraint.

**Option B2 — keyword classifier in the mapping (fallback only)**

If Option A is unacceptable for latency or dependency reasons, ship a deterministic keyword classifier inside `extractTitle` / `MarketMetadata` creation that buckets the title into the canonical category list ("Politics" if title matches `Trump|Election|Senate|...`, "Crypto" if `BTC|ETH|crypto|...`, etc.). Cheap and deterministic but brittle and only as good as the keyword list.

Schema addition either way:

```graphql
type MarketMetadata @entity(immutable: true) {
  ...
  category: String      # nullable; null until enriched (Option A) or always set (Option B2)
}
```

If Option A is chosen, the `category` field can stay out of the schema entirely — it's enriched at query time, not stored. Add the field only if we commit to B2.

### Optional Option C — per-category aggregate entities

Once category is reliably populated (Omen: at market creation; Polymarket: only viable under B2), add a rollup entity to keep the read path on the predict page cheap:

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

Mirrors the existing `MarketParticipant` rollup pattern. Defer until B is stable; on Polymarket, only meaningful if we go down B2.

## Open questions

- **Realitio template coverage on Omen**: of currently-indexed markets, what fraction has `fields.length >= 3` after the `␟` split? Run a one-off script over historical `Question` entities to confirm coverage before shipping. If coverage is, say, > 95%, B1 is enough; otherwise we need a B2 fallback on Omen too.
- **Realitio category vocabulary**: the categories in the Realitio template are creator-specified strings, not a fixed enum. We need a normalisation table from raw strings (`"crypto"`, `"Cryptocurrency"`, `"Blockchain"`, …) to canonical buckets (`"Crypto"`). Do this in `src/constants.ts` or in the consuming app — leaning toward the subgraph for stability.
- **Canonical bucket list**: align with whatever §7 of the predict-page plan settles on — the doc currently lists "politics, crypto, sports, culture" as examples, but the Figma chart shows more rows. Lock the list before either subgraph ships.
- **Polymarket — Gamma cache strategy**: TTL, fallback when Gamma is down, dedupe of category lookups across requests. Belongs in the consuming app design, not here, but flag now.
- **Backfill on Omen**: schema additions to `FixedProductMarketMakerCreation` (`immutable: false`) don't *require* a full re-index, but `category` will only be populated for markets indexed *after* the deployment unless we backfill. Decide whether to:
  - Re-deploy from genesis (clean, slow), or
  - Add a one-off migration that walks existing `Question` entities and writes `category` onto their linked `FixedProductMarketMakerCreation` (fast, but requires a custom handler).

## Effort estimate

| Subgraph | Path | Effort |
|---|---|---|
| predict-omen | Schema + mapping change (B1) | ~0.5 day |
| predict-omen | Realitio category normalisation table | ~0.25 day |
| predict-omen | Backfill / re-index | ~1 day depending on choice |
| predict-omen | Optional `TraderAgentCategoryMetric` rollup (C) | ~0.5 day |
| predict-polymarket | Option A: consumer-side Gamma join | ~1 day in olas-website (no subgraph work) |
| predict-polymarket | Option B2: keyword classifier + schema field | ~1 day + curation effort to maintain keyword list |

Total if we go Omen-B1 + Polymarket-A: **~2 days subgraph work + ~1 day consuming-app work**, no Polymarket re-index needed.

Total if we additionally do Polymarket-B2: add **~1 day subgraph work + Polygon re-index time** (Polygon is heavier than Gnosis; budget ~1 day end-to-end).
