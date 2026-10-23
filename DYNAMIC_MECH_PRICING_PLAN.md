# Dynamic mech pricing: indexing implementation plan

Prepared against repository revision `80d09c0`; schedule updated Friday, 23 October 2026.

Target: focus on #142 on Friday, 23 October, complete its review at the start of next week, then implement #140 followed by #143 during 26–30 October. This is a sequential schedule for one implementer; no weekend work is assumed. Start indexing corrected versions as soon as they are ready, without waiting for new contracts. Contract deployment is expected next week; the exact day and chains remain to be confirmed. Full data readiness will take longer: allow approximately 1–1.5 weeks for Gnosis indexing and potentially several weeks for other chains. This is planned work, not an emergency.

The hard deadline is **before a mech starts charging variable amounts**, rather than before the contract upgrade itself. A contract deployment can precede activation. Code merged, indexer deployed, and corrected data fully synced are separate milestones.

## Scope and priorities

| Priority | Issue | Outcome | Timing dependency |
| --- | --- | --- | --- |
| 1 — Friday: #142 | [#142 — advertised rate overwritten](https://github.com/valory-xyz/autonolas-subgraph/issues/142) | Deliveries cannot change the mech's advertised maximum. | Must be live before variable pricing is enabled on that chain. |
| 2 — Next week: #140 | [#140 — duplicate data sources](https://github.com/valory-xyz/autonolas-subgraph/issues/140) | Each event contributes once; historical counters are rebuilt correctly. | Independent of the contract upgrade; start after #142 next week, then allow time for full reindexing. |
| 3 — Next week: #143 | [#143 — cap-and-actual reporting](https://github.com/valory-xyz/autonolas-subgraph/issues/143) | Actual charges drive spend reporting, field meanings are explicit, and cutover is documented. | Implement before activation where possible; live verification follows contract deployment and a real variable-price delivery. |

The reviewed cap-and-actual approach supersedes the scope document's earlier exact-price rule and “no contract changes” premise. Quote endpoints, tool costing, buyer changes and contract implementation remain owned by their respective repositories.

## Deployment scope

| Network | Backend / action |
| --- | --- |
| Gnosis, Polygon, Optimism | Active Graph deployments: implement fixes and fully reindex. |
| Base, Robinhood | Active marketplace squids: implement equivalent fixes, schema/model changes and fully reindex. |
| Ethereum, Celo | Apply identical relevant Graph source/manifest fixes and build checks; remain turned off. No production reactivation in this plan. |
| Arbitrum | Retain source/manifest correction and build coverage because it is explicitly named in #140; no active production rollout assumed. |
| Mode | Excluded. |

Full reindexing is the agreed release strategy for every active deployment, including squids, to reconstruct corrected history and the new all-time counter. No grafting or partial-state recovery is planned. Existing URLs remain supported and consumers switch gradually after validation; this is an operational assumption, not an open investigation.

## What can be fixed before new contracts are deployed?

**All three issues can be implemented and tested now.** New contract deployment is not a prerequisite for correcting existing handlers, fee reporting or duplicate data sources.

| Work | Can proceed now? | What still depends on deployment? |
| --- | --- | --- |
| #142: remove delivery-driven maximum updates, including squid parity | Yes: implement, test with variable-charge fixtures, and deploy against existing contracts. | A real variable-price transaction is needed for the final production smoke test, not for shipping the fix. |
| #140: remove duplicate event coverage, add the global off-chain counter, rebuild historical totals | Yes: implement, deploy and begin replay using existing deployment history. | Nothing from the new contract rollout. Completion depends on indexing and reconciliation. |
| #143: clarify fields, audit existing aggregates, test actual delivery charges and prepare consumer documentation | Yes: existing delivery events already carry actual charges. Correct existing reporting without adding a new off-chain request model. | Final upgrade/activation blocks, new-factory configuration and live verification become available with the rollout. |
| Register new factories and validate new mechs | Prepare the configuration changes now; apply once verified deployment addresses, start blocks and payment types are available. | Final deployment records. The existing marketplace proxy address is expected to stay unchanged. |

Do not wait for contract deployment to start a long replay. Where practical, combine the historical counter and fee corrections into one tested version to avoid rebuilding the same chain twice; keep #142 independently releasable if the larger change takes longer. Prepare new-factory configuration alongside the release. If deployment records arrive after a replay has begun, ensure the new factory is covered from its creation block; schedule another full replay if necessary rather than assuming a later configuration change recovers missed events.

The rollout described in [contract PR #208](https://github.com/valory-xyz/autonolas-marketplace/pull/208) includes a marketplace implementation/proxy upgrade and updated factories/new mechs where applicable. Factory addresses and currency mappings are explicit configuration today; individual mechs are discovered through creation events. Price values continue to come from contract events.

## Confirmed scope and implementation decisions

- **Signed cap stays in the data lake.** Divya, the product owner and issue author, confirmed that storing the advertised mech maximum separately is sufficient for this release because the signed price is already stored in the data lake. Preserve actual delivery charges in the indexers; do not add or infer a per-request signed-cap field. No contract event change or new cap data source is required for this scope.
- **#142's code location has moved.** In this checkout, the call to `refreshMechDeliveryRate` is in `processOnChainDeliver`, not `persistSignedDeliver`. Trace and fix the current paths, rather than relying on the issue's function name. Factory creation and `MaxDeliveryRateUpdated` are the intended rate sources, but event registration is incomplete: only the Gnosis Graph manifest currently subscribes to `MaxDeliveryRateUpdated`, and the Base squid sets `handlesMaxDeliveryRateUpdated: false`. Removing the overwrite alone would leave rates stale on those paths.
- **Keep the existing off-chain reporting architecture.** Divya confirmed that off-chain request data is available in the data lake (consumed by mech-analytics). Do not create off-chain `Request` entities or expand marketplace USD aggregation as part of these issues. The existing helper's on-chain request/fee-unit guard explains why signed-only deliveries do not automatically populate `Request.finalFeeUSD`; correct the documentation rather than promising coverage that is absent. Request-level off-chain reporting remains in mech-analytics/data lake; aggregate settlement fees already have the separate mech-fees indexer. Audit existing marketplace aggregates within their current coverage.
- **Celo has the same manifest overlap pattern** as the four chains named in #140. Audit it in the same change. Gnosis and Base already have separate V1/V2 block ranges and should be regression checks.
- **Robinhood uses `squids/marketplace`, not a Graph manifest.** Its `src/handlers.ts` contains the same rate-refresh pattern. Include a parity check and fix before Robinhood activation; a Graph-only release does not cover the full rollout in the scope document.

## Implementation sequence

### 1. Preserve advertised rates — #142

Estimated effort: half to one working day including event-registration fixes and focused tests, plus review/deployment time.

1. Remove delivery-driven writes to `Mech.maxDeliveryRate` and `maxDeliveryRateUSD` in `subgraphs/marketplace/src/marketplace/utils.ts`; remove the helper if unused. Check all callers and mirror the correction in the Robinhood marketplace squid.
2. Preserve initialization at mech creation and register `MaxDeliveryRateUpdated` on all applicable mech templates/manifests. Enable the equivalent path for the Base squid and preserve Robinhood support. Test actual subscription configuration, not only direct handler calls. Verify creation events populate rates for all configured factories; missing initial rates must not be filled from a delivery charge. Reconstruct missed historical rate updates through replay or another explicitly validated recovery path.
3. Add regressions for multiple deliveries with different charges below the maximum, a charge equal to the maximum, and an explicit maximum update. Verify raw/USD advertised values remain stable across deliveries, while individual charges remain indexed.
4. Build affected indexers and deploy the correction to each chain before variable pricing is enabled there. Keep this fix independently releasable if the broader reporting work slips.

Acceptance: a mech advertising 100 units can deliver requests charging 30 and 70 units while its advertised maximum stays 100; an explicit update to 120 changes the maximum to 120. Existing fixed-price behavior remains supported.

### 2. Repair duplicate processing and historical totals — #140

Estimated effort: one working day for investigation, implementation and tests; resync duration measured separately.

1. Use the completed V1/V2 investigation below as the source-selection decision. Add regression checks for the shared event registrations on Polygon, Optimism, Arbitrum, Ethereum and Celo.
2. Remove the redundant V1 marketplace source from Polygon, Optimism, Ethereum, Arbitrum and Celo, retaining V2 at its existing start block (deployment-history evidence below). Preserve the existing V1/V2 boundaries on Gnosis and Base. This removes all duplicate common-event registrations, not just the signed batch handler.
3. Include the requested `Global.totalOffChainRequests` field from the [issue discussion](https://github.com/valory-xyz/autonolas-subgraph/issues/140) in scope, initializing it in every Global creation path and incrementing by `numDeliveries`, not by one per batch. Add the same field and accounting to both active marketplace squid deployments, with generated models/schema migration and full replay.
4. Test a multi-request signed batch and all affected counter families: `Global`, `Sender`, `RequestsPerAgent` and `Mech`. Add a manifest-level coverage check: calling a handler once in a unit test does not prove graph-node will dispatch it only once.
5. Deploy corrected versions and resync affected history. Reusing already inflated state does not repair counters; do not graft from a checkpoint containing the duplication.
6. Compare totals at the same indexed block, with full pagination: the sum of signed-event `numDeliveries`, `Sender.totalOffChainRequests`, and the new global counter must agree. Batch-event counters must agree with event counts. Reconcile the other shared handlers separately rather than assuming all totals can simply be halved.

Acceptance: no overlapping coverage for the same event; counters reconcile after replay; existing Base/Gnosis behavior is unchanged. The website's workaround stays until corrected endpoints are synced and its owner validates the switch.

### 3. Clarify and audit existing actual-charge reporting — #143

Estimated effort: half to one working day for the existing aggregate audit, focused tests and documentation. Expanded off-chain Request/USD reporting and signed-cap ingestion are out of scope.

1. Update schema descriptions, comments and query examples in `subgraphs/marketplace/schema.graphql`, `src/marketplace/mech-marketplace.ts` and `README.md`:
   - `Mech.maxDeliveryRate`: current advertised maximum.
   - `Request.feeRaw` / `feeUSD`: advertised-rate snapshot where available; not proof of the signed cap or amount paid. Off-chain requests have no request-time event, so do not invent a request-time snapshot.
   - Delivery `deliveryRate`: actual charged amount in original units.
   - `Request.finalFeeUSD`: actual delivery charge converted to USD for the existing supported request paths; not a universally populated field for signed-only off-chain requests.
2. Verify that signed delivery events retain the raw actual charge and document how consumers obtain it. Preserve the existing separation between marketplace delivery records, data-lake off-chain request data and mech-fees settlement aggregates. Do not add off-chain Request creation or broaden marketplace fee totals.
3. Audit all fee sums/averages and derived reporting in this repository. Within each aggregate's existing coverage, actual spend must use delivery charges / `finalFeeUSD`, not advertised-rate estimates. Verify sender/global totals, and record whether any mech-level aggregates need changes. Check Robinhood parity, including USDG units, without assuming all stablecoins have the same decimals.
4. Test raw charge preservation for unequal signed deliveries in one batch, equal-to-maximum and zero charges; test existing on-chain fee totals, legacy fixed-price behavior, handler ordering and supported currency conversions. Do not assert new off-chain Request/USD coverage. Preserve raw charges when USD conversion is unavailable; missing conversion must not be presented as genuinely free service.
5. Document per-chain contract upgrade block/transaction and first variable-price activation block/transaction separately. Mark any reporting coverage changes or backfills. Do not promise historic USD estimates equal actual USD charges: conversion timing and missing data can differ even under flat pricing.
6. Give downstream owners a field mapping, endpoint version and cutover record for `mech-analytics`, `townhall-kpis`, `olas-website`, `trader` and `predict-api`. Their code changes are outside this repository.

No event ABI change is expected for the existing cap-and-actual overloads, per #143. Manifest changes above address #140, not a new pricing event. Explicit nonces require no subgraph ID derivation change because emitted request IDs are indexed directly.

## Completed pre-review investigation

### Why Base ignores maximum updates

The Base squid intentionally copied the old Graph behavior. Commit [`9dd6cd3`](https://github.com/valory-xyz/autonolas-subgraph/commit/9dd6cd349a8d0a3296e4d47360fc330dbe6e5abe) explicitly says it has no `MaxDeliveryRateUpdated` handling because the Base manifest has none. This is behavioral parity with an omission, not a contract limitation. Fix both the Graph registrations and the squid configuration together. Only Gnosis currently registers this event in the Graph manifests; Robinhood already enables it in the squid.

### Historical V1/V2 coverage and chosen fix

The investigation compared local V1/V2 ABIs, manifest history, original contract deployment records and contract source at those deployment commits. This is repository/deployment-record evidence, not a claim of a complete independent RPC scan of all historical logs.

| Chain | Retained marketplace coverage | Decision |
| --- | --- | --- |
| Polygon | V2 from 81,028,558 | Remove V1 source. |
| Optimism | V2 from 145,788,454 | Remove V1 source. |
| Ethereum | V2 from 24,427,441 | Remove V1 source; source/build change only. |
| Arbitrum | V2 from 430,646,886 | Remove V1 source; source/build change only unless activated separately. |
| Celo | V2 from 58,841,368 | Remove V1 source; source/build change only. |
| Gnosis | V1 through 41,490,893; V2 from 41,490,894 | Preserve existing split. |
| Base | V1 through 33,907,400; V2 from 33,907,401 | Preserve existing split in Graph and active squid. |
| Robinhood | V2 from configured marketplace start 59,578,054 | Preserve existing V2-only squid configuration. |

Evidence for removing redundant V1 sources:

- [Original Polygon/Optimism deployment commit `5068036`](https://github.com/valory-xyz/autonolas-marketplace/commit/5068036d19f05ea598418c8894bf4982d4233c74) introduces the same marketplace proxy addresses used by our manifests. [Contract source at that deployment](https://github.com/valory-xyz/autonolas-marketplace/blob/5068036d19f05ea598418c8894bf4982d4233c74/contracts/MechMarketplace.sol) already declares V2 events: request payload arrays, two delivery byte fields and non-indexed `MarketplaceDelivery.requesters`.
- [Original Ethereum/Arbitrum/Celo deployment records in `ad71fd4`](https://github.com/valory-xyz/autonolas-marketplace/commit/ad71fd4b9892a4e7b0f76b294c4fde6b18663b34) introduce their current proxy addresses; [source at that commit](https://github.com/valory-xyz/autonolas-marketplace/blob/ad71fd4b9892a4e7b0f76b294c4fde6b18663b34/contracts/MechMarketplace.sol) has the same V2 event shapes. No V1 period is indicated for those proxies by these deployment records.
- The local ABI comparison confirms identical `CreateMech` and `MarketplaceDeliveryWithSignatures` registrations in both versions. `MarketplaceRequest` and individual `Deliver` differ in parameter types. `MarketplaceDelivery` retains the same event signature but changes which fields are indexed, so retaining an overlapping V1 decoder is not an appropriate compatibility strategy.

### Replay and release decisions

Build one combined corrected version where possible and fully reindex Gnosis, Polygon, Optimism, Base and Robinhood. This rebuilds the global off-chain counter, removes duplicate historical processing and restores advertised rates from creation/price-update events. Keep #142 independently releasable if necessary, but account for a full replay for that release too. Disabled chains receive source/build coverage only. Reconciliation against event counts and charge records remains implementation validation, not an unresolved design choice.

New factory addresses, creation blocks and final deployed artifacts remain external rollout inputs. Once published, update all required manifest/factory/template/payment/currency mappings; individual mech discovery remains automatic.

## Proposed calendar and ownership

Dates are targets, assuming one implementer plus reviewer/ops availability. Owners below are roles to assign, not confirmed individual commitments.

| When | Work | Owner | Deliverable / gate |
| --- | --- | --- | --- |
| Fri 23 Oct | Focus on implementing and testing #142, including missing rate-update subscriptions and squid parity. | Indexer maintainer | Aim for a reviewable fix; no #140/#143 implementation commitment today. |
| Mon 26 Oct | Finish/review #142 and address feedback; begin #140 once #142 is ready. | Maintainer + reviewer | Blocking code fix ready; start historical-counter correction next. |
| Tue–Wed 27–28 Oct | Complete #140, including the global counter in Graph and squids, then implement #143's audit and documentation. | Maintainer + reviewer | Sequential implementation; prepare one combined release to avoid duplicate full replays. |
| Thu–Fri 29–30 Oct | Finish review/validation and start full reindexing of the combined corrected versions. | Maintainer + reviewer + ops | Target release/reindex start; catch-up continues in subsequent weeks. |
| Once contracts/factories are deployed | Add verified new factory addresses, start blocks and payment mappings; record upgrade blocks. | Maintainer + ops | Configuration covers new deployments; ensure coverage from each new factory’s creation block. |
| After first variable-price delivery and indexer catch-up | Compare the real charge with indexed raw/USD values and verify the advertised maximum remains unchanged. | Maintainer + mech team | Production validation for that chain. |
| Approximately 1–1.5 weeks after a Gnosis replay starts | Finish Gnosis catch-up and reconcile counts/fees. | Ops + maintainer | Indicative indexing estimate, followed by validation; Gnosis is not affected by #140's overlap but will be fully reindexed to populate the new historical global off-chain counter and replay the corrected handlers; no new off-chain fee coverage is planned. |
| Following weeks, per chain | Complete slower replays, validate corrected endpoints and switch consumers individually. | Ops + maintainer + consumer owners | No universal end-of-next-week completion commitment. |

Estimated engineering effort: roughly 2–3.5 working days, excluding review queues, historical replay and waiting for live transactions. Indexing is a separate elapsed-time dependency. For example, a Gnosis replay starting 30 October would provisionally finish around 6–10 November, before any additional validation time; other chains may take several weeks. These are planning estimates, not guaranteed dates. Record each chain's replay start, indexed block, lag, measured throughput and revised ETA.

A deployed but catching-up version is not yet the production fix. Consumer cutover and variable-pricing readiness must be assessed per chain once the corrected endpoint has caught up. Existing endpoints and workarounds remain in use during replay.

## Release checks and contingency

- Run the focused regressions and the marketplace test suite, and codegen/build every affected Graph manifest. Run the corresponding squid checks for Robinhood. Historical replay is required in addition to unit tests.
- Before switching an endpoint, confirm it is synced, has no indexing errors, and reconciles counts and actual fees at a common block. Keep the previous endpoint available during validation.
- Before enabling variable pricing on a chain, ensure #142 is live there. Prefer complete #143 validation as well; if reporting is not ready, coordinate delayed activation with the mech team instead of silently exposing incomplete spend figures.
- Expect some replays to continue for weeks. Keep existing consumer workarounds until the replacement endpoint is validated, and publish per-chain ETAs. Keep #142 independently releasable, but include its own deployment/catch-up time in readiness estimates; merging it does not make a lagging indexer current.
- If contracts are deployed later, continue implementation and historical replay; defer only deployment-specific configuration and live validation. If contracts are deployed while corrected indexers are still catching up, hold variable-price activation on those chains until the blocking correction is serving current data.
- If an endpoint rollback is needed after activation, coordinate pausing variable pricing first: the old rate-overwrite behavior is not a safe fallback for variable charges.

Close #142 after deployment and rate-preservation evidence; #140 after historical reconciliation; #143 after the existing aggregate audit, actual-charge preservation tests, consumer documentation and live cutover verification. Signed-cap storage and off-chain request analytics remain in the data lake/mech-analytics, as confirmed by the product owner; no product scope question remains open on those points.
