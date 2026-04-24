# Polymarket v2 Migration Plan

Status: **Draft for discussion**
Target cutover: **2026-04-28 ~11:00 UTC** (~1 hour downtime per Polymarket docs)
Today: 2026-04-23 (T-5 days)

## Context

Polymarket is moving the CLOB exchange layer from v1 to v2. Per the reviewer audit of
`subgraph.yaml` on 2026-04-22:

- v1 **CTF Exchange** `0x4bFb41d5…8982E` is hardcoded (line 148)
- v1 **NegRisk CTF Exchange** `0xC5d563A3…20f80a` is hardcoded (line 176)
- **USDC.e** is NOT hardcoded as a dataSource; it only appears as a value in `Bet.amount`
- **ConditionalTokens** `0x4D97DCd9…` and **NegRiskAdapter** `0xd91E80cF…` are
  hardcoded but unchanged in v2 — no action needed
- No v2 addresses, no pUSD, no v2 branch in the current repo

## What actually changes in v2

Per https://docs.polymarket.com/v2-migration and the contracts reference:

| Concern                | v1                               | v2                                                   | Action                       |
| ---------------------- | -------------------------------- | ---------------------------------------------------- | ---------------------------- |
| Standard CTF Exchange  | `0x4bFb41d5…8982E`               | `0xE1111800…B996B`                                   | Add v2 dataSource            |
| NegRisk CTF Exchange   | `0xC5d563A3…20f80a`              | `0xe2222d27…10F59`                                   | Add v2 dataSource            |
| ConditionalTokens      | `0x4D97DCd9…`                    | unchanged                                            | none                         |
| NegRiskAdapter         | `0xd91E80cF…`                    | unchanged                                            | none                         |
| Collateral token       | USDC.e                           | pUSD (6-dec, 1:1 USDC-backed on-chain)               | none (not a dataSource)      |
| Order struct           | had `taker`/`expiration`/`nonce`/`feeRateBps` | dropped those, added `timestamp`/`metadata`/`builder`; fees now on-chain at match time | **Verify event ABI diff**    |

Also listed in the contracts doc (to verify, but outside reviewer scope):
- UMA Adapter `0x6A9D2226…` (we're on `0x157Ce2d6…`)
- UMA Oracle `0xCB182285…` (we're on `0x65070BE9…`, OOV3)

These are likely separate adapters that coexist — Polymarket runs multiple UMA
adapters for different product lines. Verify before cutover but don't assume a change.

## Deployment strategy: graft-on-top

Because the predict-polymarket subgraph is large and runs on our own infra (Studio
can't handle its size), we **graft** the new version on top of the current production
deployment instead of re-indexing from scratch.

```yaml
# subgraph.yaml (new version)
specVersion: 1.0.0
# ...
features:
  - grafting
graft:
  base: QmZXBjgbyCNCrrB51kEPtNHtzzwwNHy8GnSGmLFHFGDc5Z
  block: <graft-block-near-head>   # pick a block ~15min before v2 cutover
```

- All existing entities (TraderAgent, Question, Bet, TokenRegistry, etc.) carry over.
- New v2 dataSources have `startBlock: <graft-block>` so they start at head.
- Existing v1 dataSources keep their original `startBlock` but are never re-indexed —
  graft-node skips them because the graft base already covers everything up to the
  graft block.
- After cutover + a few clean days, the next deployment **drops the `graft:` block**
  and treats the post-graft state as the new base. Keep the pre-graft deployment
  alive until then in case we need to rebuild.

**Grafting constraints to remember:**
- Schema must be additive vs. the base. We're only adding two optional
  fields (`Bet.builder`, `Bet.metadata`) and no new required fields, so
  this is satisfied.
- Graft base must remain available on the indexer until we drop the graft block.
- **Pruning window.** The base runs with `indexerHints: prune: 300`, so
  only the last 300 blocks (~10 minutes on Polygon) of entity history are
  retained. The graft block must fall inside `[head - 300, head]` at the
  moment of deploy, or the source state is already pruned and the graft
  fails. See "Paused-base strategy" below.

## Paused-base strategy

Because pruning gives us only a ~10-minute window, we can't pre-pick a
graft block days in advance and have it still be valid at deploy time.
Instead:

1. **Pause the base subgraph** (`graphman pause <deployment>`). Its head
   stops advancing, so the pruning window stops advancing too. Whatever
   block the base was at when paused stays queryable indefinitely.
2. **Commit that block** as `graft.block` and as both v2 exchange
   `startBlock`s in `subgraph.yaml`. The exact number is pinned in the
   PR, code-reviewed, reproducible in staging.
3. **Deploy the grafted subgraph** and verify it starts indexing v2
   events from the graft block forward.
4. **Resume the base** (`graphman resume <deployment>`). It catches up
   from its paused head; no data loss. Keep it live until the Phase 4
   "drop graft:" follow-up deploy lands.

Prereq to verify with infra before cutover: confirm graph-node's pruning
is head-triggered (it is in the standard build — pruning runs as part of
indexing progress, so a paused subgraph does not prune).

## Block pinning (2026-04-24)

Paused the production base at Polygon block **85952819** (2026-04-24).
With Polygon's ~2s blocktime, cutover on 2026-04-28 11:00 UTC lands
around block `86145578`, and cutover + 14 days around block `86750378`.

| Manifest field                    | Block    | Notes                                                 |
| --------------------------------- | -------- | ----------------------------------------------------- |
| `graft.block`                     | 85952819 | frozen head of the paused base subgraph               |
| `CTFExchangeV2.startBlock`        | 85952819 | same — must match graft.block                         |
| `NegRiskCTFExchangeV2.startBlock` | 85952819 | same                                                  |
| `CTFExchange.endBlock` (v1)       | 86750000 | ~cutover + 2 weeks, rounded                           |
| `NegRiskCTFExchange.endBlock` (v1)| 86750000 | ~cutover + 2 weeks, rounded                           |

### Why cap v1 with `endBlock` (revised decision)

The earlier draft of this plan argued for leaving v1 dataSources open-ended.
That argument still holds in the abstract — cutover dates can slip, and a
bare `endBlock` right at cutover is risky. The team's counter-proposal solves
that: pair the `endBlock` with a **2-week buffer** past the announced cutover,
so slippage short of two weeks doesn't drop real events. If Polymarket ends
up keeping v1 live longer than that, we bump the `endBlock` — it's a one-line
manifest edit.

Net effect: we get an explicit stopping point for v1 (cleaner operational
signal, clearer "retired" status) without being fragile to small slips.

### Why this block and not "slightly before cutover"

The paused-base strategy decouples the graft block from the cutover block
entirely. The base is paused now; its head will stay at 85952819 until
we deploy, regardless of wall-clock time. Benefits:

1. **Stable, code-reviewable block number.** Pinned in the PR today,
   rehearsable in staging against the same block, no cutover-morning
   YAML edit.
2. **No 10-minute deploy pressure.** The pruning window for this graft
   block doesn't advance while the base is paused, so we're not racing
   a clock.

Tradeoff: we lose the "capture pre-cutover v2 test-market trades"
benefit the earlier plan argued for. Polymarket's v2 test markets
trading between 2026-04-24 and cutover happen at blocks **after**
85952819, so those events do still fall within the v2 dataSource's
indexing range — they'll be picked up when the grafted subgraph starts
syncing forward from 85952819. Only events between 2026-04-23 (the
originally proposed block) and 2026-04-24 are forgone.

If the deploy slips by more than a few days, re-pause the (resumed)
base at its new head and bump this block + both v2 startBlocks
together.

## Pre-work (Apr 23 – Apr 25)

### 1. ABI diff — DONE (2026-04-23)

Pulled v2 source + compiled ABI from Sourcify (partial match) for both new
Exchange addresses. Saved as `abis/CTFExchangeV2.json`. Both v2 exchanges share
the same source, so one ABI covers both.

**`OrderFilled` — CHANGED (non-trivial):**

```
v1: OrderFilled(
      indexed bytes32 orderHash,
      indexed address maker,
      indexed address taker,
      uint256 makerAssetId,
      uint256 takerAssetId,
      uint256 makerAmountFilled,
      uint256 takerAmountFilled,
      uint256 fee)

v2: OrderFilled(
      indexed bytes32 orderHash,
      indexed address maker,
      indexed address taker,
      uint8   side,              // NEW: 0=BUY, 1=SELL (replaces makerAssetId==0 trick)
      uint256 tokenId,           // REPLACES makerAssetId+takerAssetId
      uint256 makerAmountFilled,
      uint256 takerAmountFilled,
      uint256 fee,
      bytes32 builder,           // NEW (ignored for indexing)
      bytes32 metadata)          // NEW (ignored for indexing)
```

Impact: our v1 handler's `isBuying = event.params.makerAssetId.isZero()` logic
becomes `isBuying = event.params.side == 0`. The `outcomeTokenId` now comes
directly from `event.params.tokenId` — no conditional on buy/sell direction.

**`TokenRegistered` — REMOVED in v2.** v2 exchanges do not emit it. This is
the bigger change and requires a new strategy (see section 3 below).

### 2. v2 constructor args (decoded from Sourcify)

| slot                | address                                       | meaning                                                                   |
| ------------------- | --------------------------------------------- | ------------------------------------------------------------------------- |
| admin               | `0x3dce0a29…`                                 |                                                                           |
| collateral          | `0xC011a7E1…` (pUSD)                          | user-facing token                                                         |
| ctf                 | `0x4D97DCd9…` (ConditionalTokens)             | **unchanged**                                                             |
| **ctfCollateral**   | **`0x2791bca1…` (USDC.e)**                    | **position-ID derivation still uses USDC.e** — existing tokenIds survive  |
| outcomeTokenFactory | `0xada10087…`                                 | wraps/unwraps pUSD↔USDC.e at the exchange                                 |
| proxyFactory        | `0xaacfeEa0…`                                 |                                                                           |
| safeFactory         | `0x115f48dc…`                                 |                                                                           |

The critical line is `ctfCollateral = USDC.e`. ConditionalTokens position IDs
(= outcome tokenIds) are derived from the ctfCollateral, so every tokenId
minted under v1 remains valid in v2. Existing `TokenRegistry` rows stay
correct. No re-minting, no token-ID churn for pre-cutover markets.

### 3. Replacing `TokenRegistered` — compute tokenIds at ConditionPreparation

v2 exchanges don't emit `TokenRegistered`. The `outcomeTokenFactory` only
emits ownership/role events — nothing useful for us.

**Proposed workaround:** compute both outcome tokenIds at
`ConditionalTokens.ConditionPreparation` time using standard CTF formulas,
via eth_calls (no tricky AssemblyScript crypto):

```
collectionId_i = ConditionalTokens.getCollectionId(0x0, conditionId, indexSet_i)
tokenId_i      = ConditionalTokens.getPositionId(collateral, collectionId_i)

// binary markets: indexSet_0 = 1 (0b01), indexSet_1 = 2 (0b10)
// collateral = USDC.e (regular) or NegRiskAdapter (negrisk)
```

Both `getCollectionId` and `getPositionId` are already present in our existing
`abis/ConditionalTokens.json` — no ABI change needed.

Branch on `ConditionPreparation.oracle`:

- oracle == NegRiskAdapter `0xd91E80cF…` → collateral = NegRiskAdapter
- otherwise → collateral = USDC.e

Write the two resulting `TokenRegistry(tokenId, conditionId, outcomeIndex)`
entries just like the v1 `handleTokenRegistered` did. This handler modification
is **idempotent and safe for historical data**: grafting preserves existing
TokenRegistry rows, and the new logic only runs for future ConditionPreparation
events (v2-era markets). v1 `handleTokenRegistered` stays wired as a
belt-and-braces path; it's a no-op on v2 because v2 never emits the event.

Performance cost: up to 4 eth_calls per new binary market's ConditionPreparation.
Polymarket mints roughly O(100) markets/day — negligible.

### 4. Handler plan (final)

- `src/ctf-exchange-v2.ts` (**new**): `handleOrderFilledV2` only. Reads `side`
  + `tokenId` directly. Normalizes to the existing `processTradeActivity`.
- `src/conditional-tokens.ts` (**modified**): `handleConditionPreparation` gains
  eth_call-based TokenRegistry derivation, branched by oracle. No other changes.
- `src/ctf-exchange.ts` (v1 handlers): **unchanged**.
- `src/neg-risk-mapping.ts`: **unchanged** — NegRiskAdapter address/code is
  the same pre- and post-cutover.
- `abis/CTFExchangeV2.json`: saved.
- `abis/ConditionalTokens.json`: already has `getCollectionId` + `getPositionId`.

### 5. Validate against v2 test markets

Polymarket lists two test markets with liquidity on `clob-v2.polymarket.com`
(per https://docs.polymarket.com/v2-migration#test-markets):

- **US / Iran nuclear deal in 2027?** (event 73106)
  - Token: `102936224134271070189104847090829839924697394514566827387181305960175107677216`
- **Highest grossing movie in 2026?** (event 79831)
  - Tokens: `81662326...832777`, `17546146...311707`, `28161183...722479`,
    `89576274...374694`, `21556669...566607`, `51020513...702516`

No tx hashes in the docs. Plan:

- Query v2 CTF Exchange `0xE1111800…` logs on Polygonscan filtered by
  `OrderFilled(bytes32,address,address,uint8,uint256,...)` on the listed
  token IDs to get trade tx hashes.
- Resolve the Gamma API events (`gamma-api.polymarket.com/events/73106`,
  `...79831`) to pull conditionIds so we can cross-check against
  `ConditionPreparation` events.
- Bake resulting tx hashes into `tests/ctf-exchange-v2.test.ts` fixtures.

### 6. pUSD sanity check — DONE (2026-04-23)

Verified via the constructor-args decode in section 2 and the Polymarket v2
migration docs:

- pUSD (`0xC011a7E1…`) is the user-facing wrapper; `ctfCollateral = USDC.e`
  handles position-ID derivation internally. pUSD is 6-decimal and 1:1
  USDC-backed per the migration docs, so `Bet.amount` stays comparable
  across the cutover (same unit, same scale).
- No schema change, no reporting note needed.

### 7. Graft + v2 start block — DONE (2026-04-24)

Paused the production base at block **85952819** and pinned that block in
the manifest (see "Block pinning" section above):

- `graft.block` = `CTFExchangeV2.startBlock` = `NegRiskCTFExchangeV2.startBlock` = **85952819** (paused-base head, 2026-04-24)
- `CTFExchange.endBlock` = `NegRiskCTFExchange.endBlock` = **86750000** (~cutover + 2 weeks)

The base must stay paused from now until the grafted subgraph is deployed
and verified. If the deploy slips by more than a few days, re-pause the
base at its new head and bump this block + both v2 startBlocks together.

## Phased timeline

**Apr 23–25 — Prep**
- [x] Fetch v2 ABIs, diff events, decide reuse vs. v2 handler variants.
- [x] Implement v2 dataSources + handlers (if needed) behind a new branch.
- [x] Add Matchstick tests covering v2 fixtures from Polymarket's test markets.
- [x] `yarn codegen && yarn build && yarn test` clean.
- [x] Pause production base at block 85952819; pin that block as `graft.block`
      and both v2 `startBlock`s.

**Apr 26–27 — Staging rehearsal**
- [ ] Pause staging base; note its head block.
- [ ] Point a staging-only manifest at that block; deploy grafted subgraph
      to staging indexer.
- [ ] Verify graft succeeds and v2 exchanges start indexing from the head.
- [ ] Resume staging base; confirm it catches up cleanly.
- [ ] Spot-check: TraderAgent rows, Global counters, a few known agents still on v1.
- [ ] Run `scripts/validate-global.js` against staging.

**Apr 28 ~11:00 UTC — Cutover**
- [ ] Confirm production base is still paused at 85952819 (and that no one
      resumed it between now and cutover).
- [ ] Deploy grafted subgraph to production.
- [ ] Verify graft succeeded (entity counts match the paused base).
- [ ] Resume the production base immediately after graft deploy is verified
      (so it stays available as a graft source until Phase 4).
- [ ] Monitor first v2 `OrderFilled` events after cutover: confirm agents
      load, Bet rows land, `Global.totalBets` increments.

**Apr 28+ — Post-cutover**
- [ ] 24h later: re-run `validate-global.js`.
- [ ] Once stable, plan a follow-up deployment that drops the `graft:` block so the
      subgraph becomes self-contained again.
- [ ] Keep pre-graft deployment alive (and indexing) until the follow-up lands.

## Rollback

v1 handlers and entities are untouched, so rollback is cheap:

- Revert the indexer's active deployment to the pre-graft version (the
  paused-then-resumed base).
- A few hours of v2 trades go un-indexed; they backfill on re-deploy of the fixed
  v2 handler version.
- No data loss, no schema churn.

## Risks

- **ABI drift on v2 `OrderFilled`.** Biggest risk. Mitigation: verify before writing
  any handler code — done.
- **Base resumed prematurely.** If someone resumes the paused base before
  we deploy, its head advances and 85952819 eventually falls outside the
  300-block pruning window, invalidating the pinned graft block. Mitigation:
  clear ownership of the paused state + a runbook note; re-pause and bump
  the block if it happens.
- **Graft base unavailable.** If the indexer loses the source deployment before we
  drop `graft:`, the grafted subgraph can't be rebuilt from scratch without
  re-indexing. Mitigation: keep the pre-graft deployment pinned until Phase 4
  lands.
- **pUSD decimals or other surprise.** Resolved in section 6 — no surprise.
- **Migration slip.** If Polymarket postpones, re-pause the base at its
  new head and bump `graft.block` + both v2 `startBlock`s together. One
  manifest edit + redeploy.

## Confirmed

- **Graft base:** `QmZXBjgbyCNCrrB51kEPtNHtzzwwNHy8GnSGmLFHFGDc5Z` (current prod).
- **Test market fixtures:** sourced from the two test markets in the Polymarket
  docs; tx hashes to be pulled from Polygonscan as part of pre-work.
- **Scope:** only predict-polymarket is affected on cutover day.

## Still open

- Do we want `scripts/validate-global.js` wired to a monitor that alerts on
  cutover-day anomalies, or is eyeball inspection enough?
- Named owner on our side for the cutover-day promote on self-hosted infra.
