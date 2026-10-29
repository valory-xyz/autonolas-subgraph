# Dynamic mech pricing: indexing implementation plan

Prepared against repository revision `80d09c0`; updated 29 October 2026 following implementation of #140 and the #143 current-mech rate guard.

Status: #140 implementation is complete in [PR #156](https://github.com/valory-xyz/autonolas-subgraph/pull/156). Manifest and handler tests pass; deployment, full reindexing and historical reconciliation remain. #143 subscriptions, field/reporting documentation, aggregate audit and signed-only lifecycle regressions are implemented in [PR #158](https://github.com/valory-xyz/autonolas-subgraph/pull/158). The current-mech guards and regressions are included in this PR; the Graph suite (111 tests), Squid suite (84 tests) and Squid build pass. Deployment-time verification with a live variable-price settlement remains. Then start one combined replay per active chain once verified new-factory configuration is included. Contract deployment is expected that week, but exact dates remain external inputs. Allow approximately 1–1.5 weeks for Gnosis indexing and potentially several weeks elsewhere, measured from each replay's actual start. No weekend work is assumed.

## Scope and priorities

| Priority | Issue | Outcome / dependency |
| --- | --- | --- |
| 1 (in review) | [#140 — duplicate data sources](https://github.com/valory-xyz/autonolas-subgraph/issues/140) | Implemented in [PR #156](https://github.com/valory-xyz/autonolas-subgraph/pull/156): duplicate event coverage removed and global off-chain counter added. Deployment, full replay and reconciliation remain; combine with final factory configuration. |
| 2 | [#143 — cap-and-actual reporting](https://github.com/valory-xyz/autonolas-subgraph/issues/143) | The subscriptions, field documentation and signed-only tests are implemented in PR #158. This PR adds current-`Mech.address` guards for rate updates and delivery recovery; recovery fills only a missing maximum. Deployment records, full replays and a real variable-price settlement remain for live validation. |
| Closed; no fix planned | [#142](https://github.com/valory-xyz/autonolas-subgraph/issues/142) | The signed path does not call `refreshMechDeliveryRate`. The issue author closed it after correcting the call-site interpretation. It is not an activation gate. |

The reviewed cap-and-actual approach supersedes the original scope document's exact-price premise. Contract changes, quote endpoints, tool costing and buyer changes remain in their respective repositories. This plan does not require holding variable-pricing activation for #142 or pausing it during endpoint rollback.

## Deployment and replay scope

| Network | Backend / action |
| --- | --- |
| Gnosis, Polygon, Optimism | Active Graph deployments: implement changes and fully reindex. |
| Base, Robinhood | Active marketplace squids: equivalent schema/model/counter changes and full reindexing. |
| Ethereum, Celo | Identical relevant Graph source/manifest changes and build checks; remain turned off. |
| Arbitrum | Source/manifest correction and build coverage because #140 names it; no active production rollout assumed. |
| Mode | Excluded. |

Full reindexing remains the agreed strategy for all five active deployments, including squids. Trigger one combined replay per chain only after the final factory addresses, creation blocks, event formats and payment/currency mappings are configured and tested. An unregistered factory can leave `Mech.maxDeliveryRate` null, causing mech-interact and trader to skip that mech. Do not start a long replay with incomplete factory configuration merely because the handler changes are ready.

Gnosis has no V1/V2 overlap, so the duplication bug alone would not prohibit grafting. However, this release adds an all-time `Global.totalOffChainRequests` counter that the old state does not contain. A graft alone would not reconstruct it. Full replay is retained as requested; a future graft alternative would need verified historical initialization, schema compatibility and coverage of any other changed historical behavior.

Existing URLs remain supported and consumers switch gradually after validation. New-factory configuration may arrive at different times per chain; each chain can start its combined replay independently.

## Confirmed scope

- **Signed cap stays in the data lake.** The product owner confirmed that the advertised mech maximum stored separately from actual delivery charges is sufficient here. Do not add or infer a signed-cap field.
- **Keep the existing off-chain architecture.** Off-chain request analytics remain in the data lake/mech-analytics; aggregate settlement fees have the separate mech-fees indexer. Do not create off-chain `Request` entities or broaden marketplace USD aggregation. The existing on-chain-request/fee-unit guard means signed-only deliveries do not universally populate `Request.finalFeeUSD`.
- **#142 was a call-path misreading.** In Graph, `processOnChainDeliver` calls the rate-refresh helper; `persistSignedDeliver` does not. The squid has the equivalent separation. Do not remove the on-chain helper as a purported signed-pricing fix. The reviewer reports the signed-variable-charge acceptance test already passes; this plan revision did not independently rerun it.
- **Maximum-update subscriptions are included under #143.** Signed-only mechs do not emit the mech-side on-chain `Deliver`, so event subscriptions keep their advertised maximum current. All four mech templates on each supported Graph manifest and both active squids subscribe to `MaxDeliveryRateUpdated`. Delivery-based recovery fills a missing maximum only; it never replaces an already known advertised maximum with an actual charge. These code changes and local tests are in PR #158 and can be released before contract deployment. Historical events require a full replay; resuming from an old checkpoint does not backfill them.
- **Delivered means settled, not necessarily successful.** Under the new failed-run policy, failed off-chain tool runs can be settled and charged, so they count as deliveries. Consumers must not interpret delivery counters as successful-tool-run counters.

## Implementation sequence

### 1. Repair duplicate processing and historical counters — #140

1. Completed the V1-only log check below before removing sources; all five queried chains returned zero events over complete ranges.
2. Removed redundant V1 marketplace sources from Polygon, Optimism, Ethereum, Arbitrum and Celo, retaining V2 at existing start blocks. Preserved Gnosis/Base boundaries.
3. Added `Global.totalOffChainRequests`, initialized every Global creation path and incremented by `numDeliveries`, not one per batch. Included both marketplace squids, generated models and schema migrations.
4. Added multi-request signed-batch tests across Global, Sender, RequestsPerAgent and Mech counters, and manifest coverage checks.
5. Include final factory configuration, deploy the combined version and fully reindex. Do not reuse inflated historical state.
6. At a common indexed block, reconcile fully paginated signed-event `numDeliveries`, sender off-chain counts and the new global counter. Batch-event counters must equal event counts. Reconcile other shared handlers separately; do not halve all totals mechanically.

### 2. Keep advertised maxima current and audit actual-charge reporting — #143

1. Update schema descriptions, comments and query examples with this field mapping:

| Field | Meaning |
| --- | --- |
| `Mech.maxDeliveryRate` | Advertised mech maximum, separate from the amount a signed delivery charges. |
| `Request.feeRaw` / `Request.feeUSD` | Advertised-rate snapshot where available; not proof of the signed cap or actual payment. |
| `DeliverForMarketplace.deliveryRate` | Actual settlement charge in the payment type's raw units. |
| `Request.finalFeeUSD` | Actual USD charge for on-chain marketplace Requests whose priority mech had a fee unit recorded at request time; signed-only deliveries create no `Request` entity. |
| Delivery status / counters | Settlement, including charged failed off-chain runs; not proof of successful tool execution. |

2. Verify signed delivery records preserve actual charges. Keep the existing data-lake and mech-fees reporting responsibilities.
3. Audit existing fee sums/averages and derived fields. Within their existing coverage, spend must use actual charges rather than advertised-rate estimates. Check Graph and both active squids, including USDC/USDG units.
4. Test unequal charges, equal-to-maximum charges and a **mixed zero/nonzero batch**. A batch with all charges zero reverts in the balance tracker and is not a valid successful-settlement fixture. Check existing on-chain totals, handler ordering and currency conversion. Preserve raw charges when conversion is unavailable.
5. Record contract upgrade and first variable-price settlement blocks/transactions separately, per chain. Document any backfills and coverage limits. Historical USD estimates need not equal actual USD charges because conversion timing can differ.
6. Provide field mapping, endpoint versions and cutover records to `mech-analytics`, `townhall-kpis`, `olas-website`, `trader`, `predict-api`, **`autonolas-frontend-mono`** and **`mech-interact`**. Frontend-mono reads the Request fee fields and `DeliverForMarketplace.deliveryRate`; mech-interact reads `Mech.maxDeliveryRate`, `receivedRequests` and `selfDeliveredFromReceived`. The frontend's existing rendering of all signed charges as 18-decimal native currency misdisplays USDC; record that as a separate consumer-side fix, not an indexer conversion change.
7. **Implemented in PR #158; current-address guard in this PR:** Register `MaxDeliveryRateUpdated(uint256)` on all four mech templates in every applicable Graph manifest and subscribe in both active squids. Apply rate updates and delivery-based recovery only when the emitting address matches the current `Mech.address` for that service, since `Mech` is keyed by service ID and older mech addresses remain mapped to it. Delivery recovery fills only a null maximum; delivery charges cannot overwrite a known maximum. Manifest tests pin expected templates. Enable the changes with full replay on each affected deployment because checkpoint restarts do not backfill newly subscribed events.
8. **Implemented in PR #153:** Add Graph and Squid regressions for multiple mechs under one service: an older mech's `MaxDeliveryRateUpdated` must not change the current mech's maximum, and an older mech's `Deliver` must not fill the current mech's missing maximum. Keep the existing lower-charge regression (update to 120, on-chain charge 100) and signed-only lifecycle coverage. Local validation does not substitute for replay or a real settlement after deployment.

No pricing-event ABI change is expected. Explicit nonces do not require request-ID derivation changes in the indexers, which use emitted IDs. New factory artifacts still require verification and configuration.

## Evidence and remaining validation

### Historical V1/V2 coverage

The investigation compared local V1/V2 ABIs, manifest history, original contract deployment records and contract source at those deployment commits. This is repository/deployment-record evidence, not a claim of a complete independent RPC scan of all historical logs.

| Chain | Retained marketplace coverage | Decision |
| --- | --- | --- |
| Polygon | V2 from 81,028,558 | Removed V1 after the log check. |
| Optimism | V2 from 145,788,454 | Removed V1 after the log check. |
| Ethereum | V2 from 24,427,441 | Removed V1 after the log check; source/build change only. |
| Arbitrum | V2 from 430,646,886 | Removed V1 after the log check; source/build change only unless activated separately. |
| Celo | V2 from 58,841,368 | Removed V1 after the log check; source/build change only. |
| Gnosis | V1 through 41,490,893; V2 from 41,490,894 | Preserve existing split. |
| Base | V1 through 33,907,400; V2 from 33,907,401 | Preserve existing split in Graph and active squid. |
| Robinhood | V2 from configured marketplace start 59,578,054 | Preserve existing V2-only squid configuration. |

Evidence for removing redundant V1 sources:

- [Original Polygon/Optimism deployment commit `5068036`](https://github.com/valory-xyz/autonolas-marketplace/commit/5068036d19f05ea598418c8894bf4982d4233c74) introduces the same marketplace proxy addresses used by our manifests. [Contract source at that deployment](https://github.com/valory-xyz/autonolas-marketplace/blob/5068036d19f05ea598418c8894bf4982d4233c74/contracts/MechMarketplace.sol) already declares V2 events: request payload arrays, two delivery byte fields and non-indexed `MarketplaceDelivery.requesters`.
- [Original Ethereum/Arbitrum/Celo deployment records in `ad71fd4`](https://github.com/valory-xyz/autonolas-marketplace/commit/ad71fd4b9892a4e7b0f76b294c4fde6b18663b34) introduce their current proxy addresses; [source at that commit](https://github.com/valory-xyz/autonolas-marketplace/blob/ad71fd4b9892a4e7b0f76b294c4fde6b18663b34/contracts/MechMarketplace.sol) has the same V2 event shapes. No V1 period is indicated for those proxies by these deployment records.
- The local ABI comparison confirms identical `CreateMech` and `MarketplaceDeliveryWithSignatures` registrations in both versions. `MarketplaceRequest` and individual `Deliver` differ in parameter types. `MarketplaceDelivery` retains the same event signature but changes which fields are indexed, so retaining an overlapping V1 decoder is not an appropriate compatibility strategy.

### Required on-chain absence check before deleting V1 sources

For Polygon, Optimism, Ethereum, Arbitrum and Celo, query `eth_getLogs` at the marketplace proxy from the retained V2 start block through a recorded finalized block. Use an OR filter in topic0 for the V1-only signatures `MarketplaceRequest(address,address,uint256,bytes32[])` and `Deliver(address,address,bytes32,uint256,bytes)`. Record chain, proxy, range, topic hashes, result counts and provider. One request per chain is sufficient only if the provider accepts the full range; otherwise page the entire range without gaps. A provider error or truncated response is not evidence of zero events.

**Status: V1-only queries completed on 26 October 2026.** All five chains returned zero matches over complete ranges ending at pinned finalized blocks; see the [query evidence and exact ranges](subgraphs/marketplace/docs/v1-event-check-2026-10-26/README.md). Optimism was checked on two providers. Representative shared-signature layout validation is complete for Polygon and Optimism; Ethereum, Arbitrum and Celo have no shared-signature deliveries in their scanned ranges. `MarketplaceDelivery` has the same topic0 across versions despite different indexed fields, so it is not covered by this V1-only filter; retain the deployment/ABI evidence and verify topic counts in representative historical delivery logs as part of the compatibility check.

## Timing and release checks

| When | Work / result |
| --- | --- |
| Mon 26 Oct | #140 implementation and V1-only log validation complete in PR #156; run review and merge when approved. |
| Tue 27 Oct | #143 indexer code and local regressions in PR #158; review and merge. Prepare deployment records, full replay and live settlement verification. |
| Once final factory deployment records are available | Configure and test all factories for a chain, then start its single combined full replay. No fixed replay-start promise before that input is available. |
| Approximately 1–1.5 weeks after Gnosis replay starts | Catch-up and reconciliation, followed by consumer cutover. Other chains can take several weeks. |
| After a real variable-price settlement is indexed | Verify raw charge, applicable USD conversion and the separate advertised maximum; record cutover evidence. |

The #143 code and local validation are in PR #158. Remaining work is review, contract deployment, full replays, per-chain reconciliation and live verification after a variable-price settlement. Signed-only USD aggregation is outside this release's current Request-based fee totals; the data lake already stores signed prices, and indexed signed-only USD totals are a separate follow-up. #140 implementation and log investigation are complete. Indexing time is separate. Publish per-chain replay start, progress and ETA; do not equate a deployed but lagging version with current corrected data.

Run focused regressions, marketplace tests, codegen/build for affected manifests and corresponding checks for both active squids. Before switching endpoints, require catch-up, no indexing errors and count/fee reconciliation. If contract deployment is delayed, finish code and tests but wait for final factory configuration before the combined replay. Existing endpoints/workarounds remain available during indexing; no #142-based activation or rollback gate applies.

Close #140 after historical reconciliation and #143 after its subscription fixes and signed-only maximum-update tests, aggregate audit, documentation and live verification. #142 is already closed. The #140 implementation is in PR #156; V1-only log validation and representative shared-signature layout checks are recorded in the linked evidence. Full replay and historical reconciliation are still required before closing #140.
