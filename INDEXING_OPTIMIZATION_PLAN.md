# Indexing Speed & Optimization Plan

**Generated:** 2026-07-06 · **Method:** 24-agent workflow — per-subgraph performance audits (deep on the four slow ones: predict-polymarket, pearl-transactions, marketplace, predict-omen), every finding adversarially re-verified for both existence *and fix feasibility* against graph-node v0.40.1, plus a mechanical manifest/schema survey of all packages and a web-research pass on graph-node capabilities. **77 confirmed findings** (3 refuted).

## Executive summary

**The master key is specVersion lag, not exotic fixes.** The toolchain (graph-cli 0.98.1 / graph-node 0.40.1) supports specVersion 1.3.0 with pruning (≥1.0), timeseries aggregations (≥1.1), and declared eth_calls + topic filters (≥1.2) — but most manifests sit at 1.0.0 or 0.0.5, and **declared eth_calls are used nowhere in the repo** despite marketplace already being on 1.2.0. Five packages have no `indexerHints: prune` at all (autonolas, autonolas-base, babydegen-mode, service-registry, tokenomics). A day of manifest bumps unlocks the whole modern toolbox.

**Corrections to commonly-cited performance concerns** (each verified against code):

| Cited concern | Verdict |
|---|---|
| marketplace: blocking inline IPFS fetches (`agent-mech.ts`, `marketplace/utils.ts`) | **Half stale.** The marketplace path moved to file data sources (commits `4589b46`/`fa54999`) — fetches are async and off the critical path. Still true for the **legacy AgentMech path** (`src/agent-mech.ts:106,111`, up to 2 blocking `ipfs.cat` per Request/Deliver) — which is the bulk of Gnosis history and dominates any re-index. The `utils.ts` sync path is test-only dead code. |
| marketplace: token-price lookups re-fetched per delivery (`fee-utils.ts`) | **Nuanced.** On Gnosis, native-xDAI conversion (the dominant payment type) is pure math — zero eth_calls. Real for OLAS-paid mechs (2 Balancer calls/conversion) and for native fees on the other 6 networks (1 Chainlink call/conversion). Not the main Gnosis-slowness explanation. |
| pearl-transactions: repeated eth_calls on the Transfer path (`src/utils.ts`) | **Stale.** No per-event eth_calls exist on the Transfer hot path — the discard cost is **6 store point-lookups per firehose event**. (Kernel of truth: an unguarded `getOwners()` probe repeats forever on registry/staking events — warm path, not hot.) Also: this repo's pearl-transactions is the **Gnosis-only port** (4 chain-wide streams: WXDAI, USDC, USDC.e, OLAS ≈ **106k events/day** measured); the Polygon/pUSD multi-network variant lives in the canonical repo — fixes must land there per the sync policy. |
| predict-omen: settled-guard early-exits as the mitigation | **Wrong mitigation.** No settled-guard exists in `handleBuy`/`handleSell` — and adding one would make things *worse*: settled markets emit no Buy/Sell events, so the guard would burn an extra store read per live trade to skip ~nothing. The real cost of the ~15k-template watch-list is the growing `eth_getLogs` address filter, which no handler code can reduce. Re-platform is the only complete fix (confirmed: no graph-node version can retire a dynamic data source — open issues #1921/#3504). |
| predict-polymarket: chain-wide pUSD + exchange-wide OrderFilled | **Confirmed, handler code already optimal.** >99.9% discard on both streams; the drag is structural event delivery. This is the quantified argument for the planned Envio re-platform. |
| graph-node has no way to stop tracking a contract (Omen) | **Confirmed** with precision: `endBlock` exists for *static* dataSources (specVersion ≥0.0.9 — polymarket already uses it to retire v1 exchanges) but there is **no retirement mechanism for dynamic templates** in any graph-node version. |

**Where the actual time goes, per slow subgraph:**

1. **predict-polymarket (Polygon):** two structural firehoses (pUSD Transfer + 2× OrderFilled exchange-wide, each >99.9% discard). A static `topic1` filter on pUSD is *technically* possible after a specVersion bump but operationally fragile (safe set changes on new registrations; a missed top-up is unrecoverable by redeploy). **Verdict: confirm Envio; spend nothing here beyond the cheap oracle-gate on `getCollectionId`/`getPositionId`.**
2. **pearl-transactions (Gnosis port):** 4 token firehoses × 19.2M blocks of history, 6 store reads per discarded event, plus ~7.3M blocks of guaranteed-100%-discard history (startBlock 27.87M predates the first possible Pearl safe). Quick wins: **raise startBlocks** (hours, manifest-only), **delete the wired-but-no-op ExecutionSuccess handlers** (hours), then a re-index bundle: merged `TrackedAddress` lookup (6→2 reads) + immutable lookup tables.
3. **marketplace (Gnosis):** the remaining sync-IPFS is confined to the legacy AgentMech path — port the already-shipped file-data-source mechanism to it (1-2 days); it pays off on the next from-genesis re-index, which is exactly when the legacy region hurts. Plus: hardcode immutable Balancer pool IDs, add a `PriceCache` entity with block-based refresh, dedupe the double USD conversion per delivery.
4. **predict-omen (Gnosis):** biggest handler-level win is **making `Bet` (highest-cardinality entity) immutable** by dropping the settlement flag-flips, pre-accumulating Brier sums on `MarketParticipant` at bet time (settlement then touches ~no Bet rows), and `@derivedFrom` for the bets array. All breaking → one re-index bundle, which matches the re-index-over-graft strategy. The template growth itself: accept or re-platform.

**Off the slow list but material:** babydegen-mode has the repo's worst per-event eth_call (unconditional `ownerOf` on every Velodrome CL event chain-wide, before any guard) **plus in-memory Map "caches" that don't actually work** (graph-node instantiates a fresh WASM instance per handler — module globals never persist), plus 14 chain-wide token streams and no pruning. service-registry ("too complex for the graph") is the biggest modernization outlier: specVersion 0.0.5, 0/16 entities immutable, no prune, Global rewritten on every safe tx. autonolas-base has unguarded eth_calls/casts that deterministically crash indexing — those must be fixed before any speed work; and both legacy registries can adopt file data sources **without** waiting for the Tier 3 Wave 3 toolchain migration (specVersion 0.0.7 is enough and graph-cli 0.64.0 accepts it).

## Priority matrix

| Tier | Change | Cost | Class |
|---|---|---|---|
| **Q — quick wins, graft-safe, this week** | pearl: raise token startBlocks; delete no-op ExecutionSuccess handlers · polymarket: oracle-gate the CTF eth_calls · omen: manifest hygiene · babydegen: `prune: auto` + kill dead scheduler work · marketplace: hardcode pool IDs, dedupe double conversion · staking: cache the 2 per-event proxy calls in an entity · service-registry+tokenomics: specVersion bump + `prune` | hours each | Option A code |
| **R1 — re-index bundles (per subgraph, schema-breaking, batch everything)** | omen: Bet immutable + Brier accumulators + derivedFrom + Bytes IDs · pearl: TrackedAddress merge + immutable lookups · mech: FDS for request/deliver + Request immutable · marketplace: legacy-path FDS + Deliver immutable + Bytes IDs · service-registry: timeseries/aggregation redesign + immutability sweep | days each | Option A code |
| **R2 — legacy registries** | autonolas-base: fix deterministic crashes (prereq), kill dead 4-probe IPFS, dedupe calls, then FDS at specVersion 0.0.7 · autonolas: same FDS route + event-derived owner | days | Option A code |
| **I — infra (parallel to all of the above)** | general tooling levers: per-deployment metrics dashboards, write-batching for backfills, block-cache hygiene, and (for the heaviest chains) compute isolation across index nodes — see Part 4 | config | Option A infra |
| **P — re-platform** | predict-polymarket → Envio (confirmed by findings; already planned) · predict-omen → strongest second candidate (template growth is unfixable in graph-node) | per plan | Option B |


---

# Part 1 — Per-subgraph findings

Ordered slowest-first. Every finding was adversarially verified for existence and fix feasibility; "Verifier note" records corrections. Findings marked FIX-INFEASIBLE kept the problem but had their fix rejected.


## 1. `predict-polymarket` — 7 findings (1 refuted)

**Baseline profile:**

- **specVersion**: 1.0.0 (blocks declared eth_calls and static topic filters, both need >=1.2.0)
- **apiVersion**: 0.0.7
- **data_sources**: 14 static dataSources, 0 templates. High-volume chain-wide: pUSD ERC20 Transfer (all Polymarket collateral flow, subgraph.yaml:396), CTFExchangeV2 + NegRiskCTFExchangeV2 OrderFilled (every Polymarket v2 trade, :224/:250), ConditionalTokens ConditionPreparation + PayoutRedemption (every Polymarket market + every user redemption, :44), UmaCtfAdapter/OptimisticOracleV3 question streams (every market, :74/:103), NegRiskAdapter (:132). Retired via endBlock: CTFExchange v1 + NegRiskCTFExchange v1 (86750000), 2 old collateral adapters (86263778). Grafted onto QmNUEbu... at block 86236542.
- **eth_call_sites**: 1 distinct .bind site: src/conditional-tokens.ts:105 (ConditionalTokens.bind), issuing try_getCollectionId + try_getPositionId twice per binary ConditionPreparation (4 try_calls per new Polymarket market). No other eth_calls anywhere.
- **ipfs_sites**: none — no ipfs.cat and no file data sources
- **immutable_entities**: 8 of 14 immutable (TraderService, QuestionIdToConditionId, Question, MarketMetadata, TokenRegistry, QuestionResolution, PayoutRedemption, MarketParticipated). Mutable by necessity: TraderAgent, Bet (countedIn* flags set at resolution), MarketParticipant, Global, DailyProfitStatistic. DepositWallet is logically immutable but deliberately declared mutable to dodge a graft-copy bug (schema.graphql:29-35, documented).
- **templates**: none — no dynamic data sources; DW discovery is done via the pUSD Transfer stream instead of templates (store-reads only)
- **prune**: prune: 300 (subgraph.yaml:15-16) — already set, history bounded

### 1.1 🔴 HIGH · chain-wide-subscription — pUSD global Transfer stream: >99.9% of events discarded, trigger density ~every Polygon block

**Why it's hot:** pUSD is the collateral token for ALL Polymarket CLOB v2 users. Every deposit, withdrawal, DW top-up and settlement flow for the entire platform emits Transfer — order 10^5-10^6 events/day. The subgraph only needs the just-in-time safe->DW top-up for agent-86 safes (order 10^2-10^3/day at most).

**Current behavior:** handleCollateralTransfer runs for every pUSD Transfer on Polygon. First op is TraderAgent.load(event.params.from) (deposit-wallet.ts:12-13) which discards non-agent transfers — the handler itself is already minimal (1 store read then return). The cost is not the WASM body: graph-node must match, fetch, decode, and dispatch every Transfer log into WASM, making the subgraph process essentially every Polymarket-active block. Kept fraction is roughly 1e-3 or less; the ~230x figure (pUSD events vs WalletDeployed factory events) is a conservative floor since only agent-safe outflows among those are kept — effective discard ratio >=99.9%.

**Evidence:** subgraph.yaml:396-419 (pUSD dataSource, Transfer(indexed address,indexed address,uint256) -> handleCollateralTransfer); src/deposit-wallet.ts:10-25

**Fix:** Interim relief inside graph-node: bump specVersion 1.0.0 -> 1.2.0 and add a static topic1 filter on the Transfer eventHandler listing the current agent-86 safe addresses (topic1 = indexed `from`). The safe set is dynamic in principle but changes rarely (new agent-86 service registrations); each new safe requires a manifest edit + redeploy, and transfers from a safe registered between deploys are missed until redeploy (DW link lost -> that DW's trades dropped). Manifest-only change, schema untouched -> graft-safe onto the current deployment. Long-term: this is exactly what the Envio WalletDeployed-factory redesign eliminates — this finding confirms that plan.

**Effort:** hours (specVersion bump + topic filter + regenerate safe list); ongoing operational cost per new safe · **Risk:** Medium operational risk: missed DW links for safes added after the last redeploy silently drop those agents' v2 trades. Graft-safe. If the redeploy-per-new-safe burden isn't acceptable, there is no other graph-node mitigation — which is itself confirmation of the Envio plan.

**Cross-check:** handler ordering is already optimal; the drag is structural (event delivery volume), not handler code.

> **Verifier note:** One sharpening: a safe registered between deploys is not merely missed 'until redeploy'. The DW link is derived from a one-shot top-up Transfer; if that event is skipped by the filter, a later redeploy grafted at head does NOT recover it — you must graft at a block before the missed transfer (each rescue re-indexes the gap) or the DW's trades are lost permanently. Also, topic1 values must be the 32-byte topic encoding (left-padded addresses). Given the Envio WalletDeployed-factory migration already planned, this stopgap's operational risk (silent data loss on every new agent-86 registration until someone edits the manifest) may not be worth it.

### 1.2 🔴 HIGH · chain-wide-subscription — CTFExchangeV2 + NegRiskCTFExchangeV2 OrderFilled are exchange-wide (every Polymarket trade); early-exit ordering already optimal, no graph-node fix exists

**Why it's hot:** OrderFilled fires for every fill on both v2 exchanges — the full Polymarket order book, order 10^5+ events/day. Agent trades are order 10^2/day -> discard ratio >99.9%.

**Current behavior:** handleOrderFilledV2 does TraderAgent.load(maker), then DepositWallet.load(maker), then returns (ctf-exchange-v2.ts:19-25) — 1-2 store reads before discard, with all BigInt math, TokenRegistry lookup, and entity writes correctly placed after the guard. No entity is created or saved before the discard. The residual per-event cost (log decode + WASM dispatch + 1-2 cache-backed loads) is intrinsic to a chain-wide subscription.

**Evidence:** subgraph.yaml:224-275 (two v2 exchange dataSources); src/ctf-exchange-v2.ts:19-25 (guards), 44-54 (post-guard work); v1 equivalents subgraph.yaml:162-219 already retired via endBlock 86750000

**Fix:** No code change available in graph-node. This stream plus pUSD together are the structural argument for the Envio re-platform (HyperSync wildcard-filtered fetch + DW-factory join). Keep as-is until cutover; do not spend effort here.

**Effort:** n/a (nothing to change) · **Risk:** none

**Cross-check:** confirmed that the dataSources are exchange-wide; the implied concern about pre-discard work is stale — ordering is already optimal. A static topic filter is NOT applicable here: maker under Path A is a per-user DepositWallet whose address is unknowable before its first top-up (dynamic set).

### 1.3 🟡 MEDIUM · eth-call — 2 serial eth_calls (getCollectionId + getPositionId) per binary ConditionPreparation — once-per-market, but the market stream is chain-wide and ~99% of markets are never agent-traded

**Why it's hot:** ConditionPreparation fires for every condition prepared on Polymarket's shared ConditionalTokens contract (all users' markets, incl. every negrisk sub-question) — order 10^2-10^3/day live, order 10^5 cumulative since startBlock 78425180. 4 try_calls total per new binary condition (2 per outcome token), executed serially and blocking the block.

**Current behavior:** Every binary condition triggers 4 blocking eth_calls regardless of whether any agent ever trades that market (~99%+ never do). Live-head impact is modest (minutes/day of RPC latency); on a genesis re-index it is order 10^5-10^6 serial eth_calls -> plausibly hours-to-a-day of pure RPC round-trip time, a major slice of full-sync wall clock. Cannot be deferred to trade time: v2 OrderFilled only carries tokenId, and the keccak/alt_bn128 position derivation is not reversible, so the TokenRegistry rows must exist before the first trade.

**Evidence:** src/conditional-tokens.ts:105 (ConditionalTokens.bind — the only .bind site in the subgraph), :26-30 (try_getCollectionId), :39-42 (try_getPositionId), called twice via registerOutcomeToken at :106-121; guard at :68 (outcomeSlotCount==2) and :72-91 (bridge dedupe) run first

**Fix:** Three compounding options: (a) gate the calls by oracle address — only run registerOutcomeToken when event.params.oracle is UmaCtfAdapter or NegRiskAdapter (Polymarket's oracles), skipping non-Polymarket CTF users (cheap, hours); (b) with the specVersion 1.2.0 bump from the pUSD finding, convert to declared eth_calls (`calls:` on the ConditionPreparation eventHandler) so the calls run in parallel ahead of the handler and are cached — roughly halves the latency per event; (c) maximal: compute positionId locally in AssemblyScript (getPositionId is keccak256(collateral,collectionId); getCollectionId with zero parent is a deterministic alt_bn128 hash-to-curve) — eliminates the calls entirely but requires porting EC math to AS. Recommend (a) only as the interim fix — option (b) is not feasible here (declared eth_calls cannot express these args or chain getCollectionId→getPositionId; see verifier note); (c) only if a genesis re-index is planned before Envio.

**Effort:** (a)+(b): hours-to-1-day incl. tests; (c): days and easy to get wrong · **Risk:** (a): must confirm the full set of Polymarket oracle addresses (UmaCtfAdapter versions + NegRiskAdapter) or agent-traded markets lose TokenRegistry rows and handleOrderFilledV2 drops their trades via the :48 warning path. (b): manifest-only, graft-safe. (c): a wrong hash silently orphans all future trades — needs differential testing against on-chain values.

**Cross-check:** nuanced — the repeated-eth_calls concern is technically per-event, but the event is market creation, not trading, so it is NOT hot in the OrderFilled sense. It is still material on re-index because the stream is chain-wide and unconditional.

> **Verifier note:** Fix (b) — declared eth_calls — is NOT feasible for these calls and should be dropped. Verified against graph-node v0.40.1 source (graph/src/data_source/common.rs): CallArg accepts only 40-char hex ADDRESS literals, event.address, event.params.<name>, and entity.<param>. getCollectionId(ZERO_BYTES32, conditionId, indexSet) needs a bytes32 literal and a uint literal (neither expressible), and getPositionId(collateral, collectionId) needs the RESULT of getCollectionId, which declared calls cannot chain. So neither of the 4 calls can be declared; the interim recommendation reduces to (a) alone. For (a), the allowlist must include BOTH tracked UmaCtfAdapter generations — 0x157Ce2d6... (the 'UmaCtfAdapter' dataSource) and 0x65070BE9... (UMA CTF Adapter V4, mislabeled 'OO V3' in the manifest — see finding 4) — plus NegRiskAdapter 0xd91E80cF..., or all current Polymarket markets lose their TokenRegistry rows and handleOrderFilledV2 drops agent trades.

### 1.4 ⚪ LOW · handler-order — UMA QuestionInitialized parses full ancillary data before the cheap bridge-existence guard

**Why it's hot:** QuestionInitialized fires for every Polymarket market created via UmaCtfAdapter (chain-wide market stream, order 10^2-10^3/day). Ancillary data can be multi-KB.

**Current behavior:** For questions with no bridge entry (non-binary conditions, questions whose ConditionPreparation was filtered, repetitive questionIds) the handler pays Bytes->String conversion plus two substring scans before discarding at the bridge check.

**Evidence:** src/uma-mapping.ts:145-153 — ancillaryData.toString() + extractBinaryOutcomes (full string scans, :90-138) run before QuestionIdToConditionId.load(questionID) at :152; the recursive extractTitle (:21-77) runs after, correctly

**Fix:** Reorder: load the QuestionIdToConditionId bridge first, return if null, then convert/parse ancillary data. Pure mapping change, no schema impact -> graft-safe.

**Effort:** under 1 hour · **Risk:** none — the two guards are independent; reordering changes no outcome. Gain is modest because most binary Polymarket questions do have a bridge, so the guard discards a minority.

### 1.5 ⚪ LOW · derived-from — MarketParticipant.bets is a growing plain array rewritten on every agent bet

**Why it's hot:** Only agent bets reach this path (order 10^2/day), so volume is low; but each bet rewrites the participant's full bet-ID array, and each entity version stores the whole array (quadratic bytes per active participant). prune:300 bounds the history retention, not the per-write cost.

**Current behavior:** Array grows per bet per market; resolution iterates it to flag countedInProfit/countedInTotal.

**Evidence:** schema.graphql:124 (bets: [Bet!]! non-derived); src/utils.ts:151-153 (push + reassign per bet); consumed once at resolution in src/utils.ts:279-287

**Fix:** Add a `participant: MarketParticipant` field to Bet, set it at bet creation, replace MarketParticipant.bets with @derivedFrom(field: "participant"), and use participant.bets.load() (derived-field loader) in processMarketResolution. Adding a nullable field + removing an attribute are both graft-compatible changes.

**Effort:** half a day incl. Matchstick updates · **Risk:** Low; graft-safe per graph-node schema-compat rules (add nullable field, drop attribute). Pre-graft bets would have null participant — the resolution loop must tolerate that or the change should ride the next genesis re-index. Given low agent volume, only worth bundling with other schema work.

> **Verifier note:** Two caveats. (1) Post-graft, pre-existing Bet rows have participant=null, so participant.bets.load() at resolution will skip them — countedInProfit/countedInTotal stay false on old bets of markets resolving after the graft. Harmless to accounting (profit is computed from participant aggregates, the flags are audit-only) but it should be a documented data-quality note. (2) Severity is modest: MarketParticipant is per (agent, market), so the array is typically small; this is an anti-pattern cleanup more than a measurable indexing win.

### 1.6 ⚪ LOW · ids — String IDs on MarketParticipant / DailyProfitStatistic / TraderService where Bytes would work

**Why it's hot:** These entities are only touched on agent-gated paths (low volume), so the string-vs-bytes overhead is minor; listed for completeness against the official checklist.

**Current behavior:** toHexString() concatenation per touch; string PK comparisons in Postgres.

**Evidence:** schema.graphql:113 (MarketParticipant id: ID! = hex-concat string, built at src/utils.ts:124), schema.graphql:156 (DailyProfitStatistic id: ID!, built at src/utils.ts:62), schema.graphql:4 (TraderService id: ID!)

**Fix:** If a genesis re-index happens anyway (e.g., for the eth_call fix or Envio parity testing), switch to Bytes IDs (agent.concat(conditionId), agent.concatI32(day)). NOT graft-safe (changes ID type of existing entities) — re-index only. Do not do this standalone.

**Effort:** half a day · **Risk:** Requires full re-index; breaks any downstream consumer querying by the old string IDs.

### 1.7 ⚪ LOW · write-serialization — Global singleton saved on every agent bet and redemption — acceptable at current volume, already mitigated at resolution

**Why it's hot:** Global writes only occur on agent-gated events (order 10^2/day), and prune:300 (subgraph.yaml:15-16) caps version history. Not a real bottleneck; the resolution path already demonstrates the correct batched pattern.

**Current behavior:** One Global version per agent bet/redemption.

**Evidence:** src/utils.ts:169 (processTradeActivity saves Global per bet), src/utils.ts:353 (processRedemption), contrast src/utils.ts:211-298 (processMarketResolution correctly batches via delta accumulators + single save)

**Fix:** No action needed. If agent volume grows 100x, revisit; otherwise this is fine.

**Effort:** n/a · **Risk:** none


## 2. `pearl-transactions` — 9 findings

**Baseline profile:**

- **specVersion**: 1.0.0 (apiVersion 0.0.7) — toolchain (graph-cli 0.98.1, graph-ts 0.38.2) supports 1.3.0/0.0.9; declared eth_calls, topic filters, and @aggregation are all currently unavailable to this manifest
- **apiVersion**: 0.0.7
- **data_sources**: 7 static (ServiceRegistryL2, ServiceRegistryTokenUtility, StakingFactory, OLAS, WrappedNative/WXDAI, USDC, USDC.e) + 2 templates. High-volume: the 4 chain-wide ERC-20 Transfer streams — live 1h sample at block 47,065,443: WXDAI 2,834 + USDC 1,095 + USDC.e 484 + OLAS 6 ≈ 4,420 Transfers/h ≈ 106k/day ≈ 39M/yr, indexed from block 27,871,084 (~19.2M blocks of history). NOTE: repo is the Gnosis-only port; there is NO subgraph.template.yaml or networks.json here — the multi-network (incl. Polygon + pUSD) source is the canonical autonolas-tokenomics-subgraph repo, and fixes must land there first per CLAUDE.md sync policy
- **eth_call_sites**: 2 .bind() call sites, 4 calls total, all cold/warm path: src/utils.ts:115 (GnosisSafe getOwners + getThreshold at MasterSafe first sighting / non-Safe probe — no negative cache, so probes repeat for non-Safe addresses) and src/staking-factory.ts:30-32 (StakingProxy minStakingDeposit + numAgentInstances, once per allowlisted proxy). ZERO eth_calls on the Transfer hot path — the per-event cost there is 6 store lookups, not RPC
- **ipfs_sites**: none — no ipfs.cat and no file data sources anywhere in src/
- **immutable_entities**: 2 of 17 entities immutable (ServiceNftCustodyChange, AgentBondAttributionGuard). Write-once mutable candidates: TrackedSafe, TrackedEOA, StakingContract, Token — exactly the tables point-read 6x per firehose event. FundsMovement is legitimately mutable (SRTU bond-row backfill) but its high-volume RAW_TRANSFER rows are write-once in practice
- **prune**: auto (subgraph.yaml:2-3) — already set, no action needed
- **templates**: StakingProxy — instantiated per StakingFactory.InstanceCreated gated by a 1-address-per-network implementation allowlist (bounded); Safe — instantiated per Master Safe (utils.ts:177) AND per Agent Safe (utils.ts:238), unbounded/never retired, subscribing 6 event signatures each, of which ExecutionSuccess + ExecutionFromModuleSuccess feed a deliberate no-op handler

### 2.1 🔴 HIGH · chain-wide-subscription — Four chain-wide ERC-20 Transfer firehoses (WXDAI, USDC, USDC.e, OLAS) with >99% in-handler discard

**Why it's hot:** ERC-20 Transfer on the wrapped-native and two stablecoins of an entire chain — the single highest-volume event class on Gnosis. This is THE indexing workload of the subgraph; all other data sources are noise by comparison.

**Current behavior:** Every Transfer event on 4 token contracts chain-wide from block 27,871,084 (~Apr 2023, ~19.2M blocks ago) invokes handleErc20Transfer. Live RPC sample (720 blocks ≈ 1h at block 47,065,443): WXDAI 2,834 + USDC 1,095 + USDC.e 484 + OLAS 6 = ~4,420 Transfers/hour ≈ 106k/day ≈ 39M/yr → order 50–150M events over the indexed range. At this density essentially every Gnosis block contains at least one matching log, so the node can never skip blocks. The tracked set (Pearl Master/Agent Safes + EOAs) is a few thousand addresses; Pearl's share of chain-wide WXDAI/USDC transfer traffic is plausibly <1–5%, so >95–99% of handler invocations end in the classifyTransfer null-discard.

**Evidence:** subgraph.yaml:96-118 (OLAS), 119-141 (WrappedNative WXDAI), 146-168 (USDC), 169-191 (USDC.e) — all startBlock 27871084; src/erc20.ts:29-38 (handler filters via classifyTransfer, returns on null); CLAUDE.md 'Known risk — token-Transfer firehose' section already flags this as the suspected Studio-stall driver

**Fix:** Static manifest topic filters (specVersion >= 1.2.0 topic1/topic2 on Transfer's indexed from/to) are UNUSABLE here: the tracked-safe set is dynamic (safes discovered at runtime via ServiceNftTransfer / ServiceStaked / CreateMultisigWithAgents), and graph-node topic filters only accept static address lists. Real options, in ascending effort: (a) tighten startBlock per token data source to first Pearl-relevant activity (Pearl launched well after the registry deploy; USDC/USDC.e/WXDAI streams gain nothing before the first MasterSafe exists) — bounded one-time gain; (b) drop the USDC/USDC.e (and possibly WXDAI) streams and let the wallet UI fetch stablecoin history via archive RPC, mirroring the existing opening-balance decision (source stablecoin history off-graph rather than in the subgraph) — largest in-graph-node win; (c) re-platform the raw-ledger phase to Substreams-powered subgraph or Envio HyperIndex where server-side dynamic-address filtering exists (precedent: predict-polymarket → Envio for the identical pUSD-stream problem).

**Effort:** hours (a) / days (b, product sign-off) / weeks (c) · **Risk:** (a) graft-safe, manifest-only, loses no data if startBlock <= first Pearl safe; (b) product decision — loses in-graph stablecoin rows and TokenBalance for those tokens, graft-safe as a manifest+handler removal but consumers must migrate; (c) full re-index on a new stack. Any fix must land in the canonical autonolas-tokenomics-subgraph first per the repo sync policy.

**Cross-check:** confirmed in substance, stale in citation: the cited concern points at subgraph.template.yaml and Polygon, but this repo's port is Gnosis-only with a single concrete subgraph.yaml (no template/networks.json — those live in the canonical autonolas-tokenomics-subgraph repo). Tokens subscribed HERE: OLAS, WXDAI, USDC, USDC.e. pUSD is Polygon-only and intentionally absent (subgraph.yaml:142-145). The Polygon deployment (from the canonical repo) runs the same code with 5 streams (OLAS, WPOL, USDC, USDC.e, pUSD — constants.ts:126-186) on a chain with far higher transfer volume, so the Polygon-is-slow observation is consistent but not fixable in this repo.

> **Verifier note:** Minor reinforcement: topic filters are doubly unavailable — besides the dynamic-set problem, the manifest is specVersion 1.0.0, below the 1.2.0 floor for topic filters, so they could not be declared at all without a spec bump (graph-cli 0.98.1 / graph-node 0.40.1 would support the bump, but the dynamic-set problem makes it moot).

### 2.2 🔴 HIGH · handler-order — Discard path costs 6 store point-lookups + 2 network/address resolutions per firehose event

**Why it's hot:** Runs once per firehose Transfer (finding 1) plus once per SafeReceived (safe.ts:33). It is the per-event cost multiplier on the highest-volume stream.

**Current behavior:** For every one of the ~50–150M firehose Transfers, classifyTransfer unconditionally executes 6 entity loads across 3 separate tables (mostly DB misses for untracked addresses) plus 2 dataSource.network() host calls and 2 Address.fromString parses, before concluding 'neither side tracked' and returning null. Multiplied out: order 300M–900M point lookups on the dominant path. Reordering alone cannot skip the loads — a correct null verdict requires checking both sides against all three tables — but the table count and the per-call constant re-resolution are pure overhead. Note utils.ts:736 computes registryAddr eagerly though it is only used in one rare branch (utils.ts:819).

**Evidence:** src/utils.ts:727-736 (classifyTransfer prologue: TrackedSafe.load(from), TrackedSafe.load(to), TrackedEOA.load(from), TrackedEOA.load(to), StakingContract.load(from), StakingContract.load(to), getSrtuAddress(currentNetwork()), getServiceRegistryAddress(currentNetwork())); src/constants.ts:74-89, 102-119 (each resolver = dataSource.network() host call + Address.fromString parse per invocation); src/erc20.ts:35-38 (caller)

**Fix:** (1) Merge TrackedSafe + TrackedEOA + StakingContract lookups into a single TrackedAddress entity (id = address, role = MASTER|AGENT|MASTER_EOA|AGENT_EOA|STAKING, plus masterSafe/service refs) → 2 loads per event instead of 6, ~3x fewer point reads on the dominant path. (2) Hoist SRTU/registry addresses into lazily-initialized module-level globals (network never changes within a deployment) to drop the per-event host calls + hex parsing. (3) Move registryAddr resolution inside the toMaster-MASTER branch.

**Effort:** hours to a day (mapping + schema + Matchstick updates in tests/phase-2a.test.ts) · **Risk:** Change (1) is NOT graft-safe as a clean cut: TrackedAddress rows for safes discovered pre-graft would not exist, silently untracking them — requires re-index (or an unattractive dual-read fallback that makes the discard path worse). Changes (2)+(3) are pure mapping changes, graft-safe. Classification regressions are the correctness risk; the existing test suite covers classifyTransfer.

**Cross-check:** the repeated-eth_calls concern (citing src/utils.ts) is STALE as stated — there are no per-event eth_calls on the Transfer path; the hot-path cost is store reads, not RPC. Static topic filters confirmed unusable (dynamic tracked set).

> **Verifier note:** Fix component (2) is ineffective as stated: graph-node instantiates a fresh WASM instance per handler invocation, so AssemblyScript module-level globals do NOT persist across events — a 'lazily-initialized global' re-initializes every invocation, which is exactly the current cost. The achievable version is only a function-local hoist: compute currentNetwork() once per classifyTransfer call instead of twice (lines 733 and 736 each call it). The real per-event constant-resolution floor cannot be eliminated in the mapping layer. Fixes (1) and (3) stand.

### 2.3 🟡 MEDIUM · dead-weight — ExecutionSuccess / ExecutionFromModuleSuccess handlers are wired but deliberately no-op, still paying a handler trigger + wasted store read per tracked-safe transaction

**Why it's hot:** ExecutionSuccess fires once per Safe transaction; Pearl trader/predict agents transact continuously, and the template set covers every agent safe ever created with no retirement.

**Current behavior:** Every Safe template instance (one per Master Safe AND per Agent Safe, src/utils.ts:177,238) triggers a WASM handler invocation plus one dead MasterSafe.load for every ExecutionSuccess/ExecutionFromModuleSuccess. Pearl agent safes are high-frequency actors (trader agents execute many Safe txs per day each), so across thousands of tracked safes this is a steady stream of block-fetch triggers and pointless store reads that produce zero entities.

**Evidence:** subgraph.yaml:253-256 (both eventHandlers wired on the Safe template); src/safe.ts:87-119 (emitNativeOutPlaceholder is a documented no-op for v1); src/safe.ts:108 (MasterSafe.load(safeAddr) whose result is never used)

**Fix:** Remove the two eventHandlers from the Safe template in subgraph.yaml (and delete the dead handlers/no-op in safe.ts) until the Phase 2b call/trace-handler design actually lands. Fewer trigger types also reduces the blocks the node must run mappings for.

**Effort:** hours (manifest + mapping deletion + test sweep) · **Risk:** Graft-safe: manifest/mapping-only, no schema change; dynamic data sources pick up the new template definition by name on redeploy. No consumer impact — the handlers never emitted anything.

### 2.4 🟡 MEDIUM · immutability — Hot-lookup tables (TrackedSafe, TrackedEOA, StakingContract, Token) are declared mutable though write-once

**Why it's hot:** These tables ARE the discard-path lookup targets of the chain-wide Transfer stream; any per-lookup saving multiplies by 6 x firehose volume.

**Current behavior:** TrackedSafe/TrackedEOA/StakingContract are exactly the tables point-read 6x per firehose Transfer (finding 2). As mutable entities they carry block_range validity tracking, making every one of those hundreds of millions of lookups (and the rare writes) pay range-filtering cost that immutable tables skip (~48% faster per The Graph's own benchmark).

**Evidence:** schema.graphql:232 (TrackedSafe immutable: false), 242 (TrackedEOA), 68 (StakingContract), 223 (Token); write sites confirm write-once: src/utils.ts:590-597, 609-617, 567-576, 631-664 (all early-return if exists, never updated after creation). Only 2 of 17 entities are immutable (ServiceNftCustodyChange schema.graphql:157, AgentBondAttributionGuard schema.graphql:216)

**Fix:** Mark TrackedSafe, TrackedEOA, StakingContract, Token @entity(immutable: true). All four are provably write-once in the mappings. Bundle with finding 2's TrackedAddress merge (the merged table should be born immutable) so a single re-index buys both. MasterSafe/Service/FundsMovement must stay mutable (genuinely updated).

**Effort:** hours (schema + codegen + test run), but delivery requires the finding-2 re-index · **Risk:** NOT graft-safe — changing immutability of an existing entity type is a breaking schema change; requires re-index. Correctness: must verify no future phase intends to mutate these (TrackedEOA.masterSafe null-for-shared-agent-EOA semantics already forbid updates in current code).

> **Verifier note:** One deployment caveat: flipping immutable:false -> true changes the underlying table shape (block_range column -> block column) and is not on graph-node's allowed graft-compatible schema-change list, so this cannot be grafted onto the existing deployment — it requires a from-genesis re-index. The auditor's own bundling advice ('a single re-index buys both') already implies this, so the fix stands as proposed.

### 2.5 🟡 MEDIUM · chain-wide-subscription — Token data-source startBlocks predate any possible Pearl activity

**Why it's hot:** Initial-sync throughput: the earliest segment of the firehose is 100% discard by construction.

**Current behavior:** The four firehose streams index from the registry deploy block, but no Transfer can classify until the first MasterSafe/TrackedSafe is created (Pearl launch is materially later than the registry deploy; SRTU starts at 30095874 and StakingFactory at 35206806, showing the ecosystem ramped over ~7M+ blocks). Every firehose event in the gap between 27871084 and the first Pearl safe is guaranteed-discard work — plausibly millions of events of pure waste during initial sync, which is exactly when the 'slow' complaint bites.

**Evidence:** subgraph.yaml:102, 125, 152, 175 — OLAS/WXDAI/USDC/USDC.e all startBlock 27871084, identical to the ServiceRegistryL2 deploy block (subgraph.yaml:13); classifyTransfer can only match after the first TrackedSafe row exists, which requires a Pearl Master Safe sighting

**Fix:** Set each token data source's startBlock to the block of the first Pearl Master Safe creation on Gnosis (or conservatively the StakingFactory start 35206806 if Pearl-era safes only exist post-staking). One-line manifest change per data source, mirrored into the canonical repo's networks.json.

**Effort:** hours (find first-safe block via existing deployment query, edit manifest) · **Risk:** Graft-safe for a graft above the new startBlock; on fresh re-index only risk is choosing a block after the first real safe — verify against the current deployment's earliest MasterSafe.firstSeenBlock before landing.

> **Verifier note:** Two errors in the evidence narrow the claimed win. (1) The classify gate is NOT 'a Pearl Master Safe sighting': getOrCreateMasterSafe (utils.ts:115-123) promotes ANY Gnosis Safe that receives ANY service NFT — non-Pearl Safe-owned services create TrackedSafe rows too, so the first tracked row likely appears soon after registry deploy, not at Pearl launch; the guaranteed-waste window is plausibly far smaller than the implied ~7M blocks. (2) SRTU counts as a tracked side in the fallback (utils.ts:872-876), so from block 30095874 OLAS transfers touching SRTU classify as OTHER with no TrackedSafe needed. Consequently the safe fix anchor is the first MasterSafe.firstSeenBlock in the current deployment (queryable), NOT 'first Pearl safe' and NOT the StakingFactory block 35206806 — using either later anchor silently drops ERC-20 history for earlier-discovered master safes (breaking the historyFloor contract) and, for OLAS, the SRTU-side OTHER rows after 30095874.

### 2.6 ⚪ LOW · eth-call — getOwners() probe on non-Safe addresses is repeated forever (no negative cache)

**Why it's hot:** ServiceStaked / service-NFT Transfer events — moderate frequency; each miss is a synchronous RPC round-trip that stalls the block.

**Current behavior:** When an address fails the Safe probe (EOA owner, non-allowlisted proxy), no entity records the failure, so the next ServiceNftTransfer or ServiceStaked touching the same address re-issues the getOwners() eth_call (plus getThreshold on success, utils.ts:146). Non-Pearl services with EOA owners re-probe on every stake/unstake cycle. Volume is registry/staking-event scale (thousands to tens of thousands), not firehose scale.

**Evidence:** src/utils.ts:115-123 (try_getOwners revert path returns null WITHOUT persisting anything); callers: src/service-registry.ts:139 (handleServiceNftTransfer, every non-zero non-staking NFT recipient) and src/staking-proxy.ts:48 (handleServiceStaked, every stake event's owner)

**Fix:** Persist a NonSafeAddress marker entity (immutable, id = address) on probe failure and check it before binding; alternatively bump to specVersion 1.2.0+ and declare GnosisSafe[event.params.owner].getOwners() as a declared eth_call on handleServiceStaked so it executes in parallel and is cached. The negative-cache entity is the simpler, complete fix.

**Effort:** hours · **Risk:** Graft-safe (additive entity). Edge case: a CREATE2-deployed Safe appearing later at a previously-probed address would stay blacklisted — acceptable (Pearl safes are probed only after deployment).

**Cross-check:** this is the kernel of truth in the repeated-eth_calls / src/utils.ts concern — real but on a warm path (registry/staking events), not the Transfer hot path; other eth_calls (staking-factory.ts:30-32 minStakingDeposit/numAgentInstances) run once per allowed staking proxy and are fine.

> **Verifier note:** Prefer the negative-cache entity over the declared-call alternative for a second reason beyond simplicity: declared eth_calls (would require bumping specVersion 1.0.0 -> 1.2.0, which graph-cli 0.98.1 and graph-node 0.40.1 do support) execute on EVERY ServiceStaked event, including the common case where the MasterSafe entity already exists and the current code takes the cheap MasterSafe.load early-return without any eth_call — declaring the call would add RPC work to the warm path while parallelizing the cold one.

### 2.7 ⚪ LOW · write-serialization — All raw-transfer ledger rows share the mutable FundsMovement entity though only SRTU bond rows are ever backfilled

**Why it's hot:** One insert per tracked transfer across all Pearl agents; agents trade continuously so this is the dominant write stream.

**Current behavior:** Every tracked Transfer / SafeReceived inserts a mutable FundsMovement row, paying block-range versioning on insert. Volume is tracked-activity scale (Pearl agent trading), orders of magnitude below the firehose but the subgraph's largest table by row count.

**Evidence:** schema.graphql:119-141 (FundsMovement immutable: false, comment: 'All other rows are write-once in practice'); mutation confined to src/utils.ts:470-491 (dequeueAndAttribute backfill of SRTU rows only); high-volume writers src/erc20.ts:40-85, src/safe.ts:36-77 never mutate after save

**Fix:** Split the ledger: keep mutable FundsMovement for SEMANTIC bond rows (which need the PendingBondRow backfill) and add an immutable RawTransfer entity for source=RAW_TRANSFER rows, unified for consumers via a GraphQL interface. Only worth doing if a re-index is already scheduled for findings 2/5.

**Effort:** days (schema, both handlers, consumer/wallet query migration) · **Risk:** NOT graft-safe (schema restructuring) and breaks the wallet UI's single-table FundsMovement query contract — needs coordinated consumer change; bundle with the finding-2/5 re-index or skip.

> **Verifier note:** Slightly understated: the STAKING_REWARD_CLAIM / UNSTAKE_REWARD / SERVICE_EVICTED semantic rows from staking-proxy.ts are also never mutated — only SRTU-produced bond rows need mutability — so the immutable partition could be drawn even wider than RAW_TRANSFER-only if the split is done.

### 2.8 ⚪ LOW · template-growth — Safe template instantiated per Master + per Agent Safe with no retirement; StakingProxy template unbounded

**Why it's hot:** Each dynamic data source adds to the node's per-block log-filter set; terminated/abandoned services keep costing filter width forever.

**Current behavior:** One dynamic Safe data source per Pearl safe ever created (2 per user: master + agent, more for multi-service users), subscribed to 6 event signatures each, never retired even for terminated services (graph-node cannot stop a dynamic data source). Growth is linear in Pearl adoption — thousands today, structurally unbounded. StakingProxy growth is allowlist-bounded (1 implementation per network) and fine.

**Evidence:** src/utils.ts:177 (SafeTemplate.create per MasterSafe), src/utils.ts:238 (per AgentSafe), src/staking-factory.ts:54 (StakingProxyTemplate.create, allowlist-gated at staking-factory.ts:22)

**Fix:** No in-protocol retirement exists; mitigate by (a) landing finding 2.3 (removes 2 of the 6 subscribed events, the highest-frequency ones), and (b) early-exit guards in the remaining Safe handlers are already cheap (MasterSafe.load-first in safe.ts:127,142,164). Accept and monitor; a design-level fix belongs to the same re-platform conversation as finding 1.

**Effort:** covered by finding 2.3; otherwise n/a · **Risk:** n/a — observational

### 2.9 ⚪ LOW · timeseries — DailyServiceFunds is a hand-rolled daily aggregate (load-modify-save) — @aggregation candidate, but volume is low

**Why it's hot:** Not hot — staking rewards fire per-epoch, not per-transfer. Listed for completeness against the checklist.

**Current behavior:** Per-event load-modify-save of a daily bucket plus a cumulative counter on Service. Driven only by RewardClaimed / ServiceUnstaked / ServiceForceUnstaked — epoch-scale frequency per service, i.e. low volume. specVersion 1.0.0 predates @aggregation (needs >= 1.1.0).

**Evidence:** schema.graphql:147-153; src/utils.ts:532-556 (addDailyOlasReward load-or-create per RewardClaimed/unstake); callers src/staking-proxy.ts:96,137

**Fix:** If the manifest is bumped to specVersion >= 1.1.0 anyway (recommended alongside findings 4's declared-calls option; graph-cli 0.98.1 / graph-ts 0.38.2 already support 1.3.0 / apiVersion 0.0.9 while the manifest sits at 1.0.0 / 0.0.7 — subgraph.yaml:1,16), convert to a timeseries + @aggregation pair. Otherwise leave as-is; the win is negligible.

**Effort:** hours, only as a rider on a spec bump · **Risk:** Aggregation entities change the query shape for consumers; the cumulative counter (cumulativeOlasRewardsClaimed) has no direct @aggregate equivalent and would stay handler-maintained. Not graft-safe if the entity is replaced.

> **Verifier note:** One residue if converted: Service.totalOlasRewardsClaimed is also bumped inside addDailyOlasReward (utils.ts:553-556) and would still need the hand-rolled counter (aggregations cannot write to a foreign entity), so the handler write does not disappear entirely — consistent with the auditor's own 'win is negligible' conclusion.


## 3. `marketplace` — 9 findings

**Baseline profile:**

- **specVersion**: 1.2.0 (all 7 manifests)
- **apiVersion**: 0.0.9 (Gnosis mappings; other networks 0.0.7 per subgraph CLAUDE.md)
- **data_sources**: Gnosis: 13 static (AgentFactory v1-v4, AgentRegistry, ServiceRegistryL2, 3x MechFactory, MechMarketplaceV1 [endBlock 41490893] + V2, ComplementaryServiceMetadata, Karma) + 5 ethereum templates + 2 file/ipfs templates. High-volume: MechMarketplace MarketplaceRequest/MarketplaceDelivery/Deliver-with-sigs, per-mech template Request/Deliver, and (historically dominant on Gnosis) legacy AgentMech template Request/Deliver.
- **eth_call_sites**: 14 .bind( sites: 12 in src/marketplace/fee-utils.ts (6 Chainlink native converters L181/204/227/250/273/296; UniswapV2 pair L404; Chainlink-in-OLAS L443/507; Balancer pool getPoolId L470/585; Balancer vault getPoolTokens L354 via helper) + 2 DEAD in src/marketplace/utils.ts (L621 getMaxDeliveryRate, L641 getPaymentType — zero callers). On Gnosis the only live per-event eth_calls are the 2 Balancer calls for TOKEN(OLAS)-paid mechs; NATIVE xDAI and NVM CREDITS conversions are pure math (constants.ts:245-261).
- **ipfs_sites**: Production sync ipfs.cat: 2 sites in src/agent-mech.ts:106/111 (legacy Gnosis path — STILL BLOCKING, up to 2 cats per Request and per Deliver). Marketplace path fully async since commits 4589b46/fa54999: file data sources ParsedRequestFile (spawned 2x per request, utils.ts:1013-1014) and ParsedDeliveryFile (1x per delivery, utils.ts:813-819/1146). Sync ipfs.cat in marketplace/utils.ts:673/677 is test-only (parseRequestIpfs/parseDeliverIpfs have no production callers).
- **immutable_entities**: 23 of 40 entity types immutable. Notable mutable-but-write-once candidates: Deliver (highest-cardinality mutable entity; async path no longer updates it), RequestToMech, CreateMech. Request/Mech/Service/Global/Sender legitimately mutable.
- **prune**: prune: 300 on all 7 manifests (already optimized; in use, and the Gnosis manifest grafts within the prune window — subgraph.gnosis.yaml:2-12)
- **templates**: AgentMech (legacy, Gnosis only, created per mech by agent-factory.ts:51), MechFixedPriceNative/MechFixedPriceToken/MechNvmSubscriptionNative/MechNvmSubscriptionTokenUSDC (created per marketplace CreateMech via createDataSourceForMechContract, utils.ts:475-508), ParsedRequestFile + ParsedDeliveryFile (file/ipfs, spawned per request/delivery). Mech-count-bounded growth; FDS rows grow ~3x per request+delivery pair.

### 3.1 🔴 HIGH · ipfs — Legacy AgentMech path (Gnosis) still does synchronous ipfs.cat on the indexing critical path — up to 2 sequential cats per event

**Why it's hot:** The legacy AgentMech era (Gnosis blocks ~27.9M-38.6M) is the bulk of this subgraph's history — hundreds of thousands of Request/Deliver events, each performing 1-2 blocking IPFS fetches. A missing/garbage hash costs two full node IPFS timeouts back-to-back (metadata.json path errors on raw files, bare cat errors on directories, so one of the two is often a guaranteed miss). This is the dominant cost of any re-index from genesis on Gnosis; current head traffic on legacy mechs is near zero, so head-lag impact today is small.

**Current behavior:** handleRequest and handleDeliver block the block pipeline on ipfs.cat; on a miss they wait out the node IPFS timeout twice, then proceed with unenriched entities. handleRequest also increments totalPredictRequests inline from the fetched prompt (src/agent-mech.ts:174).

**Evidence:** src/agent-mech.ts:106,111 (tryGetIpfsResponse: ipfs.cat(hash+'/metadata.json') then fallback ipfs.cat(hash)); called from handleRequest at src/agent-mech.ts:307 (loadRequestPayload) and handleDeliver at src/agent-mech.ts:368 (loadDeliveryPayload). Legacy AgentMech template wired only in subgraph.gnosis.yaml:378-399; instantiated per legacy mech by src/agent-factory.ts:51 (AgentMech.create).

**Fix:** Port the exact mechanism already shipped for the marketplace path (commits 4589b46/fa54999): spawn ParsedRequestFile/ParsedDeliveryFile file data sources (templates kind file/ipfs, subgraph.gnosis.yaml:526-552) from agent-mech handlers instead of calling ipfs.cat. The chain-free parsing modules (src/marketplace/request-metadata.ts, delivery-metadata.ts) are already shared; the legacy JSON shape is nearly identical (delivery route uses decimal requestId which legacy already has natively). Accept the same trade-off already accepted for marketplace: Deliver.model/toolResponse and live totalPredictRequests/Sender.totalPredictRequests increments cannot be written from the file-data-source causality region — derive them from ParsedRequest/ParsedDelivery at query time.

**Effort:** days (1-2): mapping changes + manifest template reuse + test updates; parsing code already extracted · **Risk:** Graft-safe for the deployed Gnosis instance (mapping-only change, schema unchanged) — but grafting means the already-indexed legacy region keeps its data and the speedup is only realized on a future re-index from genesis (which is exactly when it matters: legacy region is the slow part). Behavior change: legacy predict counters freeze (same as marketplace path); document like the existing NOTE in src/marketplace/utils.ts:109-112.

**Cross-check:** the blocking-inline-IPFS concern (citing src/agent-mech.ts and src/marketplace/utils.ts): NUANCED. STALE for src/marketplace/utils.ts — the production marketplace path was moved to file data sources (processOnChainRequest src/marketplace/utils.ts:996-1014, persistMarketplaceDeliver:1133-1147); the remaining sync ipfs.cat at utils.ts:671-678 is only reachable via parseRequestIpfs/parseDeliverIpfs which have zero production callers (test-only: tests/mech-requests.test.ts, mech-deliveries.test.ts, question-title.test.ts). CONFIRMED for src/agent-mech.ts (legacy Gnosis path). The 1000x-retry framing is imprecise: sync ipfs.cat blocks up to the node IPFS timeout then returns null (handled); the max-attempts retry semantics apply to file data sources, which retry in the background off the critical path.

> **Verifier note:** Minor: the totalPredictRequests increment lives in saveParsedRequestEntity (agent-mech.ts:153-186, increment at 174), called from handleRequest at line 349, not literally inline in handleRequest. Also note the port removes an awkward dual-causality-region situation: today ParsedRequest/ParsedDelivery are written both by the legacy chain handlers and by the marketplace FDS handlers; after the port all writes come from the offchain region.

### 3.2 🟡 MEDIUM · eth-call — Price-conversion eth_calls (Chainlink latestRoundData, Balancer getPoolId+getPoolTokens, UniswapV2 getReserves+token0) executed per delivery/request event with no time-based cache

**Why it's hot:** Every marketplace Deliver event and every MarketplaceRequest event runs convertFeeToUsd. On Gnosis, NATIVE (xDAI) is pure math — zero eth_calls — and NATIVE dominates Gnosis volume; but TOKEN(OLAS)-paid mechs incur 2 eth_calls per conversion (getPoolId + getPoolTokens). On the other 6 networks even NATIVE costs 1 Chainlink eth_call per conversion, so Base/Ethereum/etc. pay an RPC round-trip (~20-100ms vs ~1ms handler) on essentially every request batch and every delivery. graph-node's call cache dedupes only within the same block (and persists per-block in the DB), so each new block with activity re-fetches.

**Current behavior:** Fresh eth_call(s) per event per block. mainnet TOKEN path is worst: getReserves + token0 + latestRoundData = 3 calls per conversion; Arbitrum TOKEN = getPoolId + getPoolTokens + latestRoundData = 3.

**Evidence:** Call sites: src/marketplace/fee-utils.ts:181-184, 204-207, 227-230, 250-253, 273-276, 296-299 (6 Chainlink native converters), 404-414 (Uniswap pair getReserves+token0), 443-444/507-508 (Chainlink inside OLAS paths), 470-471/585-586 (BalancerV2WeightedPool.try_getPoolId), 354 (BalancerV2Vault.try_getPoolTokens). Hot callers: updateFeesOnDelivery src/marketplace/utils.ts:1093 (per on-chain marketplace delivery, via processOnChainDeliver:950 and persistSignedDeliver:1369), refreshMechDeliveryRate utils.ts:1066-1073 (per template Deliver where deliveryRate != stored max), handleMarketplaceRequest src/marketplace/mech-marketplace.ts:450 (once per request batch event).

**Fix:** Two-part: (a) Eliminate immutable lookups — Balancer pool IDs (try_getPoolId) and Uniswap token0 never change; hardcode them as constants in src/marketplace/constants.ts next to the pool addresses (removes 1 of 2 Balancer calls and 1 of 2 Uniswap calls permanently). (b) Add a PriceCache entity {id: feed-name, price: BigDecimal, updatedAtBlock: BigInt} (additive schema, mutable): convertFeeToUsd reads the entity and only re-fetches via eth_call when event.block.number - updatedAtBlock > N (e.g. ~5min of blocks); fee precision loss is negligible for USD analytics fields. Declared eth_calls (specVersion is already 1.2.0) are NOT the right mechanism here: the feed/pool addresses are static constants, not derivable from event params, and declaration only parallelizes rather than eliminates.

**Effort:** hours for (a); ~1 day for (b) incl. tests · **Risk:** Low. (a) is a mapping-only change, graft-safe. (b) adds a new entity type — graft-safe (additive schema). USD figures become up-to-N-blocks stale; acceptable for analytics counters. Requires passing block number into convertFeeToUsd (signature change, touch all callers).

**Cross-check:** the token-price-re-fetched-per-delivery concern (citing fee-utils.ts): NUANCED. CONFIRMED for TOKEN(OLAS) fees (all networks) and NATIVE fees on the 6 non-Gnosis networks. STALE as a Gnosis-slowness explanation: Gnosis xDAI-native fees (the dominant Gnosis payment type) are a pure 10^18 division with zero eth_calls (fee-utils.ts:174-177), and Gnosis NVM CREDITS use hardcoded ratios (constants.ts:245-250), not contract reads. The Gnosis slow-list pain is far more likely the legacy IPFS path (see finding 1) — the manifest's own graft comment (subgraph.gnosis.yaml:6-12) attributes the recent stall to IPFS, not eth_calls.

> **Verifier note:** Small nit: declared eth_calls can in fact use constant/literal addresses, so 'not derivable from event params' is not the blocking issue — the real reason to reject them (they prefetch but still execute per event) is stated correctly and stands.

### 3.3 🟡 MEDIUM · eth-call — Duplicate USD conversion per delivery: updateFeesOnDelivery and refreshMechDeliveryRate both convert the same deliveryRate in one handler invocation

**Why it's hot:** Runs on every template Deliver event (MechFixedPriceNative/Token/Nvm* templates, subgraph.gnosis.yaml:423-424 etc.). For NVM mechs deliveryRate legitimately varies per delivery, so the refresh branch fires on nearly every delivery (also rewriting Mech.maxDeliveryRate each time — entity churn); for TOKEN mechs with varying rate this doubles the 2-3 eth_calls from finding 2.

**Current behavior:** Same rate converted to USD twice per delivery (second time only when rate differs from stored max, which is the common case for NVM). Within one block graph-node's call cache absorbs the duplicate RPC, but across blocks it does not, and the BigDecimal work + Mech version churn happen regardless.

**Evidence:** processOnChainDeliver src/marketplace/utils.ts:928-977: line 950 calls updateFeesOnDelivery(request, requestId, deliveryRate) -> convertFeeToUsd (utils.ts:1093); line 976 calls refreshMechDeliveryRate(mech, deliveryRate) which, whenever deliveryRate != mech.maxDeliveryRate (utils.ts:1066), calls calculateMaxDeliveryRateUSD -> convertFeeToUsd again (utils.ts:1069-1072) for the identical rate and fee unit.

**Fix:** Compute the USD value once in processOnChainDeliver and pass it into both updateFeesOnDelivery and refreshMechDeliveryRate (add an optional precomputed param). Separately reconsider whether Mech.maxDeliveryRate should be overwritten by observed per-delivery rates at all for NVM mechs (it conflates 'max' with 'last observed' and forces a Mech entity write per delivery).

**Effort:** hours · **Risk:** Low; mapping-only, graft-safe. Behavior identical (same inputs, same conversion).

> **Verifier note:** One guard needed on the fix: updateFeesOnDelivery converts with request.feeUnit (set from the priority mech's factory at request time), while refreshMechDeliveryRate derives the fee unit from the delivering mech's factory. These match in the normal self-delivery case, but a precomputed value should only be reused when the two fee units are equal (or when priorityMech == delivering mech); otherwise fall back to a fresh conversion. The 'max vs last-observed' design question about Mech.maxDeliveryRate is valid — refreshMechDeliveryRate overwrites max with any differing observed rate, including lower ones.

### 3.4 🟡 MEDIUM · immutability — Deliver is mutable but effectively write-once in production; its model/toolResponse fields are dead in the async path

**Why it's hot:** Deliver is one of the two highest-cardinality entities (one per delivery event across all mechs + legacy, all 7 networks). Mutable entities pay block-range validity tracking on every insert; The Graph measures ~48% faster indexing for immutable entities.

**Current behavior:** Every Deliver insert goes into a mutable table with block_range bookkeeping; model/toolResponse stay null for all marketplace deliveries since fa54999, duplicating ParsedDelivery.model/response.

**Evidence:** schema.graphql:375-393 (Deliver @entity(immutable: false), fields model/toolResponse); the only post-creation writer is parseDeliverIpfs src/marketplace/utils.ts:797-804, which is test-only (comment at utils.ts:807-812 and parsed-delivery-file.ts:15-18 confirm the file-data-source path 'does NOT write back Deliver.model/toolResponse... left null — read ParsedDelivery'). agent-mech.ts:360-363 sets them at creation time only. RequestToMech (schema.graphql:312) and CreateMech (schema.graphql:294) are likewise write-once-per-id in practice.

**Fix:** On the next from-genesis re-index (e.g. when finding 1 ships): (a) drop Deliver.model/toolResponse (removing attributes is graft-safe, but do it together with the re-index anyway), delete the test-only parseRequestIpfs/parseDeliverIpfs sync path, and set the legacy handler to also stop writing them; (b) mark Deliver @entity(immutable: true) — requires removing the getOrCreateMarketplaceIndividualDeliver load-or-create (utils.ts:153-160) in favor of collision-free IDs (already txHash+logIndex / txHash+requestId). MarketplaceRequest/MarketplaceDelivery raw event entities are already immutable.

**Effort:** 1-2 days incl. verifying no other writer paths · **Risk:** Immutability flip is NOT graft-safe (not in graph-node's allowed graft schema changes) — bundle with a planned re-index. Field removal alone is graft-safe.

> **Verifier note:** The 'write-once' claim needs one qualification: on the signed path, handleMarketplaceDeliveryWithSignatures and handleDeliverWithSignaturesV1/V2 both upsert the SAME Deliver id (txHash.concat(requestId)) within one transaction — so Deliver is written twice, but in the same block. graph-node permits same-block overwrites of immutable entities (the codebase already relies on this: DeliverForMarketplace is immutable:true yet saved by both handleMarketplaceDelivery and persistMarketplaceDeliver in the same tx). Therefore immutable:true works, but the getOrCreateMarketplaceIndividualDeliver load-or-create must be KEPT for the same-block signed-delivery upsert, not removed as the fix proposes — only cross-block updates must be eliminated (they already are once the test-only sync path is deleted).

### 3.5 ⚪ LOW · ipfs — Two ParsedRequestFile file data sources spawned per request; one is a guaranteed permanent miss that retries in the background

**Why it's hot:** One extra offchain data source row per request, forever (dynamic data sources cannot be retired). The dead spawn never resolves, so the node's file-data-source worker retries it up to its max-attempts budget with backoff, competing for IPFS bandwidth with legitimate fetches and growing the data_sources table at 2x the request rate.

**Current behavior:** Off the critical path (correct design), but doubles FDS row count and wastes background IPFS attempts on hashes that can never resolve under the wrong layout.

**Evidence:** src/marketplace/utils.ts:1009-1014: ParsedRequestFile.createWithContext(baseHash + '/metadata.json', ctx) AND ParsedRequestFile.createWithContext(baseHash, ctx) for every on-chain request; own comment concedes 'For any given CID only one resolves'.

**Fix:** If post-cutover agents consistently upload the directory layout, spawn only <hash>/metadata.json for requests after a known block, keeping the double-spawn only for the legacy-format window; alternatively tune node-side ipfsMaxAttempts/timeout for offchain sources. Verify layout distribution via ParsedRequest.hash sampling before narrowing.

**Effort:** hours (mapping change) + a data check · **Risk:** Requests whose payload is a raw file (bare hash) would lose enrichment if narrowed incorrectly — this exact fallback was deliberately restored in commit 4589b46, so confirm with the maintainers first. Graft-safe.

### 3.6 ⚪ LOW · write-serialization — Global/Sender/Service/Mech running-total counters rewritten on every event (bounded by per-block coalescing + prune:300, so cost is moderate)

**Why it's hot:** Every request and delivery on every network touches the Global row and a Sender row. graph-node coalesces entity writes per block, and prune:300 caps version-history retention, so this is version-churn and cache pressure rather than a stall — but it is unavoidable serialization on the single hottest row in the store.

**Current behavior:** Load-modify-save of the same singleton in every handler; one new Global version per active block.

**Evidence:** Global singleton written in every hot handler: src/agent-mech.ts:253-281, 422-447; src/marketplace/mech-marketplace.ts:205-219, 288-321, 502-523; src/marketplace/utils.ts:1104-1106, 1123-1131. Sender likewise per request (agent-mech.ts:248-251, mech-marketplace.ts:423-429). Per-agent loops: mech-marketplace.ts:526-536 and 323-335, agent-mech.ts:313-319 (load+save RequestsPerAgent per agentId per event).

**Fix:** If a re-index is scheduled anyway, move event-level counters to a timeseries entity (@entity(timeseries: true)) with @aggregation(intervals, cumulative sum) so totals are computed in-database (specVersion 1.2.0 > 1.1.0 requirement, mechanism supported). Keep Global only for values that genuinely need handler-side reads. Not worth a standalone re-index on its own.

**Effort:** days; consumer queries must migrate from Global fields to aggregation entities · **Risk:** Breaking API change for downstream dashboards; new entities are additive (graft-safe) but retiring Global fields is not. Sequence behind findings 1/4.

> **Verifier note:** Caveat on the fix: @aggregation intervals are limited to hour/day and aggregate rows only materialize when an interval closes, so 'totals' become interval-lagged rather than live — queries that need up-to-the-block counts (or handler-side reads) must keep the Global counter, which the finding partially acknowledges. Timeseries entities also mandate id: Int8! and timestamp: Timestamp! fields. Net effect is a query-semantics change, not a drop-in replacement.

### 3.7 ⚪ LOW · ids — String IDs on the hottest entities (Request, RequestToMarketplace, ParsedRequest, Service, Mech) where Bytes would halve storage and speed comparisons

**Why it's hot:** One Request + one RequestToMarketplace + (async) one ParsedRequest row per request event; hex-string PKs are 2x the bytes of the raw bytes32 and slower to compare/index.

**Current behavior:** requestId bytes32 round-trips through toHexString() as the PK; the raw bytes are additionally stored in requestIdBytes fields (schema.graphql:320,366).

**Evidence:** schema.graphql:327-329 (Request id: ID! = requestId hex string, created at src/marketplace/utils.ts:163-165), schema.graphql:318 (RequestToMarketplace id string, utils.ts:611-614), schema.graphql:1-2 (ParsedRequest id string), schema.graphql:215/426 (Mech/Service id = serviceId decimal string). Deliver/Sender/AtaTransaction already use Bytes.

**Fix:** On a from-genesis re-index, switch Request/RequestToMarketplace/ParsedRequest IDs to Bytes (requestId directly) and drop the redundant requestIdBytes columns. Service/Mech keyed by serviceId can stay string (low cardinality).

**Effort:** days (touches most mapping files + all tests) · **Risk:** Re-index only, not graft-safe (ID type change). Bundle with findings 1/4/6; do not do standalone.

### 3.8 ⚪ LOW · dead-weight — Dead eth_call helpers, test-only sync IPFS path, and unwired handlers/entities

**Why it's hot:** No runtime cost (never executed) — this is maintenance weight and audit noise, plus empty tables created per unused entity type.

**Current behavior:** Compiled into WASM but unreachable; unused entities create empty DB tables.

**Evidence:** src/marketplace/utils.ts:620-630 getMaxDeliveryRate and :638-652 getPaymentType — zero callers in src/ (superseded by PendingMechData cross-handler transfer and getPaymentTypeFromFactory static map, per subgraph.gnosis.yaml:162-164 comment); utils.ts:671-678 + 776-805 sync ipfs.cat path reachable only from tests; handleMarketplaceParamsUpdated/handleOwnerUpdated (mech-marketplace.ts:378-393, 539-550) not wired in subgraph.gnosis.yaml; schema entities with no writer on Gnosis: SetMechFactoryStatuses, ActivateRegistration, Deposit, DeployService, MarketplaceMech (schema.graphql:29-36 — no writer anywhere in src/).

**Fix:** Delete getMaxDeliveryRate/getPaymentType; move parseRequestIpfs/parseDeliverIpfs into a test helper or refactor tests to call parse*Payload directly; remove writer-less entity types from schema.graphql (entity removal is graft-safe).

**Effort:** hours · **Risk:** None for dead code; confirm no cross-network manifest wires the unwired handlers before deleting (checked base: also unwired).

> **Verifier note:** One evidence inaccuracy: ActivateRegistration, Deposit, and DeployService DO have writers in src/ (handleActivateRegistration, handleDeposit, handleDeployService in src/marketplace/service-registry-l-2.ts) — they are dead only because those handlers are unwired in every manifest. So removing those entity types also requires deleting (or deliberately deciding not to wire) the corresponding handlers, and confirm the unwiring is intentional rather than an omission before deleting. The MarketplaceParamsUpdated/OwnerUpdated entity types (written only by the unwired handlers) can go in the same sweep.

### 3.9 ⚪ LOW · template-growth — Per-mech dynamic templates (AgentMech + 4 marketplace types) have no retirement, but growth is bounded by mech count — not a current problem

**Why it's hot:** Mech creation is rare (tens of mechs per network); each dynamic source adds address-filter overhead per block scan but the set is small. Dead legacy mechs remain tracked forever (graph-node cannot stop a dynamic data source).

**Current behavior:** Bounded, slow-growing set of dynamic sources; no chain-wide subscriptions anywhere in the manifest (verified: no ERC20 Transfer streams; AgentRegistry/ServiceRegistryL2 Transfer events are the project's own low-volume NFT registries).

**Evidence:** src/agent-factory.ts:51 (AgentMech.create per legacy mech), src/marketplace/utils.ts:289-345 (Mech* template .create per CreateMech). Filters are per-contract-address, handlers are all relevant (no discard ratio).

**Fix:** No action needed now. If mech count ever grows into the thousands, consider indexing Request/Deliver from the marketplace contract only (V2 events carry requestData/deliveryData per manifest comment subgraph.gnosis.yaml:233-234) instead of per-mech templates.

**Effort:** n/a (monitor) · **Risk:** n/a

**Cross-check:** chain-wide subscriptions: none present — this subgraph is clean on that axis.

> **Verifier note:** Caveat on the speculative alternative only: the marketplace-level MarketplaceDelivery event carries no per-request deliveryRate or payload, and legacy AgentMech events have no marketplace counterpart, so a full move off per-mech templates would need the V2 signed Deliver event plus template Deliver equivalents for rate/fee tracking — non-trivial if it ever becomes necessary. Does not affect the current no-action verdict.


## 4. `predict-omen` — 11 findings

**Baseline profile:**

- **specVersion**: 1.0.0
- **apiVersion**: 0.0.7 (graph-cli 0.98.1 / graph-ts 0.38.2 — manifest features lag the toolchain; upgrade to specVersion 1.2/1.3 is the enabler for topic filters and timeseries)
- **data_sources**: 4 static data sources + 1 template. High-volume: Realitio 0x79e32a.. (all Reality.eth activity on Gnosis, 4 events) and ConditionalTokens 0xCeAfDD.. (all CTF conditions/redemptions on Gnosis) are protocol-wide; FPMMDeterministicFactory and ServiceRegistryL2 are low-volume. Hottest handler path: FPMMBuy/FPMMSell on template instances.
- **templates**: FixedProductMarketMaker — instantiated per whitelisted-creator market at FPMMDeterministicFactoryMapping.ts:84; ~15k+ instances (CLAUDE.md cites ~15,000 markets), no retirement mechanism, watch-list grows forever.
- **eth_call_sites**: 0 — no Contract.bind() anywhere under src/ (ERC20Detailed ABI is declared in the manifest template but never bound).
- **ipfs_sites**: 0 — no ipfs.cat and no file data sources.
- **immutable_entities**: 3 of 11 immutable (TraderService, ConditionPreparation, PayoutRedemption). Notable mutable-but-immutable-eligible: Bet (mutable only for legacy countedInProfit/countedInTotal flag flips at settlement).
- **prune**: prune: 300 (subgraph.yaml:2-3) — present and aggressive; the per-subgraph CLAUDE.md stale-claims 'prune: auto'.

### 4.1 🔴 HIGH · template-growth — FixedProductMarketMaker template instantiated per market with no retirement; ~15k+ dynamic data sources and growing

**Why it's hot:** Runs on every block via trigger matching, independent of event volume. FPMMBuy/FPMMSell on active markets is also the single highest-volume handler path (every agent trade).

**Current behavior:** Every whitelisted-creator market creation spawns a dynamic data source for FPMMBuy/FPMMSell. graph-node cannot retire a dynamic data source, so the trigger-filter address set grows monotonically (~15k+ addresses, plus hundreds/week). Each block must be matched against the full set; each template creation also forces a re-scan of the current block. This cost is incurred at the block-stream/trigger-matching layer regardless of handler logic.

**Evidence:** subgraphs/predict-omen/src/FPMMDeterministicFactoryMapping.ts:84 (FixedProductMarketMakerTemplate.create(address)); subgraph.yaml:112-139 (template def); CLAUDE.md cites ~15,000 markets

**Fix:** No graph-node mechanism fixes this (templates support no endBlock; topic filters do not apply to dynamic sources). Design options: (a) reconstruct trades from the single static ConditionalTokens contract's ERC1155 TransferSingle/TransferBatch stream instead of per-FPMM templates — loses fee/investment amounts, so likely not viable; (b) accept on graph-node and rely on prune:300; (c) re-platform to an indexer with wildcard/contract-family event matching (Envio HyperIndex wildcard handlers match FPMMBuy across all addresses with one subscription) — same direction already chosen for predict-polymarket. If staying on graph-node, this is the structural ceiling on sync speed.

**Expected gain:** High for full re-syncs: trigger-filter matching and template re-scan overhead scales with market count; this is the dominant structural cost unique to this subgraph. Handler-level fixes cannot recover it. · **Effort:** days (re-platform) / zero (accept) · **Risk:** Re-platform = full rewrite + re-index; accepting = none. Adding a settled-guard to handlers would ADD a store read per trade for near-zero benefit — recommend NOT doing it.

**Cross-check:** STALE/nuanced: the assumed mitigation (settled-guard early-exits in handlers) is wrong — NO settled-market guard exists in handleBuy/handleSell (FixedProductMarketMakerMapping.ts:14-17,65-68 only check FPMM + TraderAgent existence). More importantly, a settled-guard would not help: settled markets emit essentially zero FPMMBuy/FPMMSell events, and the growth cost lives in trigger matching, which handler guards cannot reach. The watch-list-only-grows / no-way-to-retire point is CONFIRMED.

> **Verifier note:** Minor framing: the per-block matching cost at ~15k addresses is real but graph-node batches dynamic sources of the same template into one log filter; the dominant costs are the growing eth_getLogs address set and the current-block re-scan per market creation, not per-address linear matching in the node itself.

### 4.2 🔴 HIGH · immutability — Bet (highest-cardinality entity) is mutable only because settlement flips legacy countedInProfit/countedInTotal flags

**Why it's hot:** Bet creation fires on every FPMMBuy/FPMMSell (highest-volume event); the flag-flip loop fires on every LogNewAnswer × participants × bets (~1+ per market × ~15k markets, plus ~415 re-answer reprocessings).

**Current behavior:** Every bet creates a mutable Bet row (block-range validity tracking on every write), and every settlement loads and re-saves every Bet of every participant just to flip two booleans (realitio.ts:291-298). participant.settled already provides the idempotency these flags used to provide.

**Evidence:** schema.graphql:26 (@entity(immutable: false) on Bet); realitio.ts:202-205 and 294-297 (the only post-creation writes: flag flips at settlement); CLAUDE.md marks both flags 'Legacy flag' with primary idempotency via participant.settled (schema.graphql:110)

**Fix:** Drop countedInProfit/countedInTotal (or freeze them at creation) and declare Bet @entity(immutable: true). Bet.dailyStatistic/fixedProductMarketMaker are already set at creation so nothing else blocks immutability. This also deletes the Bet.load+save loop from settlement (Brier still needs bet reads — see the Brier-accumulator finding to remove those too). The Graph cites ~48% faster indexing for immutable entities.

**Expected gain:** Large: removes validity-range bookkeeping on the highest-cardinality entity and N load+save round-trips per settlement. Combined with Bytes IDs, this is the biggest handler-level win available. · **Effort:** hours (code) + re-index · **Risk:** NOT graft-safe (mutability change + field removal = breaking schema change) — requires re-index from genesis, which matches the re-index-over-graft strategy for predict-*. Verify no downstream consumer queries countedInProfit/countedInTotal before removal.

**Cross-check:** CONFIRMED: handleLogNewAnswer does load/save many Bets per settlement — one Bet.load per bet id in participant.bets, plus a .save() for each not-yet-counted bet.

> **Verifier note:** Two precision nits: (a) the re-save is guarded by the !bet.countedInProfit check, so already-flagged bets are loaded but not re-saved on re-answers — the load cost remains though; (b) the settlement Bet.loads are not solely for the flags — they also feed Brier computation (realitio.ts:209-215, 301-307), so Bet immutability alone removes the writes but the loads only disappear when combined with finding 5, as the finding itself notes.

### 4.3 🟡 MEDIUM · write-serialization — Global singleton rewritten on every trade, every payout, and every registration

**Why it's hot:** FPMMBuy/FPMMSell is the highest-volume event stream (every trade by every Olas trader agent).

**Current behavior:** Each bet produces a new version row of the Global entity (plus TraderAgent, MarketParticipant, DailyProfitStatistic, Bet = 5 writes/bet). handleLogNewAnswer already batches Global via deltas and Map caches, so the singleton churn is concentrated on the bet path.

**Evidence:** src/utils.ts:163-168,220 (processTradeActivity: global.save() per FPMMBuy/FPMMSell); src/conditional-tokens.ts:74-88 (per PayoutRedemption); src/service-registry-l-2.ts:46-48 (per registration); realitio.ts:86-89,323-328 (delta-accumulated, saved once per LogNewAnswer — already optimized)

**Fix:** (a) Cheapest: accept — with prune:300 the version-table bloat is bounded and the marginal write is one small row per event. (b) Structural: bump specVersion to >=1.1.0 and move Global.totalBets/totalTraded/totalFees (and DailyProfitStatistic activity fields) to a timeseries entity written per bet + @aggregation computed in-database; keep only registration counters and settled totals as a much colder mutable Global. Note aggregations cannot express the re-answer reversal for profit unless reversals are emitted as negative correction rows (they can be), and profitParticipants can never be an aggregation.

**Expected gain:** Medium: removes 1 of 5 writes per bet and shrinks per-block transactions; real but not the dominant cost given prune:300 is already active. · **Effort:** hours (accept) / days (timeseries redesign + re-index) · **Risk:** Timeseries redesign requires specVersion/apiVersion upgrade (currently 1.0.0/0.0.7) and full re-index; aggregation semantics for reversal-heavy profit accounting need careful test parity with the 33 existing Matchstick tests.

**Cross-check:** CONFIRMED with nuance: the single-running-total-record concern is accurate for the bet/payout paths. But the serialises-writes framing overstates the mechanism — graph-node executes handlers for one subgraph serially anyway; the actual cost is version-row churn and larger per-block DB transactions, and prune:300 already bounds the historical churn. The settlement handler is already delta-batched, contra that framing.

> **Verifier note:** For option (b), note Global.totalBets/totalTraded lifetime values need either cumulative aggregations (@aggregate cumulative: true, supported at specVersion 1.1.0+) or client-side summing of interval buckets; per-day buckets alone don't directly replace the lifetime singleton fields.

### 4.4 🟡 MEDIUM · chain-wide-subscription — ConditionalTokens and Realitio are protocol-wide subscriptions; every non-tracked event still costs one store-read guard

**Why it's hot:** PayoutRedemption and LogNewAnswer fire for all CTF/Reality.eth users on Gnosis on every block where anyone redeems/answers.

**Current behavior:** All four handlers see every Omen/Reality.eth/CTF event on Gnosis. Guard ordering is already near-optimal: LogNewQuestion filters purely in memory; LogNewAnswer checks the free is_commitment flag before its single Question.load; PayoutRedemption and ConditionPreparation each cost exactly one indexed store lookup on miss. Discard ratio: startBlock 28,900,000 (~mid-2023) coincides with Olas predict launch, and Olas creators/traders dominate recent Omen + Reality.eth activity on Gnosis, so the tracked fraction is substantial (not a Polymarket-style 99%-discard stream); pre-existing non-Olas Reality.eth usage (Kleros/Zodiac, other Omen creators) and non-Olas CTF redemptions are the discarded remainder. Exact ratio needs log counts from the node.

**Evidence:** subgraph.yaml:31-54 (ConditionalTokens 0xCeAf..) and 80-111 (Realitio 0x79e3..); guards: conditional-tokens.ts:19-22 (Question.load per ConditionPreparation), conditional-tokens.ts:39-42 (ConditionPreparation.load per PayoutRedemption), realitio.ts:31-41 (is_commitment check then Question.load per LogNewAnswer), realitio.ts:20-22 (in-memory CREATOR_ADDRESSES check per LogNewQuestion — no store read)

**Fix:** Only static-filterable stream is LogNewQuestion: its second indexed param is the creator (user), and CREATOR_ADDRESSES is a STATIC 2-address list — after upgrading to specVersion >=1.2.0, add a topic filter on the eventHandler so non-whitelisted questions never reach the handler. LogNewAnswer/LogFinalize/ConditionPreparation/PayoutRedemption key on dynamic question/condition IDs or dynamic agent addresses — not statically filterable; keep the current guard order. Micro-tweak: in handlePayoutRedemption the immutable PayoutRedemption log entity is created (conditional-tokens.ts:54-64) before the MarketParticipant/TraderAgent guards (:67-72), so redemptions by non-agent users on tracked markets still write a row; if the debug log is only needed for agents, move the participant guard above the entity creation.

**Expected gain:** Low-medium: LogNewQuestion handler is already store-read-free, so the topic filter mainly saves handler dispatch; the guard-reorder saves one write per non-agent redemption on tracked markets. The streams themselves are mostly unavoidable. · **Effort:** hours (topic filter, after specVersion bump)  · **Risk:** Topic filter is graft-safe (manifest-only) but requires the specVersion upgrade; hardcodes the creator whitelist at the firehose level — adding a creator then requires a manifest redeploy (already true of constants.ts). PayoutRedemption log reorder changes indexed data (drops non-agent rows) — confirm no consumer relies on them.

**Cross-check:** CONFIRMED they are chain-wide subscriptions; guard ordering already correct, so the actionable surface is small.

> **Verifier note:** The topic2 filter values must be the two creator addresses left-padded to 32 bytes in the manifest; also note the filter only trims the LogNewQuestion stream — LogNewAnswer/LogFinalize/LogNotifyOfArbitrationRequest still deliver every Reality.eth event to the handlers, so the win is real but partial, as the finding acknowledges.

### 4.5 🟡 MEDIUM · derived-from — MarketParticipant.bets is a manually managed growing String array rewritten on every trade

**Why it's hot:** Array append is on the per-trade hot path; array iteration is on every settlement and re-answer.

**Current behavior:** Every FPMMBuy/FPMMSell appends a ~70-char hex string id and rewrites the whole array inside the MarketParticipant row (which is also rewritten for totals anyway, but the array makes the row grow unboundedly per agent-market). Settlement then does one random-access Bet.load per array element.

**Evidence:** schema.graphql:96 (bets: [Bet!]! non-derived); src/utils.ts:204-206 (bets.push per trade, full array re-stored); realitio.ts:196,288 (settlement iterates the stored array with Bet.load per id)

**Fix:** Add marketParticipant: MarketParticipant! to Bet (set at creation), change MarketParticipant.bets to @derivedFrom(field: "marketParticipant"), and use participant.bets.load() (derived-field loader, apiVersion >=0.0.7 supports it) at settlement. Better: combine with the Brier-accumulator fix below so settlement needs no Bet reads at all, then the relation is query-only.

**Expected gain:** Medium: bounded MarketParticipant row size, no array serialization per trade; bets-per-participant is typically small (a handful) so the per-row saving is modest but it is on the hottest write path. · **Effort:** hours + re-index (removing the stored array is a breaking schema change) · **Risk:** Not graft-safe (field removal/type change). Note Bet becomes immutable-compatible only if the new field is set at creation — it is.

**Cross-check:** part of the mutable-entity churn in handleLogNewAnswer.

### 4.6 🟡 MEDIUM · write-serialization — Settlement re-reads every Bet for Brier scoring; pre-accumulate per-outcome Brier sums on MarketParticipant at bet time

**Why it's hot:** Runs on every LogNewAnswer for every participant's every buy-side bet; re-runs fully on each of the ~415 re-answers.

**Current behavior:** Brier contribution depends only on (impliedProbability, outcomeIndex) fixed at bet time and the eventual answer, which has just 3 cases (outcome0 wins / outcome1 wins / invalid). Yet the handler recomputes it at settlement by loading every Bet.

**Evidence:** realitio.ts:288-313 (fresh path: Bet.load per bet id, reads impliedProbability/amount/outcomeIndex to compute Brier) and realitio.ts:196-221 (same on re-answer path); brier math in src/utils.ts:106-123

**Fix:** Add three accumulators to MarketParticipant (brierSumIfAnswer0, brierSumIfAnswer1, brierSumIfInvalid + one shared brierEligibleCount), updated in processTradeActivity per buy. At settlement pick the accumulator matching the answer — zero Bet loads. Together with dropping countedIn* flags, handleLogNewAnswer touches only participants/agents/daily stats (already Map-cached), and Bet can be immutable.

**Expected gain:** Removes O(total bets in market) store reads per settlement; medium because settlements are ~1/market but each currently scales with bet count. · **Effort:** hours · **Risk:** Additive fields are graft-safe, BUT participants created before the graft block would have zero accumulators while their markets settle after the graft — in-flight markets (4-day window) would get wrong Brier. Either keep a Bet-loading fallback for pre-graft participants or ship with the next full re-index.

**Cross-check:** CONFIRMED: with the flag-flip removal this is the remaining reason settlement touches Bet rows at all.

> **Verifier note:** Implementation detail: processTradeActivity already receives amount and outcomeTokenAmount, so it can call computeImpliedProbability itself; sells (negative amount) must be excluded from the accumulators exactly as the settlement loop's amount.gt(0) check does today.

### 4.7 ⚪ LOW · ids — String IDs (hex + underscore concatenations) where Bytes IDs would work

**Current behavior:** Bet even computes the Bytes id then converts to hex String. String keys double storage and slow index comparisons versus Bytes.

**Evidence:** schema.graphql:27 (Bet ID! built as hash.concatI32(logIndex).toHexString(), FixedProductMarketMakerMapping.ts:18); schema.graphql:93 + utils.ts:181 (MarketParticipant id agentHex_marketHex); schema.graphql:151 + utils.ts:60 (DailyProfitStatistic agentHex_dayTs); Question/ConditionPreparation/CreatorAgent/TraderService also String (schema.graphql:141,58,50,3). Bytes already used for TraderAgent/FPMM/PayoutRedemption.

**Fix:** Bet: drop .toHexString(). MarketParticipant: agent.concat(market). DailyProfitStatistic: agent.concatI32(dayTs.toI32()) with the date field retained for sorting/filtering. Question/ConditionPreparation: use the bytes32 directly.

**Expected gain:** Low-medium; The Graph quotes ~28%+ combined with immutability, dominated by the Bet table. · **Effort:** hours, but bundled into the same re-index as the immutability change (breaking) · **Risk:** Breaking schema change, not graft-safe; downstream queries that filter by string ids must be updated.

> **Verifier note:** TraderService.id derives from serviceId (a uint256, currently hex string via toHexString at service-registry-l-2.ts:14) — Bytes conversion works there too but String is harmless for that tiny entity; the payoff is concentrated in Bet/MarketParticipant/DailyProfitStatistic.

### 4.8 ⚪ LOW · handler-order — handleBuy/handleSell load FPMM entity before the more selective TraderAgent guard

**Why it's hot:** Highest-volume handler; every discarded non-agent trade pays two store reads instead of one.

**Current behavior:** Both loads execute for every FPMMBuy/FPMMSell on tracked markets. Since events only fire on template addresses, FixedProductMarketMakerCreation.load always hits; the discriminating guard is TraderAgent (non-agent Omen users and arb bots trading tracked markets are discarded).

**Evidence:** src/FixedProductMarketMakerMapping.ts:14-17 and 65-68

**Fix:** Load TraderAgent(buyer/seller) first, return if null, then load the FPMM (or skip the FPMM load entirely — it is only used as an existence check that the template placement already guarantees, minus the 2 BLACKLISTED_MARKETS which never get templates anyway, so the load can be dropped outright).

**Expected gain:** One store read saved per trade event (agent trades keep 1 of 2 reads; non-agent trades drop from 2 to 1). Small constant factor on the hottest path. · **Effort:** hours · **Risk:** None functionally; dropping the FPMM load relies on the invariant that templates are only created for whitelisted, non-blacklisted markets (FPMMDeterministicFactoryMapping.ts:18-23,84). Graft-safe (mapping-only change).

**Cross-check:** these are the only guards present; there is no settled-market early-exit (and adding one is not recommended — it would cost an extra read on the hot path for near-zero skipped events).

> **Verifier note:** This is a one-store-read-per-event micro-optimization; worth taking when bundled with the other schema-breaking changes rather than as its own deploy.

### 4.9 ⚪ LOW · pruning — indexerHints prune: 300 present and aggressive

**Current behavior:** History retained for only ~300 blocks (~25 min on Gnosis). This already bounds the version-churn cost of the mutable Global/DailyProfitStatistic rewrites and keeps the store small.

**Evidence:** subgraph.yaml:2-3

**Fix:** No change. Note the operational consequence: grafting is only possible within the last ~300 blocks of a synced deployment, reinforcing the re-index-over-graft strategy; any fix marked 'graft-safe' here still needs the graft base to be freshly synced.

**Expected gain:** n/a (already applied) · **Effort:** n/a · **Risk:** Time-travel queries are unavailable beyond 300 blocks — presumed acceptable.

**Cross-check:** CONFIRMED: the manifest-already-has-prune:300 point is accurate (note the local CLAUDE.md for this subgraph stale-says 'prune: auto').

### 4.10 ⚪ LOW · dead-weight — Stale manifest metadata and deprecated duplicate field

**Current behavior:** ABI/entities lists are load-time metadata with no per-event runtime cost; the duplicate timestamp adds one BigInt column per Bet row.

**Evidence:** subgraph.yaml:132-133 (ERC20Detailed ABI declared in template, never bound in FixedProductMarketMakerMapping.ts); subgraph.yaml:124-127 (template entities list names Account/FpmmPoolMembership/FpmmParticipation/Token which do not exist in schema.graphql); schema.graphql:44 (Bet.timestamp deprecated duplicate of blockTimestamp, still written at FixedProductMarketMakerMapping.ts:53,110)

**Fix:** Remove the ERC20Detailed ABI entry and fix the entities lists (cosmetic, graft-safe manifest edit); drop Bet.timestamp at the next breaking re-index.

**Expected gain:** Negligible for indexing speed; hygiene only. · **Effort:** hours · **Risk:** Dropping Bet.timestamp breaks any consumer still querying it; the field is explicitly @deprecated so coordinate then remove.

> **Verifier note:** Given the re-index-over-graft strategy and prune:300 (which makes graft windows ~25 min), the 'graft-safe' qualifier is mostly moot — but the manifest cleanup is safe under any deploy mode.

### 4.11 ⚪ LOW · eth-call — Zero eth_calls and zero IPFS on the indexing path — checklist items 1 and 2 are clean

**Current behavior:** All USD/xDAI amounts, token balances, and probabilities are derived from event parameters and indexed state. No RPC round-trips per event.

**Evidence:** grep for '.bind(' and 'ipfs.' across subgraphs/predict-omen/src/ returns no contract bindings and no ipfs usage; all handler data comes from event params and the store

**Fix:** None needed.

**Expected gain:** n/a · **Effort:** n/a · **Risk:** n/a


## 5. `babydegen-mode` — 10 findings

**Baseline profile:**

- **specVersion**: 1.0.0
- **apiVersion**: 0.0.9
- **data_sources**: 20 static dataSources + 2 templates. High-volume: 14 chain-wide ERC20 Transfer streams (USDC, WETH, MODE, OLAS, ezETH, uniBTC, weETH, STONE, wrsETH, wMLT, BMX, XVELO, USDT, oUSDT) all from startBlock 15110000, plus VeloNFTManager (all Velodrome Slipstream CL events on Mode), BalancerVault PoolBalanceChanged (chain-wide), LiFiDiamond, SturdyVault, VeloV2Factory PoolCreated, VeloV2Sugar (once-filter block handler), ServiceRegistryL2, PortfolioScheduler (polling block handler every 1800 blocks ~1h)
- **eth_call_sites**: ~27 bind/try_/hasCode sites across 9 files: priceAdapters.ts (4 contracts: CLPool slot0/token0/token1, V2Pool getReserves/token0/token1, BalancerPool getPoolId, Vault getPoolTokens), veloCLShared.ts (~6: ownerOf, positions, factory getPool x2, slot0), veloV2Shared.ts (3: token0/token1/stable, balanceOf/totalSupply/getReserves), veloNFTManager.ts (3x ownerOf incl. one UNCONDITIONAL pre-guard call per chain-wide IncreaseLiquidity), balancerShared.ts (4), sturdyVault.ts (4), veloV2Bootstrap.ts (Sugar.all paginated once), common.ts (ethereum.hasCode x2, entity-cached via AddressType), veloV2Discovery.ts (1, dead code)
- **ipfs_sites**: none — no ipfs.cat or file data sources
- **immutable_entities**: 4 of 18 entity types immutable (PriceUpdate, AgentPortfolioSnapshot, DailyPopulationMetric, SwapToEntryAssociation); hot mutable: TokenBalance, AgentPortfolio, ProtocolPosition, Token, FundingBalance, AgentSwapBuffer
- **prune**: absent (no indexerHints block in subgraph.yaml)
- **templates**: VeloV2Pool — instantiated per Velodrome V2 pool whose token0 AND token1 are both whitelisted, via one-shot Sugar bootstrap (block 21346000) + factory PoolCreated; indexes full Transfer/Mint/Burn of each pool forever. Safe — instantiated per service multisig AND per operator safe at CreateMultisigWithAgents, never retired. Note: 5 mapping files (veloV2Discovery/Factory/Router/DirectPool, veloCLPool) are unwired dead code; the 5-min price cache lives on the Token entity (derivedUSD/lastPriceUpdate/priceConfidence>0.5 gate), PriceUpdate is only an immutable audit log; the in-memory PoolNFTCache/discoveredPools Maps are not restart-safe

### 5.1 🔴 HIGH · eth-call — Unconditional ownerOf() eth_call per event on chain-wide Velodrome CL NFT manager

**Why it's hot:** IncreaseLiquidity/DecreaseLiquidity fire for every CL LP action by anyone on Mode's Velodrome — thousands/day — versus a handful of tracked agent safes. One serial RPC round-trip per event is the single worst per-event cost in this subgraph.

**Current behavior:** The VeloNFTManager dataSource receives every IncreaseLiquidity/DecreaseLiquidity/Collect/Transfer from ALL Velodrome Slipstream LPs on Mode (the dominant DEX). handleIncreaseLiquidity issues try_ownerOf(tokenId) unconditionally at the top for every event even though the 'PHASE 1 OPTIMIZATION' cache check below is supposed to avoid it; ~100% of events belong to non-tracked owners and the call result is discarded. handleDecreaseLiquidity checks the cache first, but the cache is an in-memory Map (see separate finding) so in practice it misses and falls through to ownerOf per event too. For tracked events, refreshVeloCLPositionWithEventAmounts repeats ownerOf+positions() and then refreshVeloCLPosition repeats them a third time (veloCLShared.ts:118,130,287,299,370,390).

**Evidence:** src/veloNFTManager.ts:57-61 (handleIncreaseLiquidity binds NonfungiblePositionManager and calls try_ownerOf BEFORE any guard, 'Get owner early for logging'); src/veloNFTManager.ts:108-110 (handleDecreaseLiquidity fallback ownerOf on every cache miss); subgraph.yaml:442-473 (VeloNFTManager dataSource, no filter possible)

**Fix:** Track NFT ownership from the already-indexed NFT Transfer stream into a store entity (e.g. NftOwner {id: tokenId, owner}) written in handleNFTTransfer, then guard Increase/Decrease/Collect with a store read instead of ownerOf; delete the top-of-handler ownerOf in handleIncreaseLiquidity (move it inside the tracked branch). For the residual calls on tracked events, bump specVersion to >=1.2.0 and declare `calls: {owner: NonfungiblePositionManager[0x991d...702].ownerOf(event.params.tokenId), pos: ...positions(event.params.tokenId)}` on the eventHandlers so graph-node prefetches them in parallel and caches within the block.

**Expected gain:** Removes 1 serial eth_call for every CL liquidity event on the network (the RPC round-trip typically dominates handler wall time); should be the largest single sync-speed win — plausibly 2-5x on blocks dense with Velodrome activity. · **Effort:** hours (guard reorder + NftOwner entity); +hours for specVersion bump + declared calls · **Risk:** Low. Additive entity + mapping change = graft-safe. Keep ownerOf as one-time fallback for NFTs minted before startBlock if any doubt about Transfer coverage (mints emit Transfer(0x0->owner), and the dataSource indexes all Transfers, so coverage is complete).

> **Verifier note:** Two nits: (1) for non-tracked events the ownerOf result is not fully discarded — it feeds the fallback getServiceByAgent(owner) check at :74 — but a store-backed guard makes the RPC unnecessary either way; (2) in the declared-calls part, write the contract slot as NonfungiblePositionManager[event.address] rather than a literal address (the dataSource IS the manager, and event.address is the safely supported address expression). The CL pool's slot0 cannot be declared because the pool address is derived from the positions() return value, not from event data.

### 5.2 🔴 HIGH · other — In-memory Map 'caches' do not survive WASM restarts and are not shared across data sources — cache is mostly fiction, and behavior is non-deterministic

**Why it's hot:** These caches gate the guards on the chain-wide VeloNFTManager stream (finding #1) and the factory getPool call executed inside every CL position refresh.

**Current behavior:** isSafeOwnedNFT/getCachedPoolAddress back the 'fast path' guards in veloNFTManager.ts and the factory getPool() memoization in veloCLShared.ts:33-72. Module-level AssemblyScript state is not guaranteed to persist between handler invocations, is lost on every graph-node restart/re-instantiation, and is per-data-source (the PortfolioScheduler block handler and VeloNFTManager mappings each have their own instance). Every reset turns cache-first paths into eth_call fallbacks (ownerOf, factory.getPool), and whether a given event triggers processing depends on process history — a determinism hazard for store writes that depend on isSafeOwnedNFT.

**Evidence:** src/poolIndexCache.ts:1-96 ('Simple in-memory cache', module-level `let cache = new PoolNFTCache()`); src/veloV2Bootstrap.ts:26 (`let discoveredPools = new Map`); src/veloV2Shared.ts:22 (`let poolCache = new Map`); src/veloV2Discovery.ts:20

**Fix:** Replace with store entities: NftOwner {tokenId -> owner} maintained from Transfer events, and NftPool {tokenId -> pool, token0, token1, tickSpacing} written once when a tracked position is first seen. Store reads are cheap, deterministic, and shared across all data sources. Delete PoolNFTCache.

**Expected gain:** Makes the intended 'Phase 1 optimization' actually hold across restarts, eliminating the recurring ownerOf/getPool fallback storms; removes an indexing-determinism hazard. · **Effort:** hours-to-1-day · **Risk:** Low; additive entities, graft-safe. Must backfill NftPool lazily on first access (one eth_call once per tracked NFT).

> **Verifier note:** Minor line nit: in veloV2Discovery.ts the map is at line 26, not 20 (and that file is dead code anyway, per finding 7). Otherwise accurate.

### 5.3 🔴 HIGH · chain-wide-subscription — 14 chain-wide ERC20 Transfer dataSources (USDC, WETH, MODE, USDT, ...) with ~99.99% discard ratio

**Why it's hot:** Token Transfer streams are the highest-volume event class on any chain; here they are indexed 14x over from genesis-adjacent startBlock 15110000.

**Current behavior:** Every transfer of the 14 highest-volume tokens on Mode is decoded and handled; the handler does an in-memory TOKENS.get then Service.load(to) and Service.load(from) — two DB reads per event — and discards essentially all of them (only a handful of Optimus agent safes exist, agentId 40). USDC + WETH transfers are the bulk of all Mode log volume, so this is the structural floor of sync time. Topic filters (specVersion 1.2.0) cannot help: from/to are unbounded, and the safe list is dynamic.

**Evidence:** subgraph.yaml:47-441 (USDC, WETH, MODE, OLAS, ezETH, uniBTC, weETH_mode, STONE, wrsETH, wMLT, BMX, XVELO, USDT, oUSDT — all Transfer(indexed,indexed,uint256) from block 15110000); src/tokenBalances.ts:153-237 (handleERC20Transfer: 2x getServiceByAgent store loads per event); src/config.ts:22-25

**Fix:** Design-level: the subgraph already has refreshTokenBalanceUSDValues (helpers.ts:541-581) that can rebuild uninvested balances via balanceOf at snapshot time. Keep only the two streams that feed funding attribution (USDC handleUSDC; ETH via Safe template SafeReceived) and drop the other 12 Transfer dataSources, replacing live TokenBalance mutation with a per-snapshot balanceOf(safe) eth_call sweep (15 calls/service/day — trivial). Alternatively re-platform this subgraph to Envio/HyperIndex (precedent: predict-polymarket DW redesign) where wildcard streams are cheap. If streams must stay, at least short-circuit `from==to` and mint/burn-irrelevant pairs before the two Service.loads (cheap but minor).

**Expected gain:** Removing 12 of 14 Transfer subscriptions cuts the trigger volume the node must decode/dispatch by an order of magnitude; likely the second-largest sync win after finding #1 and the main determinant of full-resync duration. · **Effort:** days · **Risk:** Medium: balance-at-snapshot changes intra-day TokenBalance semantics (values fresh only at snapshot); funding metrics unaffected. Manifest-only removal with unchanged schema is graft-safe, but historical TokenBalance rows stop updating — acceptable if consumers read snapshots. Full re-index if semantics must be clean.

> **Verifier note:** Two caveats: USDC and USDT are wired to handleUSDC in funding.ts, not handleERC20Transfer — so 12, not 14, dataSources are pure TokenBalance streams (USDT would need its handler kept or its funding role confirmed dead before dropping). And moving TokenBalance to per-snapshot balanceOf sweeps makes uninvestedValue (read by calculatePortfolioMetrics on every tracked event via calculateUninvestedValue) stale between snapshots — acceptable for daily analytics but it is a data-freshness tradeoff, not a free win.

### 5.4 🟡 MEDIUM · eth-call — Price adapters re-fetch immutable pool metadata and bypass the WETH price cache on every quote

**Why it's hot:** getTokenPriceUSD is called from every tracked token transfer, every position event (2 tokens each), every snapshot sweep, and getEthUsd inside every calculatePortfolioMetrics call.

**Current behavior:** A cache-miss quote for one Velodrome-sourced token costs: token0 + token1 + slot0/getReserves (3 calls) + 3 more for the WETH pair leg = ~6 serial eth_calls; Balancer-sourced adds getPoolId + getPoolTokens. Multi-source tokens try ALL sources and average (priceDiscovery.ts:163-172), multiplying the fan-out. This fires from every tracked Transfer/position event (5-min TTL) and en masse at the daily snapshot (~15 tokens x N services, all stale).

**Evidence:** src/priceAdapters.ts:36-41 (try_token0/try_token1 every getVelodromePrice call); :96-104 (same for V2); :223-232 (try_getPoolId every Balancer quote); :309-316 (getPairTokenPrice calls getVelodromePrice(WETH, pool, USDC) directly, bypassing getTokenPriceUSD and its 5-min Token-entity cache)

**Fix:** (1) token0/token1/getPoolId are immutable and the pool list is hardcoded in constants.ts:64-77 — put token order + poolId into tokenConfig/constants (or a one-time PoolMeta entity), dropping 2 of 3 calls per Velodrome quote and 1 per Balancer quote; (2) make getPairTokenPrice(WETH) route through getTokenPriceUSD(WETH,...) so the WETH leg hits the 5-min cache (add a recursion guard); (3) change the cache gate to >= threshold or persist last-good price with its own TTL for low-confidence tokens.

**Expected gain:** ~60-70% fewer eth_calls per price refresh (6 -> 2 for the common WETH-paired case); shrinks both the per-event tail and the once-daily snapshot stall. · **Effort:** hours · **Risk:** Low; pure mapping change, graft-safe. Hardcoded token order must match each pool (verify once against chain).

**Cross-check:** nuanced — the 5-minute cache exists but lives on the Token entity (Token.derivedUSD/lastPriceUpdate/priceConfidence, priceDiscovery.ts:7,41-46), NOT on PriceUpdate (that is an immutable audit-log entity created per refresh). Two real miss modes: (1) any WETH-paired quote re-derives the WETH leg with 3 fresh eth_calls even if WETH was priced seconds ago; (2) priceDiscovery.ts:43 requires priceConfidence > 0.5 strictly, so a token whose sources yield <=0.5 confidence never caches and re-fans-out on every single call.

### 5.5 🟡 MEDIUM · handler-order — Cascading redundant portfolio recalculations and duplicate position refreshes per tracked event

**Why it's hot:** Fires on every tracked agent DeFi action (LP add/remove, deposit, funding transfer). Volume is agent-bounded (low) but each invocation is 10-100x more work than needed, and each redundant AgentPortfolio.save() bloats version history (no pruning, see below).

**Current behavior:** One tracked Velodrome V2 burn executes calculatePortfolioMetrics 2-3 times in the same handler; each run loads FundingBalance, iterates every position twice (value sum + active/closed count), runs calculateActualROI + aggregateClosedPositionMetrics (further position iterations in roiCalculation.ts), calls getEthUsd (possible 6-call price fan-out), and saves AgentPortfolio — creating multiple mutable entity versions per event. CL entry events triple-fetch ownerOf/positions (mitigated only by graph-node's DB call cache, still a DB roundtrip each).

**Evidence:** src/veloV2Pool.ts:147-181 -> src/veloV2Shared.ts:409-463 (refreshVeloV2PositionWithBurnAmounts calls refreshVeloV2Position at :459 which runs calculatePortfolioMetrics at :403, then calls calculatePortfolioMetrics AGAIN at :462); src/veloCLShared.ts:108-273 (WithEventAmounts does ownerOf+positions then refreshVeloCLPosition repeats ownerOf+positions+slot0); src/helpers.ts:267-294 and :307-339 (calculatePortfolioMetrics iterates all positionIds twice, with up to 2 ProtocolPosition.loads each due to the dual-ID-encoding fallback at :277-284); src/helpers.ts:75-101 (updateFunding fabricates a synthetic block and runs a full portfolio recalc per funding transfer)

**Fix:** Make calculatePortfolioMetrics run at most once per handler: drop the trailing duplicate calls (veloV2Shared.ts:462, veloV2Pool.ts pattern), pass updatePortfolio=false to inner refreshes and call it once at the end; merge the two positionIds loops in calculatePortfolioMetrics into one pass; store position IDs in one canonical encoding to kill the dual-load fallback; pass already-fetched positions data down instead of re-calling ownerOf/positions.

**Expected gain:** 2-3x fewer store writes and position loads per tracked event; fewer AgentPortfolio versions (write serialization + history size). · **Effort:** hours-to-1-day · **Risk:** Low-medium: must verify snapshot/ROI values unchanged (Matchstick tests exist pattern-wise in repo); graft-safe.

> **Verifier note:** Nit: veloCLShared.ts:287/299 are in refreshVeloCLPositionWithExitAmounts (the Decrease path), not a third fetch in the Increase path — the Increase path's third ownerOf is the top-of-handler call in veloNFTManager.ts:58. The count (3x ownerOf per tracked IncreaseLiquidity) is right, the attribution is slightly off.

### 5.6 🟡 MEDIUM · pruning — No indexerHints — full history retained for heavily-rewritten mutable entities

**Why it's hot:** Write amplification applies to every mutable save on the hot paths already identified; store size grows monotonically for a subgraph whose queries are all 'current state + snapshots'.

**Current behavior:** TokenBalance is rewritten on every tracked transfer, Token on every 5-min price refresh, AgentPortfolio multiple times per event (finding above), AgentSwapBuffer per swap — every save creates a new entity version with block-range tracking, and without prune the store keeps all of them forever, slowing writes and bloating Postgres.

**Evidence:** subgraphs/babydegen-mode/subgraph.yaml:1-4 (specVersion 1.0.0, no indexerHints block); schema.graphql: only 4 of 18 entity types immutable (PriceUpdate:142, AgentPortfolioSnapshot:196, DailyPopulationMetric:262, SwapToEntryAssociation:377)

**Fix:** Add `indexerHints:\n  prune: auto` to subgraph.yaml (supported at specVersion 1.0.0; graph-cli 0.98.1 already in use). Time-travel queries are not needed here — the schema has explicit snapshot entities (AgentPortfolioSnapshot, DailyPopulationMetric) for history.

**Expected gain:** The Graph cites large query/store wins from pruning; here it mainly caps DB growth and keeps write throughput stable over time. · **Effort:** hours (one manifest line + redeploy) · **Risk:** Blocks grafting at pruned heights and removes time-travel — fine given snapshot entities. Deploy-only change; no re-index.

> **Verifier note:** One operational caveat: prune:auto limits how far back a future graft base can reach. Fine given the snapshot entities, but if a future graft of this subgraph at an older block is wanted, `prune: <large N>` is the safer setting.

### 5.7 🟡 MEDIUM · eth-call — specVersion 1.0.0 blocks declared eth_calls for the calls that must remain

**Why it's hot:** Residual dynamic calls still run on every tracked position event and daily snapshot sweep.

**Current behavior:** All eth_calls execute serially inside handlers at RPC latency. After findings 1/2/4 remove the avoidable ones, the genuinely dynamic reads remain: slot0/getReserves for prices, positions()/ownerOf for tracked CL NFTs, balanceOf/totalSupply for V2 shares, getPoolTokens for Balancer, convertToAssets for Sturdy.

**Evidence:** subgraph.yaml:1 (specVersion: 1.0.0, apiVersion 0.0.9); package.json (graph-cli 0.98.1, graph-ts 0.38.2 — toolchain already supports 1.3.0); ~27 .bind()/try_/hasCode call sites across 9 files (priceAdapters.ts x4 contracts, veloCLShared.ts x6, veloV2Shared.ts x3, veloNFTManager.ts x3, balancerShared.ts x4, sturdyVault.ts x4, veloV2Bootstrap.ts x1, veloV2Discovery.ts x1 dead, common.ts hasCode x2)

**Fix:** Bump manifest to specVersion 1.2.0+ (1.3.0 recommended) and add `calls:` declarations on VeloNFTManager and template eventHandlers (e.g. `NonfungiblePositionManager[...].positions(event.params.tokenId)`, pool `slot0()`), so graph-node executes them in parallel ahead of the handler and serves them from cache inside it. Declared calls cannot cover block handlers, so the daily snapshot sweep stays serial.

**Expected gain:** Latency of remaining per-event calls overlaps instead of summing; modest but free once the spec bump is done. · **Effort:** hours · **Risk:** Low: spec bump is deploy-time only; verify build with graph-cli 0.98.1. Graft-safe.

> **Verifier note:** Scope limit on the declared-calls payoff: a declared call's contract address must come from event data (event.address / event.params). That covers ownerOf/positions on VeloNFTManager (event.address) and slot0/getReserves/balanceOf on VeloV2Pool template events (event.address = pool), but NOT the CL pool slot0 (pool derived from the positions() return) nor the price-adapter calls on hardcoded quote pools invoked from arbitrary handlers — those stay in-handler unless literal-address declarations are verified supported on the target graph-node. Minor census nits: veloCLShared has 7 bind sites (not 6), veloV2Shared 4 (not 3).

### 5.8 ⚪ LOW · dead-weight — Hourly scheduler poll does N+1 entity loads for a once-daily decision; dead code and unwired mapping files

**Current behavior:** Every 1800th block: load registry, loop all services loading each AgentPortfolio, log, exit. Once daily: full serial eth_call sweep for every service in a single handler invocation (can stall that block for seconds-to-tens-of-seconds as service count grows).

**Evidence:** subgraph.yaml:559-563 (polling every: 1800); src/portfolioScheduler.ts:18 (CHECK_INTERVAL declared, never used), :50-58 (log.info every poll), :70-103 (loads ServiceRegistry singleton + AgentPortfolio per service every poll), :171-183 (updateSnapshotTracking re-loads and re-saves portfolio immediately after createPortfolioSnapshot at helpers.ts:369-371 already saved the same fields — double write per snapshot); unwired files never referenced by manifest or imports: src/veloV2Discovery.ts, src/veloV2Factory.ts, src/veloV2Router.ts, src/veloV2DirectPool.ts, src/veloCLPool.ts

**Fix:** Add a singleton 'lastSnapshotDay' guard so 23/24 polls do exactly one load then exit; delete CHECK_INTERVAL and the per-poll log.info; remove the redundant updateSnapshotTracking double-save (createPortfolioSnapshot already persists the tracking fields); delete the 5 unwired mapping files (veloV2Discovery.ts also imports from a nonexistent 'USDC_Native' data source path).

**Expected gain:** Minor steady-state savings; main value is code hygiene and preventing the daily block-handler stall from growing linearly with service count. · **Effort:** hours · **Risk:** None; graft-safe.

**Cross-check:** nuanced — an 1800-block portfolio-revaluation poll with eth_call price discovery is the expected concern. Confirmed the 1800-block poll (~1h at Mode 2s blocks), but the heavy revaluation (refreshAllPositionAmounts + refreshAllUSDValues, helpers.ts:118-123) only runs when a service crosses UTC midnight — i.e. once per service per day, not every poll. 23 of 24 polls are load-check-noop. The daily fan-out itself is real: ~15 token prices x up-to-6 calls each + per-position refreshes (ownerOf/positions/slot0/getPool/balanceOf/totalSupply/getReserves/getPoolTokens) per service, executed serially in one block handler.

> **Verifier note:** One design note on the singleton lastSnapshotDay guard: isSnapshotDue currently returns true immediately for a brand-new portfolio (lastSnapshotTimestamp == 0), so a pure day-level singleton would delay a new service's first snapshot until the next UTC-midnight crossing; set the pending flag in registerServiceForSnapshots (or check a needsFirstSnapshot flag) to preserve that behavior.

### 5.9 ⚪ LOW · ids — String-shaped IDs and dual-encoding positionIds cause double loads and oversized keys

**Current behavior:** Works, but every position iteration pays a speculative failed load for one of the two encodings, and keys are ~2x larger than necessary.

**Evidence:** src/tokenBalances.ts:63,117 (TokenBalance id = Bytes.fromUTF8(hexString + '-' + hexString) — 85 UTF-8 bytes vs 40 with address.concat(token)); helpers.ts:277-284,324-330,606-612,669-675 (every positionIds consumer tries Bytes.fromUTF8(id) then a hex-decode fallback = up to 2 loads per position in 4 separate code paths); schema.graphql:25 (Service.positionIds: [String!]! mutable array rewritten on each new position); PendingMintPosition uses String id (schema.graphql:248)

**Fix:** Canonicalize position ID encoding at write time (store the exact Bytes used), drop the fallback decode; new entities should use address.concat(address)/concatI32 Bytes IDs. Full ID migration for existing entities requires re-index — only bundle it with a re-index driven by finding #3.

**Expected gain:** Halves position loads in portfolio calc paths; smaller indexes. Modest. · **Effort:** hours (canonicalize) / days (full Bytes-ID migration + re-index) · **Risk:** ID changes are NOT graft-safe (existing rows orphaned); canonicalization-only variant is graft-safe.

> **Verifier note:** Refinement: since the hex-decode branch is the one that always succeeds for CL/V2 positions, the cheapest incremental fix is to store the decodable canonical form (or decode once at write) and swap the branch order — no re-index needed for that part; only the full Bytes-ID migration needs one.

### 5.10 ⚪ LOW · template-growth · FIX-INFEASIBLE — VeloV2Pool templates and Safe templates grow without retirement — currently bounded, keep an eye on it

**Current behavior:** Pool template count is bounded by whitelisted-pair combinatorics (~tens), and each templated pool's full LP Transfer/Mint/Burn stream is processed forever with store-read guards. Safe templates accumulate one per service+operator, including deactivated services (handleCreateMultisigWithAgents marks old Service inactive but the old Safe data source keeps indexing its ExecutionSuccess events).

**Evidence:** src/veloV2Bootstrap.ts:95-99 (template per pool where BOTH tokens whitelisted, via one-shot Sugar scan + factory PoolCreated subgraph.yaml:502-523); src/serviceRegistry.ts:143-147 (Safe.create for every service multisig AND operator safe, never retired); src/veloV2Pool.ts:55-90 (every LP Transfer on templated pools does 1-2 Service.loads; mint path guarded correctly)

**Fix:** No urgent action. If whitelist grows, gate template creation on pools the agents actually enter (create in refreshVeloV2Position on first tracked position, which ensureVeloV2PoolTemplate already supports) instead of pre-creating all whitelisted-pair pools at bootstrap. Add an isActive early-exit in safe.ts handlers for retired services.

**Expected gain:** Prevents future creep; negligible today. · **Effort:** hours · **Risk:** Creating templates lazily loses history for LP positions opened before first detection — the Transfer-mint path already fires on position entry, so coverage holds. Graft-safe.

> **Verifier note:** The feasible half is the safe.ts change: add an isActive check after getServiceByAgent in handleSafeReceived/handleSafeEthTransfer to cheaply skip retired services (the entities already carry the flag). Keep the bootstrap pre-creation for pool templates — it is what makes discovery work — and if whitelist combinatorics ever become a problem, the workable lever is trimming WHITELISTED_TOKENS pairs, not lazy template creation.


## 6. `service-registry` — 7 findings (1 refuted)

**Baseline profile:**

- **specVersion**: 0.0.5 (both subgraph.gnosis.yaml and subgraph.mode-mainnet.yaml) — predates indexerHints (1.0), timeseries (1.1), declared eth_calls / topic filters (1.2)
- **apiVersion**: 0.0.6 (graph-cli 0.98.1 / graph-ts 0.38.2 pinned in package.json, so a bump to specVersion 1.3.0 / apiVersion 0.0.9 needs no tooling change)
- **data_sources**: Gnosis: 2 static (ServiceRegistryL2 0x9338b5.. from block 27871084, IdentityRegistryBridger 0x6e8F74.. from 44506664) + GnosisSafe template. Mode: 1 static (ServiceRegistryL2 0x3C1fF6.. from 14444011) + template. High-volume path: template ExecutionSuccess/ExecutionFromModuleSuccess (one event per tx per tracked Olas safe); registry events are low-volume (per service lifecycle). No chain-wide token/exchange subscriptions.
- **eth_call_sites**: 0 — no Contract.bind anywhere under src/ (mapping.ts, mapping-eth.ts, bridger.ts, utils.ts). All data comes from event params and store reads.
- **ipfs_sites**: None — no ipfs.cat and no file data sources.
- **templates**: GnosisSafe, instantiated per multisig at CreateMultisigWithAgents (src/mapping.ts:155); monotonic growth, no retirement mechanism, terminated services' safes stay tracked and fully processed.
- **immutable_entities**: 0 of 16 entities immutable (schema.graphql — every type is @entity(immutable: false)); at least 5 are write-once candidates (DailyUniqueAgent, DailyAgentMultisig, DailyActiveMultisig, Operator, Creator).
- **prune**: absent (and unsupported at specVersion 0.0.5) — full entity-version history retained on both networks

### 6.1 🔴 HIGH · pruning — specVersion 0.0.5 blocks all modern optimizations; no indexerHints prune, full history retained

**Why it's hot:** Prune applies to every entity version ever written; the writers are the per-safe-tx handlers (mapping.ts:192-230) which fire on every transaction of every Olas service multisig on Gnosis — the highest-volume stream in this subgraph.

**Current behavior:** Full entity-version history is retained forever. Because Global, AgentPerformance, DailyAgentPerformance, DailyServiceActivity etc. are all mutable and rewritten per safe transaction, the versions table grows by ~6-8 rows per ExecutionSuccess event, and none of it is ever pruned. specVersion 0.0.5 also makes timeseries/@aggregation and declared eth_calls unavailable.

**Evidence:** subgraphs/service-registry/subgraph.gnosis.yaml:1 (specVersion: 0.0.5, apiVersion 0.0.6), subgraph.mode-mainnet.yaml:1 (same); grep for indexerHints across subgraph.*.yaml: absent. package.json:12-13 already pins graph-cli 0.98.1 / graph-ts 0.38.2, so tooling supports 1.3.0 today.

**Fix:** Bump manifests to specVersion 1.3.0 / apiVersion 0.0.9 and add 'indexerHints: prune: auto'. This is a manifest-only change (mappings compile unchanged on graph-ts 0.38.2); it is the prerequisite for the timeseries finding below.

**Expected gain:** Large reduction in store size and write-side index maintenance; The Graph cites pruning as one of the biggest wins for subgraphs with high-churn mutable entities. Given Global alone has one version per safe tx (likely millions on Gnosis), the versions table shrinks by orders of magnitude. · **Effort:** hours · **Risk:** prune: auto disables time-travel queries and constrains future graft points to unpruned blocks. Deploy is graft-safe (schema unchanged); coordinate with any consumers doing block-height queries. predict-* subgraphs already re-index from genesis, so re-index fallback is acceptable.

**Cross-check:** confirmed — the perceived over-complexity is really ancient manifest + write amplification; the manifest predates every optimization lever The Graph has shipped since 2023.

> **Verifier note:** Fix must also edit subgraph.template.yaml (mode-mainnet/gnosis manifests are template-generated). Note the specVersion bump is not literally deploy-in-place: it creates a new deployment hash requiring re-index or graft. Also '~6-8 version rows per event' slightly overstates steady state: graph-node collapses multiple saves of the same entity within one block to one version row, so it is ~4-5 changed rows per event-bearing block (DailyServiceActivity, DailyAgentPerformance, AgentPerformance, Global, plus join-entity/counter rows on first-of-day).

### 6.2 🔴 HIGH · write-serialization — Global singleton rewritten on every safe transaction (txCount + lastUpdated)

**Why it's hot:** Runs unconditionally on the single highest-volume event stream: every transaction of every tracked GnosisSafe. Gnosis trader/mech agents produce thousands of safe txs per day.

**Current behavior:** Every ExecutionSuccess/ExecutionFromModuleSuccess loads Global(''), increments txCount, sets lastUpdated, and saves. Each save creates a new entity version row; on Gnosis this is one version per safe tx across all Olas multisigs since block 27871084 — a single hot row that serializes writes and bloats history.

**Evidence:** src/mapping.ts:96-101 (updateGlobalMetrics), called from handleExecutionSuccess at mapping.ts:201 and handleExecutionFromModuleSuccess at mapping.ts:222; entity declared mutable at schema.graphql:101-106.

**Fix:** Two options: (a) after the specVersion bump, replace Global.txCount with a timeseries point entity + @aggregation(fn: sum, cumulative) so the running total is computed in-database; (b) minimally, keep Global but drop lastUpdated (derivable from _meta / latest daily entity) so the row changes only when txCount does — still one write per event, so (a) is the real fix. prune: auto (finding 1) independently caps the history damage.

**Expected gain:** Eliminates 1 load + 1 write per event on the hottest row plus its entire version history; combined with the other per-event write removals, meaningful indexing-speed gain on backfill (writes dominate this subgraph — there are no eth_calls to hide behind). · **Effort:** days (option a, incl. query migration for consumers reading Global.txCount) · **Risk:** Option (a) changes the query shape for Global.txCount consumers and needs re-index (or additive graft keeping old Global frozen). Option (b) is graft-safe.

> **Verifier note:** Two nuances: (1) 'serializes writes' overstates the runtime cost — graph-node processes blocks sequentially anyway, so the real damage is version-history bloat, and versions are per-block not per-tx (multiple safe txs in one block collapse to one Global version row). (2) Global also carries totalOperators (incremented in updateUniqueOperators, utils.ts:160-169), so Global cannot be deleted outright — only txCount/lastUpdated move to the timeseries; the entity must remain for totalOperators or that counter needs its own treatment. Cumulative aggregations are also only queryable per interval bucket, changing the query shape for consumers of Global.txCount.

### 6.3 🔴 HIGH · timeseries — Four hand-rolled daily aggregation families (load-modify-save per event) — partial timeseries/@aggregation candidates

**Why it's hot:** All of this runs per ExecutionSuccess/ExecutionFromModuleSuccess — the per-safe-tx hot path; multisig.agentIds is length 1 by design (most-recent-agent selection), so the loop bodies run once but the fixed overhead is every event.

**Current behavior:** Each safe tx performs ~10-12 store ops: DailyServiceActivity load+save, DailyUniqueAgents load, AgentPerformance load (+save on create) in updateDailyUniqueAgents, DailyUniqueAgent load (+2 saves on create), DailyAgentPerformance load+save, DailyAgentMultisig load (+2 saves on create), AgentPerformance load+save AGAIN (double-loaded: utils via mapping.ts:73 and mapping.ts:60), DailyActiveMultisigs load, DailyActiveMultisig load (+2 saves on create), Global load+save. All on mutable entities with string IDs.

**Evidence:** src/mapping.ts:33-94 (updateDailyAgentPerformance, updateDailyUniqueAgents, updateDailyActivity, updateDailyActiveMultisigs, all called per event at mapping.ts:197-201 and 218-222); src/utils.ts:58-127 (getOrCreate* daily helpers), utils.ts:180-243 (join-entity dedup with count increments); schema.graphql:48-99.

**Fix:** After specVersion bump: (1) DailyAgentPerformance.txCount, AgentPerformance.txCount, Global.txCount become a single timeseries entity (one immutable insert per event) + @aggregation(intervals:["day"], fn:"sum") with dimensions on agentId — replaces 4 load-modify-save cycles with 1 append. (2) The unique-count metrics (DailyUniqueAgents.count, DailyActiveMultisigs.count, activeMultisigCount) CANNOT be expressed as @aggregate (no count-distinct fn) — keep the join-entity dedup for those but drop the denormalized counter saves and let consumers count join entities, or keep counters only on the parent. (3) Fold the duplicate AgentPerformance load by passing the entity from updateDailyUniqueAgents into updateDailyAgentPerformance (or merging the two loops — they iterate the same agentIds).

**Expected gain:** Cuts per-event store ops from ~10-12 to ~4-6 (timeseries insert + dedup joins), and moves sums into DB-side aggregation. Roughly halves write work on the dominant event stream. · **Effort:** days · **Risk:** Schema restructuring → re-index (or additive graft: add timeseries/aggregation entities alongside old ones, migrate queries, then drop old in a later re-index). Unique-count semantics must be preserved via join entities — pure @aggregation cannot replicate them; getting this wrong silently changes dashboard numbers.

**Cross-check:** confirmed — the daily-aggregation-entities-maintained-by-hand (timeseries-candidate) concern is accurate for the sum-type metrics; nuanced for the dedup counts, which have no @aggregate equivalent (no count-distinct).

> **Verifier note:** Minor: replacing AgentPerformance.txCount with a cumulative aggregation changes consumer queries (running total lives in the latest interval bucket rather than a directly-loadable entity); if the existing AgentPerformance query surface must be preserved verbatim, keep that one load-modify-save and only move Daily/Global txCounts to timeseries.

### 6.4 🟡 MEDIUM · dead-weight — DailyServiceActivity re-saved unchanged on every safe transaction

**Why it's hot:** Runs unconditionally per ExecutionSuccess/ExecutionFromModuleSuccess event.

**Current behavior:** multisig.agentIds never changes after multisig creation (set once at handleCreateMultisig, mapping.ts:168-176), so after the first tx of a given (day, service), every subsequent save writes an identical entity version. A busy multisig doing 500 txs/day creates 500 versions of the same DailyServiceActivity row per day.

**Evidence:** src/mapping.ts:78-86 (updateDailyActivity: dailyActivity.agentIds = multisig.agentIds; dailyActivity.save() unconditionally), called first at mapping.ts:197/218; getOrCreateDailyServiceActivity at src/utils.ts:58-76 already saves on create.

**Fix:** Only assign+save when the entity was just created or when agentIds actually differs: set agentIds inside getOrCreateDailyServiceActivity at creation time and delete the per-event save entirely.

**Expected gain:** Removes 1 write (and its version row) per safe tx — ~8-10% of the per-event write budget; with no prune configured, also removes the single largest source of redundant history after Global. · **Effort:** hours · **Risk:** None functionally (values identical); graft-safe — mapping-only change, data before graft point already correct.

> **Verifier note:** Impact slightly overstated: version rows are per-block, so 500 txs/day produces one row per block containing a tx, not literally 500 — still hundreds of redundant identical versions. Edge case the fix should keep: a service terminated and redeployed with a new multisig on the same day would leave the day's agentIds from the first multisig; the 'save only when agentIds differs' variant handles this, and the helper needs the agentIds passed in as a parameter since it currently doesn't receive the multisig.

### 6.5 🟡 MEDIUM · immutability — 0 of 16 entities immutable; write-once entities (join/dedup entities, Operator, Creator, ERC8004Metadata defaults) tracked as mutable

**Why it's hot:** Join entities are written on the safe-tx path (bounded to first-per-day occurrences, but the .load() dedup check on them runs on EVERY event); immutable entities are also cheaper to read.

**Current behavior:** graph-node maintains block-range validity tracking (UPDATE of prior version's upper bound on rewrite, range indexes) for all entities, including the three join entities that are created once and never mutated — and those joins are created on the hot per-safe-tx path (first activity per day per agent/multisig).

**Evidence:** schema.graphql:1-110 — every type is @entity(immutable: false). Write-once candidates: DailyUniqueAgent (62-66, only created at utils.ts:189-193), DailyAgentMultisig (77-81, utils.ts:211-215), DailyActiveMultisig (90-94, utils.ts:233-238), Operator (108-110, utils.ts:151-158), Creator (43-46, utils.ts:171-178).

**Fix:** Mark DailyUniqueAgent, DailyAgentMultisig, DailyActiveMultisig, Operator, Creator @entity(immutable: true). AgentRegistration must stay mutable (updated per RegisterInstance, utils.ts:245-259); Service/Multisig/daily parents stay mutable.

**Expected gain:** The Graph quotes up to ~48% faster indexing for immutable+bytes-ID adoption; realistic here is a modest single-digit-to-low-teens % since the highest-churn entities (Global, DailyAgentPerformance) must remain mutable. · **Effort:** hours (schema flags) but bundled with a re-index · **Risk:** Changing the immutable flag is not a graft-safe schema change → needs re-index from genesis; bundle with the timeseries restructuring and the specVersion bump into one re-index.

> **Verifier note:** Title error only: ERC8004Metadata is NOT write-once — getOrCreateERC8004Metadata saves at creation, initializeERC8004DefaultMetadata (utils.ts:312-326) saves it again with the value, and handleMetadataSet can overwrite later, so it must stay mutable. The proposed fix list correctly omits it, but the title should not name it as a candidate.

### 6.6 🟡 MEDIUM · template-growth — GnosisSafe template per multisig with no retirement; terminated services' safes remain fully tracked and fully processed

**Why it's hot:** Template count grows monotonically with services deployed on Gnosis (thousands); each additional live template adds its ExecutionSuccess stream to the trigger set forever.

**Current behavior:** Every safe ever deployed for an Olas service on Gnosis is filter-matched forever. After TerminateService, a safe that keeps transacting (safes remain usable by their owners) still increments AgentPerformance, daily metrics, and Global — full write cost AND arguably wrong analytics for retired services.

**Evidence:** Template created at src/mapping.ts:155 (GnosisSafeTemplate.create per CreateMultisigWithAgents); handleTerminateService at mapping.ts:182-190 clears service.multisig/agentIds/creator but the Multisig entity persists and graph-node cannot stop the data source; handlers at mapping.ts:192-230 then still pass both guards (Multisig.load succeeds, Service.load succeeds since Service is never deleted) and run the full ~10-op update pipeline with the multisig's stale agentIds.

**Fix:** Design-level growth is inherent to per-safe tracking (same shape as Omen), but add a settled-guard early-exit: on TerminateService, set a flag on the Multisig entity (e.g. multisig.terminated = true, additive nullable field) or compare service.multisig != multisig.id, and return before any daily-metric work in both Execution handlers. Filter-matching cost per untracked block remains, but handler cost for retired safes drops to 1-2 loads.

**Expected gain:** Proportional to the fraction of safe txs coming from terminated/re-deployed services — unquantified from code, but every long-lived subgraph of this shape accretes retired sources; also fixes a metrics-correctness wart (terminated services still counted active). · **Effort:** hours · **Risk:** Graft-safe if done via nullable field + mapping change, but CHANGES METRICS SEMANTICS (terminated services stop counting) — confirm with data consumers first; behavior differs before/after graft point.

**Cross-check:** confirmed — the growth-pattern-like-Omen-but-per-service point is accurate; no retirement mechanism exists.

> **Verifier note:** The service.multisig != multisig.id variant works because terminate sets it null and redeploy points it at the new safe, but note it also silently excludes the fallback path where multisig.serviceId was never a valid service; behavior change for terminated safes' analytics is a product decision that should be flagged to consumers, since Global.txCount would stop counting those txs going forward.

### 6.7 ⚪ LOW · ids — Long string IDs on all hot-path entities (day-{ts}-agent-{id}-0x... concatenations)

**Why it's hot:** Per-safe-tx loads/saves, but string-vs-bytes key cost is small relative to the write-amplification findings above.

**Current behavior:** Every hot-path load/save keys on UTF-8 string IDs up to ~80 chars; join-entity dedup does one string-keyed .load() per event per family. Bytes IDs would halve key size and speed comparisons.

**Evidence:** schema.graphql:1 (Service id: ID! string), 27-32, 48-99 (all daily + join entities ID!); src/utils.ts:63-66, 98-101, 187, 207-209, 230-232 (string .concat chains incl. multisig.id.toHexString()).

**Fix:** If/when the re-index bundle (immutability + timeseries) happens, switch join/daily IDs to Bytes: e.g. Bytes.fromI32(dayTs).concat(multisigAddress).concatI32(agentId). Not worth a standalone deploy.

**Expected gain:** Small single-digit %; The Graph bundles this with immutability for its ~28%/48% figures — most of the win there comes from the immutable flag. · **Effort:** hours, but only inside the re-index bundle · **Risk:** ID type change is never graft-safe → re-index; breaks any consumer queries filtering on id format.

> **Verifier note:** Minor API detail in the sketch: dayTs is a BigInt in the mappings, so Bytes.fromI32(dayTs) does not typecheck as written — use Bytes.fromI32(dayTs.toI32()) (safe until 2038) or ByteArray.fromBigInt. Also note this is the lowest-impact finding of the set — key-size savings are marginal relative to the timeseries/immutability changes it must ride along with.


## 7. `mech` — 5 findings

**Baseline profile:**

- **specVersion**: 1.0.0
- **apiVersion**: 0.0.7
- **data_sources**: 6 static dataSources (AgentFactory V1-V4, AgentRegistry, ServiceRegistryL2 — all low-volume, Olas-scoped contracts) + 1 dynamic template; all event volume concentrates in AgentMech template instances (Request/Deliver events). No chain-wide subscriptions.
- **eth_call_sites**: 0 — no Contract.bind() anywhere under src/; all lookups resolved from indexed entities (CreateMech/MechAgent/CreateMultisigWithAgents chains in src/utils.ts)
- **ipfs_sites**: 2 synchronous call paths, each up to 2 sequential ipfs.cat per event: handleRequest (agent-mech.ts:44,49 via getMetadata) and handleDeliver (via getResponseMetadata:57). No file data sources. Manifest declares features: ipfsOnEthereumContracts (subgraph.yaml:226-227).
- **immutable_entities**: 15 of 24 entities immutable; notable mutable ones: Request (hottest entity, write-once — should be immutable), Global, Sender, Service, MechAgent, RequestsPerAgentOnchain, CreateMech, CreateMultisigWithAgents, AgentMultisigAssociation
- **prune**: 300
- **templates**: AgentMech (ethereum/contract) — instantiated once per CreateMech event from any of the 4 factory dataSources (agent-factory.ts:43); mech population is small (tens) and legacy/deprecated, so template growth is not a concern

### 7.1 🔴 HIGH · ipfs — Synchronous ipfs.cat (up to 2 sequential fetches) blocks every Request event

**Why it's hot:** Request is one of the two highest-volume events in the subgraph — every legacy AgentMech request on Gnosis (trader/mech agents, historically hundreds of thousands of requests) fires it via the AgentMech template. Old CIDs are increasingly unpinned, so the double-timeout worst case becomes the common case during a full re-sync.

**Current behavior:** handleRequest calls getMetadata -> tryGetIpfsResponse, which does one blocking ipfs.cat and, on miss, a second blocking ipfs.cat with the bare hash. A missing/garbage-collected CID stalls the block for the full node-side timeout, twice, per request. All parsing (prompt, tool, questionTitle) happens inline on the indexing critical path.

**Evidence:** subgraphs/mech/src/agent-mech.ts:43-50 (tryGetIpfsResponse: ipfs.cat(hash+'/metadata.json') then fallback ipfs.cat(hash)), :88-136 (getMetadata), :191 (called in handleRequest); manifest feature flag subgraph.yaml:226-227 (ipfsOnEthereumContracts)

**Fix:** Move IPFS parsing to a file data source: add `templates: - name: RequestMetadata, kind: file/ipfs` with a handler writing a new immutable ParsedRequest entity (keyed by CID or request id) holding prompt/tool/questionTitle; handleRequest only computes the CID string and calls RequestMetadata.create(cid). Keep existing Request.prompt/tool/questionTitle fields nullable-empty for backward compat or expose ParsedRequest via a derived link. The sibling marketplace subgraph already implemented exactly this pattern (repo commit 44bc774 'fetch delivery IPFS metadata off the indexing critical path') and can be copied.

**Expected gain:** Removes 1-2 blocking IPFS round-trips (each up to the node ipfsMaxAttempts/timeout budget) from every Request; on re-sync with unpinned CIDs this is typically the single largest wall-clock component. Likely order-of-magnitude sync-time reduction for the Request-heavy block ranges. · **Effort:** days (1-2) · **Risk:** Graft-safe if additive: new entity + new file template; file-data-source entities are isolated so prompt/tool must live on the new entity (existing Request fields are already nullable in schema.graphql:41-43). Data becomes eventually-consistent (metadata fills in asynchronously) — consumers querying prompt immediately after the request block may see it later.

**Cross-check:** confirmed — the sync-ipfs.cat-on-request/deliver-paths concern is real on both paths

> **Verifier note:** One mechanism gap: a single file/ipfs template cannot reproduce the try-metadata.json-then-bare-hash fallback, because an unresolvable path never fires the handler (graph-node just retries in the background forever) — there is no 'miss' signal. Either spawn two templates per request (RequestMetadata.create(cid + '/metadata.json') and RequestMetadata.create(cid)) with an idempotent handler keyed so whichever resolves first wins, or accept covering only the primary path. Also note the CID here is the base16 string 'f01701220' + hex, which file/ipfs data sources accept, including /path suffixes.

### 7.2 🔴 HIGH · ipfs — Synchronous ipfs.cat (up to 2 sequential fetches) blocks every Deliver event

**Why it's hot:** Deliver fires once per fulfilled request on every AgentMech template instance — same volume driver as Request.

**Current behavior:** handleDeliver fetches {ipfsHash}/{requestId}/metadata.json and falls back to the bare path — up to 2 blocking ipfs.cat calls per delivery. Deliver volume is approximately equal to Request volume (one delivery per request), so this doubles the IPFS stall budget per request/deliver pair.

**Evidence:** subgraphs/mech/src/agent-mech.ts:52-86 (getResponseMetadata -> tryGetIpfsResponse at :57), :248 (called in handleDeliver); schema.graphql:62-63 (toolResponse: String!, model: String! non-nullable)

**Fix:** Same mechanism: file/ipfs data source template writing an immutable ParsedDelivery entity (model, toolResponse) keyed by CID+requestId; handleDeliver only records the CID and spawns the template. Requires making Deliver.toolResponse/model nullable or moving them to the new entity. Also fixes latent crash risk while there: agent-mech.ts:78 and :80 use non-null assertions (`jsonObj.get("result")!.toString()`, `metadata.get("model")!.toString()`) — a payload with `metadata` but no `result`/`model`, or a non-string kind, traps and deterministically fails the whole subgraph.

**Expected gain:** Same magnitude as the Request finding — removes 1-2 blocking IPFS round-trips per delivery; combined with the Request fix, the sync critical path becomes pure store operations. · **Effort:** days (1-2, shares plumbing with the Request fix) · **Risk:** Making toolResponse/model nullable on Deliver is an allowed graft change (non-nullable -> nullable), so the whole fix can graft onto the current deployment. The `!` assertion fix is pure hardening, no risk.

**Cross-check:** confirmed — sync ipfs.cat present on deliver path too

> **Verifier note:** Same fallback caveat as finding 0: a file/ipfs template cannot express the two-path fallback in one data source; spawn both candidate paths or keep only '{cid}/{requestId}/metadata.json'. Independent of the FDS migration, lines 78/80 should be fixed immediately with kind-checked gets (cheap, no schema change) since they are an active determinism/crash risk.

### 7.3 🟡 MEDIUM · immutability — Request — the highest-volume entity — is declared mutable but is never mutated after creation

**Why it's hot:** One Request entity per Request event — the dominant write volume in the subgraph.

**Current behavior:** Every Request row carries block-range validity tracking (and would carry version churn if ever rewritten) despite being write-once. The delivery linkage was already designed correctly via @derivedFrom, so nothing updates Request post-creation.

**Evidence:** schema.graphql:35 (@entity(immutable: false)); src/agent-mech.ts:153-234 (only writer); :254-272 (handleDeliver loads Request read-only, links via Deliver.request + @derivedFrom at schema.graphql:47, never saves Request)

**Fix:** Change to `@entity(immutable: true)`. Optionally in the same pass switch `id: ID!` (String hex, agent-mech.ts:154 requestId.toHexString()) to `Bytes!` for cheaper keys — CreateMech/Deliver already use Bytes IDs. Update Deliver.request reference type accordingly.

**Expected gain:** The Graph cites ~48% faster indexing for immutable entities (skips block-range validity bookkeeping) — applied here to the single hottest write path; realistically a noticeable but secondary gain versus the IPFS fixes since store writes are cheap next to IPFS stalls today, but it becomes the main remaining cost after they land. · **Effort:** hours · **Risk:** Not graft-safe (changing immutability/ID type of an existing entity type isn't an allowed graft change) — needs re-index or a graft with a renamed entity. Correctness precondition: legacy AgentMech requestIds are keccak-derived and unique across mechs, so write-once holds; if a duplicate requestId ever re-fired, an immutable entity would trap instead of silently overwriting.

**Cross-check:** nuanced — most event-log entities are already immutable (15 of 24); the one omission is the entity that matters most

> **Verifier note:** Two qualifiers: (a) changing the immutable flag is NOT a graft-compatible schema change, so this requires a fresh full re-index rather than a graft hotfix — acceptable given the re-index-over-graft preference, but worth stating; (b) with indexerHints prune: 300 already active, the version-churn benefit is modest (immutability mainly saves the block_range upper-bound bookkeeping and speeds queries), so this is a correctness-of-declaration/query-perf win more than an indexing-speed win.

### 7.4 🟡 MEDIUM · write-serialization — Global singleton plus 3-5 mutable counter entities rewritten on every Request and Deliver

**Why it's hot:** Runs on every Request and Deliver — the two volume-driving events.

**Current behavior:** handleRequest performs up to 5+N entity writes (Request, Sender, Global, AtaTransaction, Service, N RequestsPerAgentOnchain rows for the service's agent composition); handleDeliver another 4-5. Every save of a mutable entity creates a new version row; the Global singleton makes all Request/Deliver writes contend on one row.

**Evidence:** src/agent-mech.ts:161-182 and :302-318 (Global load-modify-save per event); :156-159 + :181 (Sender); :218-231 (Service.totalRequests + per-agent loop calling getOrCreateRequestsPerAgentOnchain save per agentId in composition); :281-287 (Service.totalDeliveries); :290-300 (MechAgent.totalTransactions); schema.graphql:155-161 (Global mutable)

**Fix:** If counters must stay exact and queryable as running totals, keep them (prune: 300 already caps the version-history bloat). Otherwise bump specVersion to >= 1.1.0 (graph-cli 0.98.1 supports it) and replace Global/Sender/Service request-and-delivery totals with timeseries + @aggregation entities computed in-database, dropping most per-event mutable saves. Cheap partial win with no schema change: the N-way RequestsPerAgentOnchain loop is redundant write amplification — mech services have small compositions today but it is per-request O(N) load+save.

**Expected gain:** Low-to-moderate — store writes are fast relative to IPFS; after the IPFS fixes this becomes the residual per-event cost. Eliminating ~6-10 mutable-version writes per request/deliver pair reduces write amplification and Postgres churn on re-sync. · **Effort:** days (timeseries migration) / hours (loop-only trim) · **Risk:** Timeseries/aggregation changes the query API shape (consumers must query aggregation intervals, not a Global row) — needs downstream coordination; not graft-safe for replaced fields. Given the subgraph is deprecated in favor of marketplace, probably only worth it if a full re-index is planned anyway.

> **Verifier note:** Caveats on the aggregation route: (a) query shape changes — aggregations are interval-bucketed (hour/day) entities, not a singleton Global, so consumers must query the latest bucket's cumulative value; (b) the ATA dedup logic must stay imperative — keep the AtaTransaction guard and conditionally append an immutable timeseries data point (which is still cheaper than mutable row rewrites); (c) 'contend on one row' is version-churn/write-amplification, not concurrency contention (handlers run serially) — and prune: 300 already caps most of that cost, so the practical win is smaller than it first appears. The RequestsPerAgentOnchain O(N) loop observation is accurate and is the cheapest partial win.

### 7.5 ⚪ LOW · pruning — Prune already configured (prune: 300) — no action needed, but note graft constraint

**Why it's hot:** n/a — configuration, not a code path

**Current behavior:** History retained for only 300 blocks — store size and time-travel overhead already minimized; this also caps the version-bloat cost of the mutable counter entities above.

**Evidence:** subgraph.yaml:4-5 (indexerHints: prune: 300)

**Fix:** Keep as-is. Only note: any graft-based hotfix (e.g. the IPFS file-data-source fix) must graft within ~300 blocks of the base deployment's head, so coordinate graft block choice with deployment timing.

**Expected gain:** none (already optimal) · **Effort:** none · **Risk:** none

**Cross-check:** confirmed — prune is present, contrary to the usual legacy-subgraph default of absent

> **Verifier note:** Minor refinements: prune: 300 is a lower bound on retention (graph-node prunes lazily, so the actual earliest available block may be older than head-300, giving slightly more slack than 'exactly 300'); on Gnosis (~5s blocks) 300 blocks is roughly 25 minutes, so graft-block choice must be made at deploy time against the live base head. Also note the predict-* subgraphs re-index over grafting, which sidesteps this constraint entirely for schema-changing fixes like findings 1-3.


## 8. `autonolas` — 7 findings

**Baseline profile:**

- **specVersion**: 0.0.5
- **apiVersion**: 0.0.7
- **data_sources**: 3 static dataSources, all Ethereum mainnet from block 15,178,253: ComponentRegistry (0x15bd...1776), AgentRegistry (0x2F1f...9112), ServiceRegistry (0x48b6...75cA). Highest-volume path: ServiceRegistry's 7 lifecycle events (each service deployment cycle emits 5+); overall absolute volume is registry-scale (thousands to low tens of thousands of events) — no chain-wide token/exchange streams, all Transfer handlers are the registries' own NFT transfers.
- **eth_call_sites**: 12 distinct .bind( call sites, all in src/registry.ts: lines 232, 248, 264, 281 (ownerOf on create/update for components+agents, non-try_), 297, 316 (tokenURI), 299, 318 (ownerOf on services), 393 (getService), 404 (getAgentInstances), 413 (try_ownerOf — the only guarded call), 420 (tokenURI, duplicate). No declared eth_calls (needs specVersion 1.2.0 — unavailable on graph-cli 0.64.0).
- **ipfs_sites**: 6 synchronous ipfs.cat sites in src/registry.ts (:122 metadata fetch; :100,:102,:104,:106 the 4-file package-type probe), invoked from every create/update and all 7 service lifecycle handlers; CreateService/UpdateService fetch the same metadata file twice per event. No file data sources (would need only a specVersion 0.0.5 -> 0.0.7 bump — supported by current graph-cli 0.64.0). Manifest declares ipfsOnEthereumContracts + fullTextSearch (latter unused).
- **immutable_entities**: 0 of 4 entities immutable (Unit, Service, Global, Builder all mutable; Builder is write-once and could be immutable today)
- **prune**: absent (indexerHints unsupported at specVersion 0.0.5)
- **templates**: none — no dynamic data sources

### 8.1 🔴 HIGH · ipfs — Synchronous ipfs.cat on the indexing critical path for every create/update/service-lifecycle event, with up to 4 extra sequential IPFS probes for 2-part package names

**Why it's hot:** This is the dominant wall-clock cost of the whole subgraph. Absolute event volume is registry-scale (thousands to low tens of thousands since block 15,178,253), but each event costs seconds (multi-second IPFS RTT) to minutes (4x timeout on probe misses) instead of microseconds, and every ServiceRegistry lifecycle event re-fetches metadata that almost never changes.

**Current behavior:** Every CreateUnit/UpdateUnitHash (component + agent) and every ServiceRegistry lifecycle event (CreateService, UpdateService, ActivateRegistration, RegisterInstance, DeployService, TerminateService, OperatorUnbond) blocks block processing on a synchronous ipfs.cat of the metadata JSON. For 2-part names (AUTHOR/NAME:VERSION) it then issues up to 4 more sequential ipfs.cat probes for files that mostly do NOT exist — each miss blocks until the node's IPFS timeout, so a single 'unknown'-type component can stall indexing for 4x the timeout. Misses also permanently bake 'n/a'/'unknown' into entities with no retry.

**Evidence:** src/registry.ts:122 (getMetadata ipfs.cat), src/registry.ts:98-111 (tryGetPackageType: 4 sequential ipfs.cat probes for protocol.yaml/connection.yaml/contract.yaml/skill.yaml), called from storeUnit at :176 and updateServiceState at :420; wired to handlers for CreateUnit, UpdateUnitHash (components+agents) and all 7 ServiceRegistry events via handleServiceUpdate (:444-452); subgraph.yaml:105 declares ipfsOnEthereumContracts

**Fix:** Migrate metadata resolution to file data sources (templates kind: file/ipfs). This is available WITHOUT the Tier 3 toolchain migration: apiVersion is already 0.0.7, only the manifest specVersion needs bumping 0.0.5 -> 0.0.7, which graph-cli 0.64.0 supports. Constraint: FDS-created entities must be written only by FDS handlers, so split metadata fields (publicId, packageHash, packageType, image, description) into a new immutable UnitMetadata entity keyed by the CID, linked from Unit/Service. The tryGetPackageType probe pattern is incompatible with FDS 'fire-on-found' semantics — either spawn one FDS per candidate yaml (FDS handlers may spawn further FDS; the ones that resolve set the type) or drop probing and derive type from metadata content. FDS also gives node-side retry (ipfsMaxAttempts) and async backfill when files appear late, fixing the current permanent-'n/a' data-quality hole.

**Expected gain:** Removes essentially all IPFS latency from the block-processing path; sync time for the affected blocks should drop from IPFS-bound (seconds-to-minutes per event) to eth_call-bound (tens of ms). Likely order-of-magnitude reduction in full-sync time. · **Effort:** days · **Risk:** Needs re-index or careful graft: the schema change is additive (new UnitMetadata entity + link field = graft-safe), but historical Unit rows keep old inline values while new rows use the link, so consumers must query both, or a re-index restores consistency. FDS entities are immutable — UpdateUnitHash must link a NEW metadata entity rather than overwrite.

**Cross-check:** confirmed with one nuance: the ipfs.cat-on-every-registry-event concern — Transfer handlers (registry.ts:334-390) do NOT touch IPFS; it is every create/update/service-lifecycle event. The up-to-4-extra-probes claim is confirmed exactly (registry.ts:100-110).

> **Verifier note:** Minor: the 4-probe yaml pattern under FDS means the never-found candidates retry in the background indefinitely (wasted node work, though off the critical path); the finding's alternative — deriving type from metadata content and dropping probing — is the cleaner variant. Also note each FDS handler can only write its own entities, so per-yaml probe results must land in per-FDS entities (or one FDS per unit whose handler spawns the winner), which is clunkier than the one-line description suggests. Schema change means re-index or graft.

### 8.2 🟡 MEDIUM · eth-call — CreateService/UpdateService perform duplicate work: 2x tokenURI, 2x full IPFS metadata fetch, plus 4 more eth_calls, per event

**Why it's hot:** CreateService and UpdateService fire for every service creation and config change on mainnet; each currently pays double the already-expensive IPFS+RPC cost.

**Current behavior:** handleCreateService/handleUpdateService each do: tokenURI + ownerOf eth_calls, an ipfs.cat via createOrUpdateUnit, then handleServiceUpdate which does getService + getAgentInstances + try_ownerOf + a second tokenURI + a second ipfs.cat of the exact same metadata file. Total: 6 eth_calls + 2 blocking IPFS fetches per event. The UpdateService event already carries the new configHash as its bytes32 param, and getService returns configHash, so both tokenURI calls are reconstructible for free (Base16HashPrefix + configHash, same pattern the component/agent handlers use).

**Evidence:** src/registry.ts:296-313 (handleCreateService: tokenURI :297, ownerOf :299, then createOrUpdateUnit -> getMetadata ipfs.cat, then handleServiceUpdate), src/registry.ts:315-332 (handleUpdateService same shape), src/registry.ts:392-429 (updateServiceState: getService :393, getAgentInstances :404, try_ownerOf :413, tokenURI AGAIN :420 -> getMetadata AGAIN on the same hash)

**Fix:** Fetch metadata once and pass the Metadata struct into both storeUnit and updateServiceState; derive the metadata CID from event.params (UpdateService) or serviceInfo.configHash (already returned by the :393 getService call) instead of tokenURI; drop the redundant second ownerOf (try_ownerOf at :413 already covers it). Cuts CreateService/UpdateService from 6 eth_calls + 2 IPFS fetches to 2 eth_calls + 1 IPFS fetch with zero schema change.

**Expected gain:** Roughly halves the per-event cost of the two heaviest handlers in the subgraph; combined with finding 1 it removes the IPFS half entirely. · **Effort:** hours · **Risk:** Low; pure mapping refactor, output entities identical, graft-safe (no schema change). Verify configHash-derived CID matches tokenURI output on a few historical services before deploying.

**Cross-check:** extends the prior finding: ownerOf/tokenURI/getService are the known calls, but tokenURI + the full IPFS fetch are each executed TWICE per CreateService/UpdateService, and getAgentInstances (:404) is a 4th distinct call that's easily missed.

> **Verifier note:** The end-state count is slightly optimistic: with zero schema change you land at 3 eth_calls (getService + getAgentInstances + try_ownerOf, reusing try_ownerOf's value for both Unit.owner and Service.owner) + 1 IPFS fetch, not 2 + 1. Getting to 2 eth_calls requires deriving owner from the mint Transfer via a stash entity (finding 2's pattern extended to services) — which IS a schema addition — and only covers CreateService; UpdateService can read owner from the already-loaded entity since handleServiceTransfer (:366-389) keeps it current.

### 8.3 🟡 MEDIUM · eth-call — Unguarded ownerOf eth_call on every component/agent CreateUnit and UpdateUnitHash is avoidable and is also a determinism/crash hazard

**Why it's hot:** Fires on every component and agent registration and hash update on mainnet — the second-highest-volume handler group after service lifecycle events.

**Current behavior:** handleCreateComponent/handleUpdateComponent/handleCreateAgent/handleUpdateAgent each issue a bare (non-try_) ownerOf eth_call per event. The information is already on-chain-event-derivable: the ERC721 mint Transfer(zero->owner) is emitted in the same tx before CreateUnit (mint happens inside create() before the CreateUnit emit), and the Transfer handlers (:334, :350) keep Unit.owner current thereafter. For UpdateUnitHash the owner does not change at all — the existing entity already holds it. A bare ownerOf revert would also deterministically fail the subgraph.

**Evidence:** src/registry.ts:232, :248, :264, :281 (non-try ownerOf), src/registry.ts:334-364 (Transfer handlers that already maintain Unit.owner)

**Fix:** For CreateUnit: stash the mint recipient from the Transfer(zero->x) handler in a temporary keyed entity (the repo's existing PendingMechData cross-handler pattern) and consume it in the CreateUnit handler; for UpdateUnitHash: load the existing Unit and keep entity.owner. Removes 4 of the 12 eth_call sites (plus 2 more via finding 2). Declared eth_calls ('calls:' on eventHandlers, parallel + cached) are NOT an option here — they need specVersion 1.2.0 / graph-cli >= 0.71, blocked until the Tier 3 Wave 3 migration.

**Expected gain:** One RPC round-trip (~50-200ms) saved per create/update event; secondary to the IPFS findings but nearly free to take alongside them. Also removes a crash-on-revert failure mode. · **Effort:** hours · **Risk:** Low-medium: relies on Transfer-before-CreateUnit log ordering (holds for the GenericRegistry _safeMint-then-emit implementation — verify against the contract source); graft-safe if the pending entity is added additively to the schema.

**Cross-check:** confirmed — unguarded eth_calls (ownerOf per event); additionally these are non-try_ calls, so unguarded is true in the crash sense too, except try_ownerOf at :413 which is guarded.

> **Verifier note:** The stash entity is a small schema addition (re-index or graft needed). A belt-and-braces variant: fall back to try_ownerOf if the stash is missing, so historical edge cases can't crash or mis-attribute.

### 8.4 ⚪ LOW · eth-call — handleServiceUpdate refetches full on-chain service state (getService + getAgentInstances) on all 7 lifecycle events instead of deriving from event params

**Why it's hot:** Service lifecycle events are the most frequent ServiceRegistry events (each service deployment cycle emits 5+), though mainnet absolute volume is modest.

**Current behavior:** ActivateRegistration, RegisterInstance, DeployService, TerminateService, OperatorUnbond each trigger getService + getAgentInstances + try_ownerOf + tokenURI + ipfs.cat, even though the service state machine is deterministic per event type (Activate->ActiveRegistration, Deploy->Deployed, Terminate->TerminatedBonded, etc.), RegisterInstance carries the new instance address in its params, and the metadata/configHash cannot change on these events at all.

**Evidence:** src/registry.ts:392-411 (getService :393, getAgentInstances :404-411), src/registry.ts:454-472 (5 thin handlers all funneling into handleServiceUpdate), subgraph.yaml:92-101 (RegisterInstance event already carries operator, serviceId, agentInstance, agentId params)

**Fix:** Maintain Service.state as an event-driven state machine, append instances from RegisterInstance params, reset on Terminate/OperatorUnbond, and skip metadata resolution entirely on the 5 non-Create/Update events (only CreateService/UpdateService can change configHash). Keep getService as a try_ fallback or drop it once the state machine is validated against current store contents.

**Expected gain:** Eliminates 3-4 eth_calls and 1 IPFS fetch per lifecycle event (the IPFS part overlaps with finding 1). Meaningful only after findings 1-2 land; listed for completeness. · **Effort:** days · **Risk:** Medium: state-machine drift vs. contract edge cases (slashing, forced termination) would silently corrupt Service.state, whereas getService is always ground truth. Validate by diffing derived state against getService on a staging deploy. Graft-safe (no schema change).

**Cross-check:** confirmed — getService per event; nuance: the expensive part on 5 of 7 events is the bundled tokenURI+ipfs.cat, not getService itself.

> **Verifier note:** Two gaps in the pure-state-machine version: (1) multisig is set at deploy time and DeployService carries only serviceId — you'd need to also handle the ServiceRegistry's CreateMultisigWithAgents(serviceId, multisig) event (a manifest eventHandler addition, allowed at specVersion 0.0.5) or keep getService on DeployService only; (2) OperatorUnbond removes that operator's instances but the event doesn't list them — requires an operator->instances join entity built from RegisterInstance params. The pragmatic first step (skip metadata + tokenURI on the 5 lifecycle events, keep getService/getAgentInstances) is zero-risk and already removes the IPFS fetch and 1 eth_call per event.

### 8.5 ⚪ LOW · immutability — Zero immutable entities; Builder is write-once and can be @entity(immutable: true) today

**Why it's hot:** Builder writes happen once per unique minter address — low frequency; the ~48% immutable-write speedup applies to a small write share here.

**Current behavior:** Unit, Service, Global, Builder are all mutable. Unit/Service/Global are legitimately mutable (owner transfers, hash updates, running totals). Builder is created once per unique minter and never touched again, but still pays block-range versioning on write and range checks on query.

**Evidence:** schema.graphql:12,26,30,38 (all four types are plain @entity); src/registry.ts:73-96 (Builder created once, never updated)

**Fix:** Mark Builder @entity(immutable: true) — supported by graph-cli 0.64.0 / apiVersion 0.0.7, no toolchain migration needed. Optionally also convert Builder/Global String ids to Bytes ids (Builder = address bytes) for cheaper writes, but that changes ids -> re-index; do it only if re-indexing anyway for finding 1.

**Expected gain:** Marginal in isolation; near-free to include in the same schema PR as finding 1. · **Effort:** hours · **Risk:** immutable flag on Builder is behavior-identical (never mutated) but is a schema change -> graft-safe additive? Changing mutability is NOT graft-compatible in all graph-node versions; safest bundled with the finding-1 re-index.

**Cross-check:** immutable entities ARE available on the current 0.64.0 toolchain; declared eth_calls (specVersion 1.2.0), topic filters (1.2.0), timeseries @aggregation (1.1.0), and indexerHints prune (1.0.0, cli >= ~0.67) are NOT until Tier 3 Wave 3.

> **Verifier note:** The win is small in absolute terms — Builder is an id-only entity written once per unique minter (thousands of rows). Note that flipping mutability is a schema change requiring a redeploy, and mutable->immutable is not a graft-safe transformation, so bundle it with a re-indexing change (e.g., finding 0) as the finding itself suggests for the Bytes-id variant.

### 8.6 ⚪ LOW · pruning — No indexerHints prune — blocked by specVersion 0.0.5, note for the toolchain migration

**Why it's hot:** Write-amplification on Service/Global versions; low absolute volume.

**Current behavior:** Full entity-version history is retained. History growth is real but bounded: the main churn source is Service rows being fully rewritten on every lifecycle event (each write = new entity version) and Global rewritten per mint. Store size is small in absolute terms (thousands of entities).

**Evidence:** subgraph.yaml:1 (specVersion: 0.0.5, no indexerHints block)

**Fix:** When Tier 3 Wave 3 bumps this subgraph to specVersion >= 1.0.0 / modern graph-cli, add 'indexerHints: prune: auto' (time-travel queries are not a use case for a registry-lookup API). Cannot be done at 0.0.5.

**Expected gain:** Modest store-size and write-throughput improvement; mostly future-proofing. · **Effort:** hours (as part of the migration PR) · **Risk:** prune blocks time-travel queries and constrains future graft bases to unpruned ranges; confirm no consumer uses block-height queries.

**Cross-check:** prune is one of the fixes unavailable until the graph-cli 0.64.0 -> 0.98.x migration.

### 8.7 ⚪ LOW · dead-weight — Dead fullTextSearch feature flag and heavy per-event multi-line log.info calls

**Why it's hot:** Runs on every event; cost is small per event but it is the only remaining per-event overhead after findings 1-3.

**Current behavior:** fullTextSearch is declared but unused (no @fulltext directive) — pure manifest dead weight. Every handler emits 1-3 multi-line log.info calls with 8-10 stringified args (BigInt.toString, array toString), adding host-call and string-alloc overhead per event and bloating indexer logs; updateServiceState (:431) stringifies the entire service struct on every lifecycle event.

**Evidence:** subgraph.yaml:104 (fullTextSearch declared; schema.graphql has zero @fulltext directives), src/registry.ts:192-195, :213-224, :341-344, :356-359, :373-376, :383-386, :431-441 (verbose log.info on every entity write)

**Fix:** Remove the fullTextSearch feature entry; demote the per-write log.info calls to log.debug or delete them (keep log.warning/log.error paths). No schema change, graft-safe, deployable immediately.

**Expected gain:** Single-digit-percent handler-CPU at best; mainly hygiene. · **Effort:** hours · **Risk:** None.

> **Verifier note:** Impact framing: this is the lowest-severity finding — the fullTextSearch entry has ~zero runtime cost (it is manifest hygiene only), and the log overhead is host-call/string-alloc noise that matters mainly during full syncs. Worth doing, but as a rider on a real change rather than its own deploy.


## 9. `autonolas-base` — 7 findings

**Baseline profile:**

- **specVersion**: 0.0.5
- **apiVersion**: 0.0.7
- **data_sources**: 1 static dataSource: ServiceRegistryL2 on Base (0x3C1fF68f5aa342D296d4DEe4Bb1cACCA912D95fE, startBlock 10827670) with 9 eventHandlers; volume driver is service lifecycle churn (CreateService/RegisterInstance/DeployService/TerminateService cycles), all funneling into updateServiceState. Plus dynamic GnosisSafe data sources (1 eventHandler: SafeReceived, low volume).
- **templates**: GnosisSafe — instantiated per multisig at CreateMultisigWithAgents, gated to services containing agent ID 41 (registryL2.ts:338-348); no retirement mechanism.
- **eth_call_sites**: 8 distinct .bind( sites, all in src/registryL2.ts (lines 174, 176, 193, 195, 234, 245, 254, 261); 4-6 sequential calls execute per lifecycle event, only 1 of 8 uses try_. src/safe.ts has zero eth_calls.
- **ipfs_sites**: 5 ipfs.cat sites, all in src/registryL2.ts: getMetadata:65 (per lifecycle event, twice per Create/Update) + tryGetPackageType:43,45,47,49 (up to 4 sequential probes whose result is always discarded in this subgraph). No file data sources — all IPFS is synchronous on the indexing critical path.
- **immutable_entities**: 1 of 4 entities immutable (Multisig). Unit, Service, DailyActivity mutable; Unit and Service are fully rewritten per event.
- **prune**: absent (specVersion 0.0.5 predates indexerHints)
- **toolchain_note**: graph-cli 0.64.0 / graph-ts 0.29.1 / matchstick-as 0.6.0. Declared eth_calls (spec 1.2.0) and timeseries aggregations (spec 1.1.0) are out of reach until the Tier 3 Wave 3 migration; file data sources (spec 0.0.7) and indexerHints prune (spec 1.0.0) ARE reachable on the current CLI via manifest-only bumps. Deployed instance is currently failed with indexing_error — consistent with unguarded eth_calls / unchecked JSON casts (see findings).

### 9.1 🔴 HIGH · ipfs — Blocking ipfs.cat on every service lifecycle event, including up to 4 always-dead probe fetches for files that never exist

**Why it's hot:** updateServiceState runs on all 9 handled events. Base hosts high-churn service creation (e.g. agents.fun-era minting); each service generates Create + Activate + N×RegisterInstance + Deploy (+ Terminate/Unbond/redeploy cycles), so thousands of services multiply into tens of thousands of IPFS round-trips, each blocking the block. With unreachable/GC'd IPFS content, each event can stall multiple timeout periods (2 metadata cats + up to 8 probe cats on Create/Update).

**Current behavior:** Every lifecycle event (CreateService, UpdateService, ActivateRegistration, RegisterInstance, DeployService, TerminateService, OperatorUnbond, CreateMultisigWithAgents) reaches updateServiceState (registryL2.ts:285-293) which calls getMetadata -> synchronous ipfs.cat that stalls the block until content arrives or node-side timeout. For 2-part package names, getMetadata additionally calls tryGetPackageType which does up to 4 MORE sequential ipfs.cat calls for protocol.yaml/connection.yaml/contract.yaml/skill.yaml — content that typically does not exist, so each probe waits out the full IPFS timeout. Worse: in this subgraph the tryGetPackageType result is ALWAYS discarded — storeUnit is only ever called with packageType="service" (registryL2.ts:187, :206) which overrides it, and updateServiceState (:261-270) only reads publicId/packageHash/description from the metadata, never pakageType. So the 4 probe cats are 100% dead work on the critical path. Additionally handleCreateService/handleUpdateService fetch the SAME metadata hash twice per event (once via createOrUpdateUnit->storeUnit:119, once via handleServiceUpdate->updateServiceState:261).

**Evidence:** subgraphs/autonolas-base/src/registryL2.ts:43-53 (tryGetPackageType: 4 sequential ipfs.cat probes), :64-65 (getMetadata -> ipfs.cat), :119 (storeUnit -> getMetadata), :261 (updateServiceState -> getMetadata); manifest subgraph.yaml has no file-data-source templates

**Fix:** Three-part fix: (1) delete/short-circuit tryGetPackageType — pass a skipPackageType flag or hardcode "service" since only services are indexed here (zero-risk, pure win); (2) fetch metadata once per event and pass the Metadata struct into both storeUnit and updateServiceState; (3) move metadata resolution off the critical path with file data sources (templates kind: file/ipfs) — set packageHash/publicId/description placeholders synchronously and let a UnitMetadata file handler fill them asynchronously with node-side retry (ipfsMaxAttempts). File data sources require specVersion >= 0.0.7; graph-cli 0.64.0 supports this, so only a manifest specVersion bump is needed, not the full Tier-3 toolchain migration.

**Expected gain:** Largest single win. Removing dead tryGetPackageType probes plus deduping the double metadata fetch cuts worst-case IPFS waits per Create/Update event from up to 10 cats to 1; moving that 1 to a file data source removes IPFS from the critical path entirely. For subgraphs bottlenecked on sync IPFS this is typically an order-of-magnitude sync-time improvement. · **Effort:** hours for (1)+(2); ~1-2 days for the file-data-source refactor (3) · **Risk:** (1)+(2) are behavior-preserving for stored data (graft-safe, but a graft won't backfill already-indexed blocks — mostly moot since the deployment is failed and needs re-index anyway). (3) changes metadata fields to eventually-consistent (file handler entities are isolated: file-data-source handlers cannot update chain-based entities, so metadata must move to a separate entity linked from Unit/Service — schema change, re-index).

**Cross-check:** confirmed — same sync-IPFS class as the autonolas mainnet subgraph, with the extra aggravation that the 4-probe tryGetPackageType path is provably dead code here

> **Verifier note:** One design constraint the fix glosses over: a file-data-source handler cannot mutate the chain-handler-owned Unit/Service entities ('fill them' as written is not allowed — FDS entities live in an isolated causality region and must be created immutable by the FDS handler only). The metadata fields must move into a separate immutable UnitMetadata entity created by the file handler and referenced from Unit/Service by CID-derived ID (schema change + query-shape change for consumers). Parts (1) and (2) — deleting tryGetPackageType and fetching metadata once per event — are zero-risk and need no manifest change at all.

### 9.2 🔴 HIGH · eth-call — 4-6 sequential eth_calls per lifecycle event, with duplicated calls in Create/Update handlers and state that could be derived from event params

**Why it's hot:** Same volume driver as the IPFS finding: every registry lifecycle event on a high-churn Base registry. RegisterInstance fires once per agent instance per registration cycle — the highest-multiplicity event — and currently costs 4 eth_calls + 1 ipfs.cat each.

**Current behavior:** updateServiceState (registryL2.ts:233-283) makes 4 eth_calls per invocation (getService, getAgentInstances, try_ownerOf, tokenURI) and runs on all 9 events. handleCreateService/handleUpdateService add 2 more (tokenURI + ownerOf at :174-176/:193-195) before calling handleServiceUpdate, so Create/Update = 6 eth_calls per event, with tokenURI and ownerOf each executed twice for the same serviceId in the same handler. All calls are sequential (no declared eth_calls at specVersion 0.0.5). Meanwhile several values are recomputable without calls: RegisterInstance event params already carry (operator, serviceId, agentInstance, agentId) so the instances list could be appended incrementally; state transitions are implied by which event fired (ActivateRegistration->1... DeployService->4, TerminateService->5); CreateMultisigWithAgents carries the multisig address as a param.

**Evidence:** subgraphs/autonolas-base/src/registryL2.ts:174 (tokenURI), :176 (ownerOf), :193 (tokenURI), :195 (ownerOf), :234 (getService), :245-248 (getAgentInstances), :254 (try_ownerOf), :261 (tokenURI again). 8 .bind( sites total, all firing per event via updateServiceState

**Fix:** Short term: dedupe the repeated tokenURI/ownerOf inside handleCreateService/handleUpdateService (pass values through instead of re-binding). Medium term: derive instances/state/multisig from event params and keep at most one getService call on Create/Update only (config-changing events), turning ActivateRegistration/RegisterInstance/Deploy/Terminate/Unbond into call-free incremental updates. Declared eth_calls ('calls:' on eventHandlers, parallel + cached) require specVersion >= 1.2.0 — blocked on the Tier 3 Wave 3 toolchain migration off graph-cli 0.64.0, so event-derivation is the practical mechanism now.

**Expected gain:** Cuts per-event RPC round-trips from 4-6 to 0-1 on the hottest events. Secondary to the IPFS fix in wall-clock terms (eth_calls are ms-scale vs IPFS timeout seconds-scale) but significant against a rate-limited RPC gateway. · **Effort:** hours (dedupe) / 2-3 days (event-derived state) · **Risk:** Event-derived state must exactly mirror contract state machine (e.g. update() resets instances; slash/unbond edge cases) — needs careful mapping of ServiceRegistryL2 semantics and a re-index to validate. Dedupe-only change is graft-safe/behavior-identical.

**Cross-check:** confirmed — matches the unguarded-eth_calls-per-event class flagged for autonolas

> **Verifier note:** Three details: (a) updateServiceState runs on 8 of 9 events, not all 9 — handleServiceTransfer (211-231) does store-only updates; (b) the event->state map is off: ActivateRegistration transitions to state 2 (ActiveRegistration), not 1, and TerminateService/OperatorUnbond outcomes depend on bonded operators (terminate -> 5 only if bonds exist, else 1; unbond -> 1 only when the last operator unbonds), so pure event->constant derivation is wrong for those two — either keep one try_getService on terminate/unbond or track per-operator instance counts from RegisterInstance's operator param; (c) the tokenURI call at line 261 is already redundant today independent of any refactor, since metadataHash is derived from getService().configHash at line 238 and the IPFS hash can be built from it (Base16HashPrefix pattern).

### 9.3 🔴 HIGH · other — Deterministic-failure abort points likely explain the current indexing_error: non-try eth_calls, unchecked JSON casts, and forced non-null entity casts

**Why it's hot:** Not a throughput issue per se, but a single bad event anywhere in the stream halts all indexing forever, which is the ultimate indexing-speed regression (speed = 0).

**Current behavior:** Any of: a reverted tokenURI/ownerOf/getService call, an IPFS metadata file that is not valid JSON, JSON missing code_uri/name, or a name field that is not a JSON string, causes a deterministic WASM trap and permanently fails the deployment — consistent with the known failed-with-indexing_error state of the deployed instance. None of these paths use try_ variants or json.try_fromString.

**Evidence:** subgraphs/autonolas-base/src/registryL2.ts:174,176,193,195,234,245,261 (non-try tokenURI/ownerOf/getService/getAgentInstances — a single revert aborts the subgraph); :68-70 (json.fromString on arbitrary IPFS bytes, then 'metadata.get("code_uri") as JSONValue' / 'name as JSONValue' — null cast traps if keys missing or content isn't a JSON object); :72-73 (.toString() on non-string JSONValue traps); src/safe.ts:15-16 ('Multisig.load(...) as Multisig' and 'Service.load(...) as Service' — trap if null); registryL2.ts:39 ('Bytes.fromHexString("sr")' — "sr" is not hex; parses to garbage/zero bytes, a latent ID-collision hazard

**Fix:** Guard every abort point: use try_tokenURI/try_ownerOf/try_getService/try_getAgentInstances with fallback values; json.try_fromString + isSet/kind checks before .toString(); null-check Multisig/Service loads in handleSafeReceived and early-return. Replace Bytes.fromHexString("sr") with Bytes.fromUTF8("sr"). This is a prerequisite for any performance work — the subgraph must first be able to sync at all.

**Expected gain:** Unblocks the failed deployment; without it no other optimization matters. · **Effort:** hours · **Risk:** Low. Requires redeploy/re-index of the already-failed instance (nothing healthy to graft onto). Verify which specific event triggered the current error via the indexer's subgraph status endpoint to confirm the fix covers it.

**Cross-check:** confirmed — these unguarded deterministic paths are consistent with an instance that fails to index (indexing_error)

> **Verifier note:** Minor mechanics: (a) 'metadata.get("code_uri") as JSONValue' does not trap at the cast itself — AssemblyScript reference casts are unchecked; the trap fires at the subsequent null-deref/kind-assert in .toString() — same net effect, slightly different abort site; (b) the safe.ts:15-16 casts are unlikely to fire in practice since Multisig and Service are always saved before GnosisSafe.create (registryL2.ts:344-348), so they are defensive hardening, not a probable cause of the indexing error — the probable culprits are the non-try eth_calls and the JSON path; (c) Bytes.fromHexString("sr") passes the even-length assert and I8.parseInt('sr',16) yields 0, so the prefix is a single 0x00 byte — confirmed garbage, but the 'ID-collision hazard' is overstated (all Unit ids share the same prefix and Service uses a separate table), and switching to Bytes.fromUTF8("sr") changes every existing Unit id, requiring a from-scratch reindex (no graft). The causal link to the currently deployed indexing_error is plausible but not verifiable from the repo alone.

### 9.4 🟡 MEDIUM · pruning · FIX-INFEASIBLE — No indexerHints pruning; specVersion 0.0.5 cannot express it

**Why it's hot:** Every Service/Unit save creates a new entity version; pruning caps the table size the write path must maintain.

**Current behavior:** Full entity-version history is retained. Unit and Service are mutable and rewritten wholesale on every lifecycle event (registryL2.ts:139, :292), so each of the tens of thousands of events appends a new row version — the store grows linearly with event count and writes slow as history accumulates.

**Evidence:** subgraphs/autonolas-base/subgraph.yaml:1 (specVersion: 0.0.5; no indexerHints block anywhere in the manifest)

**Fix:** Bump manifest specVersion to >= 1.0.0 and add 'indexerHints: { prune: auto }'. graph-cli 0.64.0 supports specVersion 1.0.0 manifests, so this does not require the Tier 3 toolchain migration. Since the consumers query current state and daily aggregates (no time-travel queries evident), prune: auto is safe.

**Expected gain:** Bounded store size and steadier write throughput late in the sync; The Graph reports meaningful indexing-speed improvement from prune:auto on mutable-heavy schemas. · **Effort:** hours (manifest-only, but do it in the same redeploy as the failure fixes) · **Risk:** Pruning removes time-travel and limits this deployment's use as a future graft base. Since it is already failed and must re-index, now is the cheapest moment.

**Cross-check:** confirmed — legacy specVersion is the blocker, same as autonolas mainnet

> **Verifier note:** Two working alternatives: (a) bump only graph-cli to >=0.66.0 (e.g., 0.66-0.69) — this is a CLI-only bump that does not cross the AssemblyScript/apiVersion boundary, so it is still far short of the Tier 3 Wave 3 migration, then add specVersion 1.0.0 + indexerHints { prune: auto } (graph-node 0.40.1 supports it); or (b) prune indexer-side with zero manifest changes — 'graphman prune <deployment>' or GRAPH_HISTORY_BLOCKS_OVERRIDE achieves the same result today with the pinned toolchain. The 'prune: auto is safe' judgment is sound: schema and consumers (current state + DailyActivity) show no time-travel query dependence.

### 9.5 🟡 MEDIUM · write-serialization — Full Service+Unit rewrite (with all fields recomputed) on every event, even when nothing changed

**Why it's hot:** Same event stream as above; every event writes a full new version of a wide entity with several long string fields.

**Current behavior:** OperatorUnbond, TerminateService, ActivateRegistration etc. each trigger a complete refetch and unconditional .save() of the Service entity (all ~14 fields) plus, on Create/Update, the Unit entity. Combined with mutability this maximizes new-entity-version churn and serializes writes behind the eth_call/IPFS latency documented above.

**Evidence:** subgraphs/autonolas-base/src/registryL2.ts:285-293 (handleServiceUpdate always loads-or-creates and saves), :233-283 (updateServiceState unconditionally reassigns every field from fresh eth_calls + IPFS)

**Fix:** After moving to event-derived updates (see eth-call finding), only touch the fields the event actually changes (e.g. TerminateService: state only; RegisterInstance: instances+numberOfInstances). Optionally split rarely-changing metadata (publicId/packageHash/description) into a separate entity so lifecycle events never rewrite metadata strings.

**Expected gain:** Smaller row versions and fewer bytes written per event; compounding with prune:auto. Modest on its own, meaningful in aggregate. · **Effort:** folds into the event-derivation refactor (days total, shared) · **Risk:** Same as event-derivation: must mirror contract semantics; needs re-index.

> **Verifier note:** One overstatement: graph-node's entity cache diffs the saved entity against the version it read and elides no-op overwrites, so an event where literally nothing changed does not append a new row version — the churn claim only materializes when at least one field differs (which, to be fair, is the common case for lifecycle events since state/instances usually change). The write-amplification framing should be 'full-row rewrite whenever anything changes, gated behind full refetch latency always', not 'new version on every event unconditionally'.

### 9.6 ⚪ LOW · template-growth — GnosisSafe templates accumulate per agent-41 multisig with no retirement; DailyActivity uses a growing string array + String ID

**Why it's hot:** SafeReceived fires only when a tracked safe receives native ETH — orders of magnitude rarer than registry lifecycle events on these agents.

**Current behavior:** Every agent-41 service multisig spawns a permanent GnosisSafe data source; graph-node filters SafeReceived for all of them forever, including terminated services (the handler early-exits via state/multisig/agent guards at safe.ts:19-31, which is the right shape — guards run before any write). DailyActivity dedupes via an in-entity services array with linear .includes scan, rewritten on each new service per day.

**Evidence:** subgraphs/autonolas-base/src/registryL2.ts:348 (GnosisSafe.create per multisig, never retired); src/safe.ts:36-51 (DailyActivity.services string-array dedupe, String day-{ts} ID); schema.graphql:49-54

**Fix:** Growth is design-inherent and SafeReceived is a low-volume event (native ETH receipt only, not ExecutionSuccess), so accept it; the guards already minimize per-event work. If DailyActivity ever grows large, replace the services array with a join entity (DailyActiveService, load-or-create keyed day+serviceId, as service-registry does) — also fixes O(n) array scans and array rewrite churn. Timeseries @aggregation is not available at this specVersion.

**Expected gain:** Marginal today; prevents pathological growth if agent-41 fleet scales to thousands of safes. · **Effort:** hours (join-entity swap) · **Risk:** Schema change -> re-index; low correctness risk.

> **Verifier note:** Small nit: the 'guards run before any write' framing overlooks that safe.ts:15-16 performs two store loads (Multisig, Service) via forced casts before the guards — cheap, but it is the per-event floor cost, and those unguarded casts are finding 2's territory. Also note DailyActivity's String ID and Int count are fine at this volume; the join-entity refactor changes the query shape for consumers, so it should be bundled with the (already reindex-forcing) fixes from findings 0-2 rather than shipped alone.

### 9.7 ⚪ LOW · dead-weight — Unused manifest features, non-functional test suite, and a deploy script pointing at a nonexistent manifest path

**Why it's hot:** Not hot-path; hygiene that de-risks the actual performance refactors.

**Current behavior:** Feature flags declared but unused (harmless to indexing speed, but signals drift); the documented deploy path cannot work as written; zero real test coverage over handlers that are about to be refactored.

**Evidence:** subgraphs/autonolas-base/subgraph.yaml:72-74 (features fullTextSearch — no @fulltext directive exists in schema.graphql; ipfsOnEthereumContracts — the data-source address is a plain hex address, feature unused); package.json deploy-base script references profiles/l2/subgraph.base.yaml which does not exist (only ./subgraph.yaml); tests/ are auto-generated boilerplate importing a nonexistent src/component-registry handler (acknowledged in the subgraph CLAUDE.md)

**Fix:** Drop both feature flags, fix or remove the deploy-base script, and write minimal Matchstick tests for handleServiceUpdate-derived state and handleSafeReceived guards before attempting the eth-call/IPFS refactors above (mock getService/getAgentInstances with createMockedFunction).

**Expected gain:** No direct indexing speedup; reduces refactor risk. · **Effort:** hours · **Risk:** None (graft-safe, no schema/behavior change except feature-flag removal, which is manifest-only).

> **Verifier note:** Correctly self-assessed as not an indexing-speed issue (feature flags in the manifest do not slow indexing; they are capability declarations). Sequencing advice is sound and worth keeping: land the tests before the finding-1/2 refactors since those rewrite the exact code paths under test.


## 10. `staking` — 4 findings

**Baseline profile:**

- **specVersion**: 1.0.0
- **apiVersion**: 0.0.7
- **data_sources**: 1 static dataSource (StakingFactory @ 0x75D5...1B76, mode-mainnet, startBlock 14444647; 5 low-volume admin/lifecycle events) + 1 dynamic template. No chain-wide subscriptions (no token Transfer streams). Highest-volume triggers are the template's Checkpoint (~daily per instance) and stake/unstake events — Mode chain volume for this protocol is low overall, so total handler workload is small; indexing time is dominated by block scanning, not handler cost.
- **templates**: StakingProxy — instantiated per staking instance at StakingFactory.InstanceCreated (src/staking-factory.ts:20); 9 event handlers (Checkpoint, Deposit, RewardClaimed, ServiceStaked/Unstaked/ForceUnstaked, ServiceInactivityWarning, ServicesEvicted, Withdraw). No retirement mechanism; instance count on Mode is in the tens.
- **eth_call_sites**: 2 distinct .bind( sites: src/staking-factory.ts:44 (handleInstanceCreated — 15 sequential unchecked getters, once per instance) and src/utils.ts:25 (getOlasForStaking — 2 calls, invoked per-event from 3 handlers in src/staking-proxy.ts:142,201,240). No declared eth_calls (specVersion 1.0.0 predates them).
- **ipfs_sites**: None — no ipfs.cat, no file data sources. metadataHash is stored raw, never resolved.
- **immutable_entities**: 16 of 19 entities immutable. Mutable: Service, Global (singleton, id ''), CumulativeDailyStakingGlobal — all legitimately mutable aggregates. Raw event-log entities are all immutable with Bytes IDs; minor nit: Service/RewardUpdate/Global use String IDs and CumulativeDailyStakingGlobal uses Bytes.fromUTF8(timestamp-string), but at this volume it is immaterial.
- **prune**: auto (subgraph.mode-mainnet.yaml:2-3) — already set; note prune:auto constrains time-travel queries and grafting bases, which is fine for this analytics use case.

### 10.1 🟡 MEDIUM · eth-call — getOlasForStaking makes 2 live eth_calls per stake/unstake event for immutable per-instance constants already fetched at creation

**Why it's hot:** Stake/unstake/force-unstake are the main recurring user events across all StakingProxy template instances (Optimus et al. on Mode). Absolute volume on Mode is modest (likely low thousands of events), but at ~50-200ms per RPC call these are the dominant per-handler cost in the whole subgraph — everything else is pure event-param copying.

**Current behavior:** Every ServiceStaked, ServiceUnstaked, and ServiceForceUnstaked event issues 2 synchronous eth_calls (numAgentInstances, minStakingDeposit) against the proxy. Both values are immutable per staking instance and were ALREADY fetched in handleInstanceCreated (staking-factory.ts:49,54) and stored on the StakingContract entity — but that entity is keyed by txHash.concatI32(logIndex) (staking-factory.ts:36), so it cannot be looked up by instance address (event.address) from the proxy handlers.

**Evidence:** subgraphs/staking/src/utils.ts:24-31 (StakingProxyContract.bind + numAgentInstances() + minStakingDeposit()); call sites: src/staking-proxy.ts:142 (handleServiceForceUnstaked), :201 (handleServiceStaked), :240 (handleServiceUnstaked)

**Fix:** In handleInstanceCreated, additionally write a lookup entity keyed by instance address (e.g. StakingContractParams @entity(immutable: true) { id: Bytes! /* instance addr */, numAgentInstances, minStakingDeposit }), or precompute and store the stakeAmount itself. In getOlasForStaking, load by event.address and only fall back to the eth_calls if the entity is missing (covers instances created before the fix on a graft). Alternative mechanism: bump specVersion 1.0.0 -> 1.2.0 and declare the two calls as declared eth_calls ('calls:' on the three eventHandlers) so they run in parallel and hit the node call cache — but the store-lookup fix eliminates the calls entirely and is strictly better here.

**Expected gain:** Eliminates ~2 RPC round-trips per stake/unstake event; on the order of minutes-to-tens-of-minutes off a full re-sync depending on event count, and removes the single biggest per-event latency source. Modest in absolute terms due to Mode volume. · **Effort:** hours · **Risk:** Low. Additive schema change -> graft-safe; the eth_call fallback preserves correctness for pre-graft instances. Values are contract-immutable so caching cannot go stale.

**Cross-check:** confirmed with nuance — the stake/unstake-handlers-call-proxy-live-per-event concern is accurate (2 calls per event, 3 handlers), but on Mode these events are low-volume, so this is the top ROI item rather than a crisis.

> **Verifier note:** Minor: the fix must be made in subgraph.template.yaml as well (subgraph.mode-mainnet.yaml is generated from the template via networks.json), and the schema addition requires a redeploy/graft — the proposal's graft fallback already anticipates this. Call sites use event.params._event.address, which is equivalent to event.address.

### 10.2 ⚪ LOW · eth-call — 15 unchecked (non-try_) eth_calls in handleInstanceCreated — perf-cheap but a deterministic-failure risk

**Why it's hot:** Not hot — fires once per staking-contract deployment; instance count on Mode is small (tens). Cost is one-time and negligible for indexing speed.

**Current behavior:** On each InstanceCreated event, 15 sequential eth_calls populate the immutable StakingContract entity. None use try_ variants: if any instance's implementation lacks a getter or reverts (the factory verifier does not guarantee the full StakingProxy interface), the mapping traps and the subgraph enters a failed state (unrecoverable deterministic error).

**Evidence:** subgraphs/staking/src/staking-factory.ts:44-60 (StakingProxyContract.bind(event.params.instance) followed by 15 direct getters: metadataHash, maxNumServices, rewardsPerSecond, minStakingDeposit, minStakingDuration, maxNumInactivityPeriods, livenessPeriod, timeForEmissions, numAgentInstances, getAgentIds, threshold, configHash, proxyHash, serviceRegistry, activityChecker)

**Fix:** Perf: nothing needed; optionally, after a specVersion 1.2.0 bump, move all 15 into declared eth_calls on the InstanceCreated eventHandler so they execute in parallel (15x latency -> ~1x). Robustness (the real issue): switch to try_ variants with sane defaults / skip-on-revert so a single non-conforming instance cannot halt indexing. Note declared calls that revert also fail the handler, so try_ in-mapping is the safer form if non-conforming instances are plausible.

**Expected gain:** Negligible indexing-speed gain (once per instance). Main gain is removing a subgraph-halting failure mode. · **Effort:** hours · **Risk:** Low. Mapping-only change, no schema impact, graft-safe. try_ defaults must be chosen carefully so StakingContract fields are not silently wrong.

**Cross-check:** confirmed — the ~15-unchecked-eth_calls-once-per-instance concern: yes, exactly 15, and yes, cheap for performance; the unchecked part is a correctness/availability risk, not a speed one.

### 10.3 ⚪ LOW · write-serialization — Checkpoint handler loads ALL Service entities twice and re-loads Global three times per checkpoint

**Why it's hot:** Checkpoint fires roughly once per livenessPeriod (~daily) per StakingProxy instance, so with N instances it is the most frequent 'heavy' handler; cost grows linearly with total Service count. On Mode (tens of instances, hundreds of services) this is small today but is the only O(all-entities)-per-event pattern in the subgraph.

**Current behavior:** Every Checkpoint event runs upsertCumulativeDailyStakingGlobal, which materializes the full derived Service collection twice (once to compute the median with an O(S log S) sort, once only to read its length) and loads the Global singleton three times. Checkpoint also iterates event.params.rewards doing per-service load/save (staking-proxy.ts:45-57), which is unavoidable, but the double full-collection load is not.

**Evidence:** subgraphs/staking/src/utils.ts:95 (computeMedianOfAllServices -> global.services.load() at :119), utils.ts:99 (second full global.services.load() just for .length), utils.ts:60+98+118 (getOrCreateGlobal called 3x in the checkpoint path); driver: src/staking-proxy.ts:60-65 (handleCheckpoint)

**Fix:** Load global.services.load() once in upsertCumulativeDailyStakingGlobal, pass the array into computeMedianOfAllServices, and take numServices from the same array's length; hoist a single getOrCreateGlobal() and thread it through. Optionally maintain a numServices counter on Global (incremented in handleServiceStaked on first-create) to avoid the collection load for the count entirely. The median genuinely needs all values, so one full load stays.

**Expected gain:** Halves the store reads of the checkpoint path; small in absolute terms at current Mode scale, prevents superlinear degradation if service count grows. · **Effort:** hours · **Risk:** None meaningful. Pure mapping refactor, identical results, graft-safe (no schema change unless the numServices counter is added, which is additive).

> **Verifier note:** The claim slightly undercounts getOrCreateGlobal: a 4th call occurs at utils.ts:70 when a new day snapshot is created. The one full services.load() that remains is genuinely required for the median, as the finding states.

### 10.4 ⚪ LOW · template-growth — StakingProxy templates accumulate per instance with no retirement, but instance count is bounded and small

**Why it's hot:** Filter-set size affects every block scanned, but Olas staking deployments on Mode number in the tens — far below the range where dynamic-data-source count degrades block processing.

**Current behavior:** One dynamic data source per staking instance, forever; InstanceRemoved/InstanceStatusChanged(false) do not (and cannot) retire the template, so every historical instance's address stays in the log filter set for all subsequent blocks.

**Evidence:** subgraphs/staking/subgraph.mode-mainnet.yaml:41-86 (templates: StakingProxy); src/staking-factory.ts:20 (StakingProxy.create on every InstanceCreated); handleInstanceRemoved (staking-factory.ts:65-77) records the event but graph-node cannot stop a dynamic data source

**Fix:** No action needed at current scale. If the factory ever hosts hundreds of instances, revisit (e.g. early-exit guards keyed on an InstanceRemoved-derived 'retired' flag to skip entity work for removed instances — the events themselves would still be delivered).

**Effort:** hours (guard) / n/a today · **Risk:** None — recommendation is to do nothing.

**Cross-check:** confirmed — the StakingProxy-templates-per-instance point is accurate; volume-wise it's moot on Mode.


## 11. `tokenomics` — 1 finding (1 refuted)

**Baseline profile:**

- **specVersion**: 0.0.5
- **apiVersion**: 0.0.7
- **data_sources**: 1 dataSource: OLAS ERC-20 at 0xcfD1D50ce23C46D3Cf6407487B2F8934e96DC8f9 on mode-mainnet, startBlock 14443184, single eventHandler Transfer(indexed address,indexed address,uint256) -> handleTransfer. Token-scoped (source.address set), NOT chain-wide. No block handlers, no call handlers.
- **eth_call_sites**: 0 — grep for '.bind(' across src/ returns nothing; handlers use only event params and store reads
- **ipfs_sites**: none — no ipfs.cat, no file data sources
- **templates**: none
- **immutable_entities**: 1 of 3 entities immutable: Transfer @entity(immutable: true) (schema.graphql:14). Token and TokenHolder are correctly mutable (running balances/holderCount). All IDs are Bytes; Transfer uses hash.concatI32(logIndex) (src/olas-l2.ts:7-9) — already best-practice
- **prune**: absent (and unsupported at specVersion 0.0.5 — requires >= 1.0.0)

### 11.1 ⚪ LOW · pruning — No indexerHints prune setting (blocked by ancient specVersion 0.0.5)

**Why it's hot:** handleTransfer runs on every OLAS Transfer on Mode — the only handler in the subgraph. Volume is low (single token, niche L2), so history growth is slow in absolute terms.

**Current behavior:** Full entity history is retained forever. The mutable Token singleton and TokenHolder entities get a new version row on every Transfer event, and none of it is ever pruned. specVersion 0.0.5 / apiVersion 0.0.7 predates indexerHints support (requires specVersion >= 1.0.0), even though tooling is already graph-cli 0.98.1 / graph-ts 0.38.2.

**Evidence:** subgraphs/tokenomics/subgraph.mode-mainnet.yaml:1 (specVersion: 0.0.5, no indexerHints block); subgraphs/tokenomics/subgraph.template.yaml:1

**Fix:** Bump specVersion to 1.3.0 and apiVersion to 0.0.9 in subgraph.template.yaml (propagates to subgraph.mode-mainnet.yaml via generate), add `indexerHints: { prune: auto }`. Rebuild — no mapping changes needed; the AS code compiles unchanged under apiVersion 0.0.9.

**Expected gain:** Small but free: caps Postgres history table growth and speeds writes to the Token singleton over time. At current OLAS-on-Mode volume this is hygiene, not a sync-time win. · **Effort:** hours (mostly a build/deploy smoke test) · **Risk:** prune:auto disables time-travel queries and constrains future grafting to unpruned blocks. Manifest-only change with unchanged schema — graft-safe onto the existing deployment (grafting itself needs specVersion features declaration if used). Verify no consumer relies on time-travel over Token/TokenHolder history.

> **Verifier note:** Two evidence details are overstated. (1) The Token singleton does NOT get a new version row on every Transfer: graph-node's EntityCache drops no-op writes (Overwrite is emitted only when data changed), so Token only versions on mint/burn or holder zero-crossings. The real pruning payload is TokenHolder, which genuinely versions on every transfer touching it. (2) prune: auto removes only non-current historical versions; the immutable Transfer entities are event-log rows that pruning does not delete, so table growth from Transfer is unaffected by this fix.


---

# Part 2 — Manifest & schema survey (all packages)

| Subgraph | specVersion | prune | Immutable | Bytes IDs | eth_calls | IPFS | High-volume sources | Templates | Graft |
|---|---|---|---|---|---|---|---|---|---|
| **predict-polymarket** | 1.0.0 / apiVersion 0.0.7 | indexerHints prune: 300 | 8/14 immutable; mutable: TraderAgent, DepositWallet, Bet, MarketParticipant, Global, DailyProfitStatistic (aggregation/settlement state) | 10 Bytes vs 4 ID/String — String hot entities: Bet, MarketParticipant (agentAddress_conditionId), DailyProfitStatistic, TraderService | 1 bind() site (src/conditional-tokens.ts:105); no declared eth_calls | none | Global pUSD ERC-20 Transfer stream on Polygon (0xC011a7E1..., every pUSD transfer — highest-volume single stream in repo, being replaced by Envio WalletDeployed design); chain-wide ConditionalTokens, CTFExchange/NegRiskCTFExchange v1+v2 OrderFilled streams, OptimisticOracleV3, NegRiskAdapter, 4 collateral adapters. No block handlers, no templates (store-reads only) | none | base QmNUEbuDnozskYSzHQLHah2RUjKzvoj5Y4nS7nBEDxB1kE @ block 86236542 (pUSD source startBlock pinned to graft block, forward-only) |
| **pearl-transactions** | 1.0.0 / apiVersion 0.0.7 | indexerHints prune: auto | 2/17 immutable (ServiceNftCustodyChange, AgentBondAttributionGuard); mutable event-log-shaped: FundsMovement, AgentFundingEvent, TokenBalance; Pending* entities are intentional mutable scratch | 15 Bytes vs 2 ID (Service serviceId-string, DailyServiceFunds composite) | 2 bind() sites (src/staking-factory.ts:30, src/utils.ts:115); no declared eth_calls | none | 4 full chain-wide ERC-20 Transfer streams on Gnosis: OLAS, WrappedNative (WXDAI), USDC, USDCe — every transfer of each token indexed. No block handlers | StakingProxy, Safe | none |
| **marketplace** | 1.2.0; apiVersion mixed: gnosis manifest all 0.0.9, other 6 networks 0.0.7 for on-chain sources + 0.0.9 for the two file/ipfs templates | indexerHints prune: 300 (all 7 manifests) | 23/40 immutable. Notable mutable event-log-shaped: Request, Deliver, CreateMech, RequestToMech, RequestToMarketplace (updated across request/delivery lifecycle, so deliberately mutable); PendingMechData is intentional mutable scratch | 25 Bytes vs 14 ID/String; hot legacy entities Request, Deliver, RequestsPerAgent, Mech, Service use id: ID! (hex-string/uint256), while Marketplace* event entities use Bytes | 15 bind() sites (13 in src/marketplace/fee-utils.ts — Chainlink aggregators, Balancer pools, NVM ratios; 2 in src/marketplace/utils.ts). No declared eth_calls (calls:) despite specVersion 1.2.0 supporting them | Both: file/ipfs data sources ParsedRequestFile/ParsedDeliveryFile (async, off critical path) for request/delivery metadata; residual SYNC ipfs.cat in src/agent-mech.ts:106,111 (legacy gnosis mechs) and src/marketplace/utils.ts:673,677 (mech metadata) | No chain-wide token streams, no block handlers. Volume driven by MechMarketplaceV1/V2 + per-mech templates; ServiceRegistryL2, Karma, ComplementaryServiceMetadata static sources | AgentMech (gnosis only), MechFixedPriceNative, MechFixedPriceToken, MechNvmSubscriptionNative, MechNvmSubscriptionTokenUSDC (dynamic via MechFactory) + ParsedRequestFile/ParsedDeliveryFile (file/ipfs) | gnosis manifest only: base QmS6nd5CWtHsN7oyrnKzVe2BzEFmLiNhkcJ83CvPuGtuPy @ block 46901841; other 6 networks no graft |
| **predict-omen** | 1.0.0 / apiVersion 0.0.7 | indexerHints prune: 300 | 3/11 immutable (TraderService, ConditionPreparation, PayoutRedemption); mutable event-log-shaped: Bet, FixedProductMarketMakerCreation, Question (mutable by design for Reality.eth re-answers) | 3 Bytes vs 8 ID/String — String-heavy: Bet, MarketParticipant (address_marketId), DailyProfitStatistic (address_day), TraderAgent, Question all ID! (hot settlement path) | 0 bind() sites; no declared eth_calls | none | Chain-wide ConditionalTokens + Realitio (all Omen LogNewAnswer events, not just agent markets) + FPMMDeterministicFactory; per-market FixedProductMarketMaker template. No block handlers | FixedProductMarketMaker (dynamic per FPMM creation) | none |
| **babydegen-mode** | 1.0.0 / apiVersion 0.0.9 | absent (no indexerHints) — notable given its volume | 4/18 immutable (PriceUpdate, AgentPortfolioSnapshot, DailyPopulationMetric, SwapToEntryAssociation); mutable event-log-shaped: SwapTransaction, ProtocolPosition, TokenBalance, FundingBalance | 17 Bytes vs 1 String (SwapToEntryAssociation txHash-poolAddress composite) — mostly Bytes | 28 bind() sites — heaviest in repo: veloCLShared.ts (7), balancerShared.ts (4), priceAdapters.ts (4), sturdyVault.ts (4), veloV2Shared.ts (4), veloNFTManager.ts (3), veloV2Bootstrap/Discovery (2); no declared eth_calls | none | 14 full ERC-20 Transfer streams (USDC, WETH, MODE, OLAS, STONE, BMX, XVELO, USDT, +6 unnamed) + LiFiDiamond + BalancerVault (0xBA12...2C, all Balancer pool balance changes) + SturdyVault; TWO block handlers: PortfolioScheduler polling every: 1800 blocks + VeloV2Sugar filter kind: once bootstrap | VeloV2Pool, Safe | none |
| **service-registry** | 0.0.5 / apiVersion 0.0.6 — oldest in repo (gnosis, mode-mainnet, and template manifests all identical) | absent (no indexerHints) | 0/16 — every entity explicitly immutable: false, including event-log/append-only-shaped ones (AgentRegistration, DailyUniqueAgent, DailyAgentMultisig, DailyActiveMultisig join entities) — biggest immutability gap in repo | 3 Bytes vs 13 ID/String — String-heavy: Service, AgentRegistration, Multisig, all Daily* aggregates and join entities use ID! composite string keys (hot write path) | 0 bind() sites; no declared eth_calls | none (no ipfs.cat, no file data sources) | Per-multisig GnosisSafe templates indexing ExecutionSuccess/ExecutionFromModuleSuccess — fan-out grows with multisig count. No block handlers, no chain-wide streams | GnosisSafe (dynamic per CreateMultisigWithAgents); manifests generated from subgraph.template.yaml + networks.json | none |
| **mech** | 1.0.0 / apiVersion 0.0.7 | indexerHints prune: 300 | 15/24 immutable. Notable mutable event-log-shaped: CreateMech, Request, CreateMultisigWithAgents (event-shaped but mutable); plus aggregates MechAgent, Sender, Global, RequestsPerAgentOnchain | 18 Bytes vs 6 ID/String; hot Request entity uses id: ID! (uint256), MechAgent/Service/RequestsPerAgentOnchain also ID | 0 bind() sites; no declared eth_calls | SYNC ipfs.cat in src/agent-mech.ts:44,49 (request metadata, blocks handler); no file data sources | None chain-wide; AgentFactory v1-v4 + AgentRegistry + ServiceRegistryL2 static sources, per-mech AgentMech template. No block handlers | AgentMech (dynamic per CreateMech) | none |
| **autonolas** | 0.0.5 / apiVersion 0.0.7 (legacy graph-cli 0.64.0 line) | absent (no indexerHints) | 0/4 — legacy bare @entity, no immutable flags at all (Unit, Builder, Global, Service all mutable by default) | 2 Bytes vs 2 String (Builder, Global use String ids) | 12 bind() sites, all in src/registry.ts (registry tokenURI/state reads); no declared eth_calls | SYNC ipfs.cat, heavy: src/registry.ts:100-106 probes up to 4 IPFS paths per unit (protocol/connection/contract/skill.yaml) + :122 metadata fetch — worst sync-IPFS pattern in repo | ComponentRegistry, AgentRegistry, ServiceRegistry (mainnet, registry-scoped, moderate volume). No block handlers | none | none |
| **autonolas-base** | 0.0.5 / apiVersion 0.0.7 (legacy graph-cli 0.64.0 line) | absent (no indexerHints) | 1/4 immutable (only Multisig); Unit, Service, DailyActivity mutable | 3 Bytes vs 1 String (DailyActivity day-bucket id String) | 8 bind() sites in src/registryL2.ts; no declared eth_calls | SYNC ipfs.cat: src/registryL2.ts:43-49 same 4-path yaml probe pattern as autonolas + :65 metadata fetch | ServiceRegistryL2 (Base) only; per-multisig GnosisSafe template. No block handlers | GnosisSafe (dynamic per CreateMultisigWithAgents) | none |
| **staking** | 1.0.0 / apiVersion 0.0.7 | indexerHints prune: auto | 16/19 immutable — best ratio in repo; mutable only Service, Global, CumulativeDailyStakingGlobal (aggregates, appropriate) | 16 Bytes vs 3 ID/String (Global/daily aggregates String) | 2 bind() sites (src/staking-factory.ts:44, src/utils.ts:25); no declared eth_calls | none | StakingFactory (Mode) + per-instance StakingProxy templates; volume bounded by staking contract count. No block handlers | StakingProxy (dynamic per InstanceCreated) | none |
| **tokenomics** | 0.0.5 / apiVersion 0.0.7 | absent (no indexerHints) | 1/3 immutable (Transfer); Token, TokenHolder mutable (aggregates) | 3 Bytes vs 0 String — fully Bytes-typed | 0 bind() sites; no declared eth_calls | none | Single OLAS ERC-20 full Transfer stream on Mode (token-scoped, every OLAS transfer). No block handlers | none | none |

**Survey notes:** Survey of all packages under `subgraphs/`. Declared eth_calls ('calls:' under eventHandlers) are used NOWHERE in the repo despite marketplace being on specVersion 1.2.0 (which supports them) — every eth_call is a plain synchronous .bind() call site. Grafts exist only on marketplace (gnosis manifest) and predict-polymarket. Pruning gaps: autonolas, autonolas-base, babydegen-mode, service-registry, tokenomics have no indexerHints at all. service-registry is the biggest optimization outlier: specVersion 0.0.5/apiVersion 0.0.6 and 0/16 entities immutable (all daily-join/dedupe entities explicitly mutable). Marketplace is the only package using file/ipfs data sources (ParsedRequestFile/ParsedDeliveryFile, apiVersion 0.0.9) but retains residual sync ipfs.cat in legacy paths (src/agent-mech.ts, src/marketplace/utils.ts:673-677 metadata). Highest-volume streams: predict-polymarket's global pUSD ERC20 Transfer stream on Polygon, pearl-transactions' 4 full ERC20 Transfer streams on Gnosis, and babydegen-mode's 14 token Transfer streams plus a polling block handler (every: 1800) on Mode.


---

# Part 3 — graph-node v0.40.1 capability reference (researched)

### 1. Indexed-argument (topic) filtering on eventHandlers: specVersion / graph-node version; static values only? Supported in 0.40.1?

Requires manifest specVersion >= 1.2.0. In graph-node source, SPEC_VERSION_1_2_0 is documented as 'Enables eth call declarations and indexed arguments(topics) filtering in manifest'; the constant first appears in tag v0.35.1 (it is absent in v0.35.0), so the minimum graph-node is v0.35.1. graph-node v0.40.1 fully supports it (its LATEST_VERSION is specVersion 1.3.0, and 1.2.0 features are enabled). Filter values ARE static manifest constants only: 'topic1'/'topic2'/'topic3' arrays of literal values in the eventHandler block (OR within a topic, AND across topics, max 3 topics per EVM). There is no way to add/remove filter values at runtime from handlers — that is an open feature request (graph-node issue #5579, 'Allow getting and setting of indexed arguments / topic filters within handlers'). So for a dynamically-growing set of tracked Safe addresses it is unusable; you must redeploy with a new manifest to change the set, or keep using dynamic data-source templates / full-stream filtering (like the current pUSD Transfer approach).

*Confidence: high. Sources: https://thegraph.com/docs/en/subgraphs/developing/creating/advanced/ ; https://github.com/graphprotocol/graph-node/blob/v0.40.1/graph/src/data/subgraph/api_version.rs (SPEC_VERSION_1_2_0 comment; LATEST_VERSION=1.3.0) ; https://raw.githubusercontent.com/graphprotocol/graph-node/v0.35.1/graph/src/data/subgraph/api_version.rs vs v0.35.0 (constant added in 0.35.1) ; https://github.com/graphprotocol/graph-node/issues/5579*

### 2. Declared eth_calls ('calls:' on event handlers): minimum specVersion / graph-node; supported in 0.40.1?

Minimum specVersion 1.2.0, same gate as topic filters (source comment: 'Enables eth call declarations and indexed arguments(topics) filtering in manifest'); minimum graph-node v0.35.1. Fully supported in v0.40.1 — the runtime even has an operator kill switch, GRAPH_DISABLE_DECLARED_CALLS ('Disables performing eth calls before running triggers; instead eth calls happen when mappings call ethereum.call'), present in v0.40.1's env code, confirming the parallel pre-execution path is active by default. Declarations can reference event.address and event.params; hard-coded constant values in declarations were enabled in v0.36.0 (PR #5498). Note: struct-field access via dot notation in call declarations (e.g. event.params.x.y) was only added in v0.41.0 (PR #6099) — NOT available in 0.40.1. Calls declared this way are executed in parallel before the handler runs and results are served from the call cache when the mapping performs the same call.

*Confidence: high. Sources: https://github.com/graphprotocol/graph-node/blob/v0.40.1/graph/src/data/subgraph/api_version.rs ; https://github.com/graphprotocol/graph-node/blob/v0.40.1/graph/src/env/mappings.rs (GRAPH_DISABLE_DECLARED_CALLS) ; https://github.com/graphprotocol/graph-node/blob/master/NEWS.md (v0.36.0 #5498, v0.41.0 #6099) ; https://thegraph.com/docs/en/subgraphs/developing/creating/advanced/ ; https://thegraph.com/docs/en/subgraphs/best-practices/avoid-eth-calls/*

### 3. Timeseries & @aggregation entities: minimum specVersion / graph-node; production-ready in 0.40.1? Limitations?

Minimum specVersion 1.1.0 (source comment: 'Enables @aggregation entities / Enables id: Int8'); shipped in graph-node v0.35.0 ('Aggregations - Declarative aggregations defined in the subgraph schema', PRs #5082/#5184/#5209/#5242/#5208). Supported and reasonably stable in 0.40.1 — early bugs were fixed by v0.36.0 (count-aggregation bug #5639; 'Do not repeat a rollup after restart in some corner cases' #5675). Limitations in 0.40.1 per its own docs/aggregations.md: (a) only 'hour' and 'day' intervals; (b) buckets are rolled up only when the interval ends — and critically, the query argument current: include for reading the partially-filled current bucket is marked 'still TODO and not implemented' in the v0.40.1 doc (it only works in later releases; master docs show it with remaining limits on nested aggregation fields), so latest-hour/day data is invisible until the bucket closes; (c) timeseries types are immutable, id must be Int8 (auto-set), timestamp auto-set from block time (silently overridden if mappings set it); (d) aggregation entities are query-only — mappings cannot read or write them; (e) aggregating over other aggregations is not supported; (f) extended value types for aggregations only landed in v0.42.0. For your daily-metrics-with-join-entities pattern the interval-close latency and the 0.40.1 current-bucket gap are the main operational caveats.

*Confidence: high. Sources: https://github.com/graphprotocol/graph-node/blob/v0.40.1/graph/src/data/subgraph/api_version.rs ; https://github.com/graphprotocol/graph-node/blob/v0.40.1/docs/aggregations.md ('current ... still TODO and not implemented') ; https://github.com/graphprotocol/graph-node/blob/master/NEWS.md (v0.35.0 aggregations; v0.36.0 fixes #5639/#5675; v0.42.0) ; https://thegraph.com/docs/en/subgraphs/developing/creating/advanced/*

### 4. File data sources (kind file/ipfs): minimum specVersion/apiVersion; retry env vars and timeout interaction; do fetches block main indexing in 0.40.1?

Minimum specVersion 0.0.7 (source comment: 'Enables offchain data sources'), with apiVersion 0.0.7 mappings (graph-ts >= 0.29.0, graph-cli >= 0.33.1 per official docs); GA'd in graph-node v0.30.0. FDS can only be spawned from templates, are one-shot, live in a separate causality region (their entities are immutable and isolated), and do not contribute to PoI. Fetching does NOT block the main indexing pipeline in 0.40.1: the OffchainMonitor runs fetches as background tasks and the subgraph runner just polls ready_offchain_events() between blocks — chain-head progress continues while files are unresolved (this repo's marketplace fix 44bc774 relies on exactly this). Retry/timeout knobs in 0.40.1 (exact names, verified in v0.40.1 env source): GRAPH_IPFS_MAX_ATTEMPTS — max retrieval attempts per file, default 100_000, a safety cap 'in case of a file not found or logical issue'; GRAPH_IPFS_REQUEST_TIMEOUT — per-request timeout, default 60s in release builds (added v0.39.0); GRAPH_IPFS_TIMEOUT — legacy overall IPFS timeout, 60s, covers manifest files and mappings ipfs.cat; GRAPH_FDS_MAX_BACKOFF — cap on the exponential retry backoff for offchain data sources, default 600s (added v0.40.0); GRAPH_IPFS_REQUEST_LIMIT — 100 req/s to IPFS for FDS; GRAPH_MAX_IPFS_FILE_BYTES — 25 MiB cap; GRAPH_IPFS_CACHE_LOCATION (v0.40.0) — disk/Redis cache so restarts don't re-fetch. Interaction: each attempt is bounded by the request timeout, failed attempts retry with backoff (capped by GRAPH_FDS_MAX_BACKOFF) until GRAPH_IPFS_MAX_ATTEMPTS is exhausted, all rate-limited by GRAPH_IPFS_REQUEST_LIMIT. Caveat: a missing file effectively retries ~forever at default settings (100k attempts x up to 600s backoff).

*Confidence: high. Sources: https://github.com/graphprotocol/graph-node/blob/v0.40.1/graph/src/data/subgraph/api_version.rs ; https://github.com/graphprotocol/graph-node/blob/master/docs/implementation/offchain.md ; https://github.com/graphprotocol/graph-node/blob/v0.40.1/graph/src/env/mappings.rs and env/mod.rs ; https://github.com/graphprotocol/graph-node/blob/v0.40.1/docs/environment-variables.md ; https://github.com/graphprotocol/graph-node/blob/master/NEWS.md (v0.30.0, v0.39.0 #5998, v0.40.0 #6043/#6031) ; https://thegraph.com/docs/en/subgraphs/developing/creating/advanced/*

### 5. dataSource endBlock: minimum specVersion; can dynamic templates be retired/stopped?

endBlock requires specVersion >= 0.0.9 (source comment: 'Enables endBlock feature'), shipped in graph-node v0.34.0 ('By setting an endBlock, subgraph authors can define the exact block at which a data source will cease processing'). It applies only to static dataSources in the manifest — templates have no source.endBlock field and none is accepted. There is NO mechanism in any graph-node version to stop, retire, or delete a dynamic data source once instantiated: no endBlock on templates, no host function to terminate a data source from a handler, no graphman command. This is a long-standing open request (issue #1921 'Allow deletion of data source templates'; issue #3504 explicitly asked to 'stop indexing of certain contracts created with data source templates' and only the static-dataSource endBlock part was implemented). Dynamic sources persist for the life of the deployment; the only 'retirement' is redeploying (optionally grafting) so the templates are never spawned. Related operational notes: v0.36.0 fixed subgraphs continuing to poll past the max endBlock (#5583), and v0.44.0 fixed endBlock being ignored in block-skip/multi-datasource cases (#5535-related). A sound convention: don't default to endBlock on deprecated dataSources for v1->v2 migrations without confirmation.

*Confidence: high. Sources: https://github.com/graphprotocol/graph-node/blob/v0.40.1/graph/src/data/subgraph/api_version.rs ; https://github.com/graphprotocol/graph-node/blob/master/NEWS.md (v0.34.0 #4787; v0.36.0 #5583) ; https://github.com/graphprotocol/graph-node/issues/1921 ; https://github.com/graphprotocol/graph-node/issues/3504 ; https://github.com/graphprotocol/graph-node/issues/5535 ; https://thegraph.com/docs/en/subgraphs/developing/creating/subgraph-manifest/*

### 6. Store write batching env vars in 0.40.x: names, defaults, meaning of 0; interaction with graphman/restarts

Exact vars (verified in v0.40.1 docs/environment-variables.md): GRAPH_STORE_WRITE_BATCH_DURATION — 'how long to accumulate changes during syncing into a batch before a write has to happen in seconds. The default is 300s. Setting this to 0 disables write batching.' GRAPH_STORE_WRITE_BATCH_SIZE — 'how many changes to accumulate during syncing in kilobytes... The default is 10_000 which corresponds to 10MB. Setting this to 0 disables write batching.' Either hitting its limit flushes the batch; setting either to 0 disables batching entirely. Batching applies only while a subgraph is catching up — since v0.35.0 batching is 'conditional on caught-up status' (#5252), so near chain head writes go through per-block. Do not confuse these with GRAPH_STORE_BATCH_TARGET_DURATION (180s) / GRAPH_STORE_BATCH_TIMEOUT / GRAPH_STORE_BATCH_WORKERS, which govern copy/graft/prune batches, not indexing writes. Restart/graphman interaction: batches are in-memory; the durable subgraph head (subgraphs.head, deployment_head metric) only advances on flush, so during backfill queries, monitoring, and graphman state can lag up to ~5 min / 10MB behind actual processing, and a crash/restart (or graphman restart/rewind) simply resumes from the last flushed block and deterministically re-processes the batched-but-unflushed blocks — no data loss, just repeated work. If you need graphman rewind/prune points or monitoring to track tightly during a large backfill, temporarily lower or disable batching. v0.40.0 also sped up appending changes to batches (#6025).

*Confidence: medium. Sources: https://github.com/graphprotocol/graph-node/blob/v0.40.1/docs/environment-variables.md ; https://github.com/graphprotocol/graph-node/blob/master/docs/environment-variables.md ; https://github.com/graphprotocol/graph-node/blob/master/NEWS.md (v0.35.0 #5252/#5266/#5276; v0.40.0 #6025). Restart/graphman lag behavior is inferred from batching design + deterministic re-processing; not spelled out verbatim in docs.*

### 7. GRAPH_ETHEREUM_CLEANUP_BLOCKS: what it does; is daily 'graphman chain truncate' on top redundant or harmful?

Exact doc text (unchanged through master and v0.40.1): 'GRAPH_ETHEREUM_CLEANUP_BLOCKS: Set to true to clean up unneeded blocks from the cache in the database. When this is false or unset (the default), blocks will never be removed from the block cache. This setting should only be used during development to reduce the size of the database.' I.e. it enables periodic removal of block-cache rows graph-node considers no longer needed; it is explicitly positioned as a dev convenience, not a production hygiene mechanism. 'graphman chain truncate <chain>' wipes the entire block cache for that chain. Running it daily on top of CLEANUP_BLOCKS is both redundant (the cache is already being trimmed) and actively harmful on any node serving multiple chains: every truncate forces re-fetching from RPC of (a) blocks around the head needed for reorg handling/ancestry lookups, (b) any historical blocks needed by rewinds, grafts, or newly deployed/backfilling subgraphs, and it also discards the warm cache that ETHEREUM_BLOCK_BATCH_SIZE-parallel fetches had populated — turning cheap DB reads back into RPC load. Note the eth_call cache is separate (graphman chain call-cache remove) and is NOT touched by CLEANUP_BLOCKS. Recommendation: keep CLEANUP_BLOCKS unset in production unless disk pressure is real; use graphman chain truncate only as a one-off remediation (e.g. corrupted/poisoned cache, provider switch), never on a schedule.

*Confidence: high. Sources: https://github.com/graphprotocol/graph-node/blob/master/docs/environment-variables.md ; https://github.com/graphprotocol/graph-node/blob/v0.40.1/docs/environment-variables.md. Harm assessment (forced re-fetch) is operational reasoning from documented cache purpose; medium-confidence on that judgment specifically.*

### 8. Multi-chain sharding: can one graph-node process index many chains with per-chain isolation? How is compute isolation achieved?

Yes, a single graph-node process can index many chains — [chains.<name>] entries in config.toml are unlimited and each chain gets its own providers, shard, and (0.40.1) polling interval. But there is NO per-chain compute isolation inside one process: shards are Postgres databases ('The [store] section must always have a primary shard configured, which must be called primary'), so they isolate storage/IO and block caches per chain, not CPU/handler execution. Compute isolation is achieved only via multiple graph-node instances (index nodes) plus [deployment] rules that pin subgraphs to node IDs (match on network; the last rule must have no match). Block ingestion for all chains runs on the single node whose --node-id equals the [chains] ingestor value. General pattern: pin the heaviest chains to a dedicated index node and let a default rule catch the rest; optionally add a separate query node; and, only at multi-TB scale, give the heavy chains' deployments + block cache a dedicated Postgres shard. Note: per-chain RPC tuning (json_rpc_timeout, max_block_range_size, etc.) in TOML only landed in v0.44.0; on 0.40.1 those remain global env vars, one more reason to split heavy/light across processes. Validate with graphman config pools/check.

*Confidence: high. Sources: https://github.com/graphprotocol/graph-node/blob/master/docs/config.md ; https://github.com/graphprotocol/graph-node/blob/master/docs/sharding.md ; https://github.com/graphprotocol/graph-node/blob/master/NEWS.md (v0.44.0 #6459 per-chain RPC settings) ; https://thegraph.com/docs/en/indexing/tooling/graph-node/*

### 9. Prometheus metrics on :8040 for per-subgraph time breakdown: which metric names; what to graph first?

From graph-node's docs/metrics.md (port 8040 by default), the per-deployment breakdown is: OVERALL — deployment_block_processing_duration (duration of block processing per deployment) and deployment_sync_secs (total time spent syncing; gained extra labels in 0.34 for section-level attribution). HANDLER/WASM TIME — deployment_handler_execution_time (execution time per handler) plus deployment_host_fn_execution_time (time in host functions, which is where ipfs/store/eth-call host calls show up). RPC — deployment_eth_rpc_request_duration and deployment_eth_rpc_errors (per-deployment), with node-wide eth_rpc_request_duration / eth_rpc_errors labeled by method for provider health; eth-call metrics are labeled by specific method since #5017 (note eth_call_execution_time is disabled by default since v0.35.0). STORE WRITES — deployment_transact_block_operations_duration ('duration of committing all the entity operations in a block and updating the subgraph pointer'). TRIGGER MATCHING — deployment_trigger_processing_duration and deployment_block_trigger_count. PROGRESS/HEALTH — deployment_head (head block per deployment, labeled deployment/network/shard) vs ethereum_chain_head_number (per network); deployment_status only exists from v0.37.0 and deployment_synced from v0.38.0, so on 0.40.1 you have both; deployment_failed was removed in 0.37. Graph first, in order: (1) ethereum_chain_head_number - deployment_head per subgraph (lag), and rate(deployment_head) for blocks/s; (2) deployment_block_processing_duration stacked against its three components — deployment_handler_execution_time, deployment_eth_rpc_request_duration, deployment_transact_block_operations_duration — which immediately tells you whether a slow subgraph is WASM-bound, RPC-bound, or Postgres-bound; (3) deployment_eth_rpc_errors + eth_rpc_request_duration by method for provider issues; (4) store_connection_wait_time_ms / store_connection_checkout_count if store-write time dominates (pool starvation vs slow writes).

*Confidence: high. Sources: https://github.com/graphprotocol/graph-node/blob/master/docs/metrics.md ; https://github.com/graphprotocol/graph-node/blob/master/NEWS.md (v0.37.0 deployment_status #5720, v0.38.0 deployment_synced #5816, v0.34.0 #4965/#5017, v0.35.0 #5164)*

### 10. prune (indexerHints): interaction with grafting; prune auto vs numeric on 0.40.1

indexerHints.prune requires specVersion >= 1.0.0, shipped in graph-node v0.34.0. Grafting interaction — yes, the graft base must NOT be pruned past the graft block: pruning advances the deployment's earliest_block, and 'It is not possible to graft at a block height that has been pruned'; a graft whose block is before the base's earliest_block fails at deploy (fixes: raise history_blocks before pruning, use an unpruned base, or re-index the base). Official guidance: 'If grafting is routinely performed and pruning is desired, use indexerHints: prune: <number of blocks> ... rather than auto', because prune: auto keeps only the minimum history and will almost always eat your future graft points. Semantics: prune: auto = retain the minimum necessary history (indexer minimum; on graph-node the floor is GRAPH_MIN_HISTORY_BLOCKS, default 2x the reorg threshold), prune: <N> = retain N blocks of history (time-travel queries only work within retained history), prune: never = full history. Indexers can override with GRAPH_HISTORY_BLOCKS_OVERRIDE. On 0.40.1 specifically: pruning is mature — graphman prune status/run/set commands exist (v0.39.0, #5949), a prune-status reporting bug was fixed in v0.40.0 (#6062), batch runaway is guarded by GRAPH_STORE_BATCH_TIMEOUT, and rebuild-vs-delete strategy is tuned via GRAPH_STORE_HISTORY_REBUILD_THRESHOLD / DELETE_THRESHOLD. Also relevant to grafting on 0.40.1: grafts within the reorg threshold of chain head are disallowed (v0.35.0, #5135), so any subgraph that is grafted routinely must keep its graft base on prune: never (or a numeric window wide enough to cover every graft block).

*Confidence: high. Sources: https://thegraph.com/docs/en/cookbook/pruning/ (Subgraph Best Practice 1) ; https://thegraph.com/docs/en/subgraphs/guides/grafting/ ; https://github.com/graphprotocol/graph-node/blob/master/NEWS.md (v0.34.0 #5032/#5117; v0.35.0 #5135/#5186; v0.39.0 #5949/#6002; v0.40.0 #6062) ; https://github.com/graphprotocol/graph-node/blob/master/docs/environment-variables.md (GRAPH_MIN_HISTORY_BLOCKS, GRAPH_HISTORY_BLOCKS_OVERRIDE) ; https://mintlify.wiki/graphprotocol/graph-node/operations/pruning*


---

# Part 4 — Infra recommendations (general, tooling-level)

General graph-node levers below — not a description of any specific deployment's configuration. Pair them with the per-deployment metrics in Part 3 §9 to measure before/after.

1. **Write batching:** the exact knobs are `GRAPH_STORE_WRITE_BATCH_DURATION` (default **300s**; `0` disables) and `GRAPH_STORE_WRITE_BATCH_SIZE` (default **10_000 KB = 10MB**; `0` disables). Either limit flushes the batch. Note batching applies **only while a subgraph is catching up** (since v0.35.0); near chain head, writes go through directly — so enabling it accelerates backfills/re-indexes specifically, which is where the pain is worst.
2. **CPU/sharding:** one graph-node process can index many chains, but there is **no per-chain CPU isolation within a process** — shards isolate Postgres storage/IO only. Compute isolation requires multiple index-node instances plus `[deployment.rule]` pinning (match on network). General pattern: pin the heaviest chains to a dedicated index node and let a default rule catch the rest — a real `config.toml` rather than env-only setup (see Part 3 §8).
3. **Postgres / pruning:** pruning is the main lever to shrink the store's hot set — Part 1 flags five packages that retain full history unnecessarily. Keep `prune: never` (or a wide numeric window) on any subgraph you graft onto (Part 3 §10).
4. **RPC gateway:** measurable from metrics before touching infra: `deployment_eth_rpc_request_duration` / `deployment_eth_rpc_errors` per deployment, vs node-wide `eth_rpc_request_duration` by method. If the shared gateway is a bottleneck it shows up as high p95 there while chains are behind.
5. **Block-cache hygiene:** `GRAPH_ETHEREUM_CLEANUP_BLOCKS` is documented as a **development-only** convenience ("should only be used during development to reduce the size of the database"), and `graphman chain truncate` is a one-off remediation — neither belongs on a schedule. Scheduled block-cache truncation forces needless RPC re-fetches of every block a subgraph re-touches, a self-inflicted RPC load multiplier (Part 3 §7).
6. **IPFS retry attempts:** with the marketplace on file data sources, retries happen **off the critical path** (background OffchainMonitor; chain head progresses while files are unresolved — confirmed for 0.40.1). The blocking cost survives only on paths still doing sync `ipfs.cat` (legacy AgentMech, mech, autonolas, autonolas-base — see Part 1); for those, each miss blocks for the per-fetch timeout, and the fix is code (FDS migration), not the retry knob. One real knob-side issue: the marketplace double-spawn means one guaranteed-dead FDS per request retrying in the background forever — tune max attempts down and/or narrow the spawn (Part 1, marketplace finding 5).
7. **Metrics to graph first** (`:8040`): `deployment_block_processing_duration`, `deployment_sync_secs` (section-labeled since 0.34), `deployment_handler_execution_time`, `deployment_host_fn_execution_time` (where ipfs/store/eth-call host calls appear), `deployment_eth_rpc_request_duration`/`_errors`, plus `pg_stat_statements` on the write path. This directly answers "RPC vs reads vs writes vs IPFS" per deployment.
8. **Indexed-argument (topic) filtering:** yes in graph-node 0.40.1, requires manifest **specVersion ≥ 1.2.0** (supported since v0.35.1). But filter values are **static manifest constants only** — no runtime additions from handlers (open feature request). So: usable for omen's 2-address creator whitelist on `LogNewQuestion`; **not usable** for pearl's or polymarket's dynamically-discovered safe sets (polymarket's would also silently lose unrecoverable DW top-up events for safes registered between redeploys — not recommended).
9. **Studio subgraphs slow — capacity or code?** Same code issues apply (babydegen's per-event `ownerOf` + 14 token streams; pearl's canonical multi-network variant has the same firehose design). The findings here transfer: fix in the canonical repo, redeploy to Studio; only after that is Studio-side capacity worth investigating.

Additional facts worth having: declared eth_calls (specVersion ≥1.2.0, since v0.35.1, active by default in 0.40.1 — `GRAPH_DISABLE_DECLARED_CALLS` exists as a kill switch); call declarations accept `event.address`/`event.params` and constant addresses (since v0.36.0) but **not** arbitrary derived values. Timeseries `@aggregation` (specVersion ≥1.1.0): hour/day intervals only, buckets materialize when the interval closes, and `current: include` for the open bucket is **not implemented** in 0.40.1 — running totals must remain handler-maintained or client-summed. `prune` + grafting: pruning advances `earliest_block` and **a graft below it fails at deploy** — official guidance is `prune: <number>` rather than `auto` where grafting is routine (relevant: marketplace grafts within its `prune: 300` window today; that is tight by design).

# Part 5 — Sequencing

1. **Measure first (week 0, infra):** stand up per-deployment metrics dashboards (Part 3 §9), review block-cache-truncation and write-batching settings, and raise log verbosity where useful. These are reversible config changes that also make every later before/after test meaningful.
2. **Quick wins (week 1, code):** the Q-tier items — all graft-safe or manifest-only. Deploy, re-measure blocks/s on Gnosis + Polygon.
3. **Re-index bundles (weeks 2-4, code):** one subgraph at a time, slowest first: pearl-transactions (biggest indexing volume in the repo), then predict-omen, then marketplace (bundle the legacy-FDS port with its next scheduled re-index), then mech/service-registry. Each bundle collects every breaking change (immutability, Bytes IDs, schema splits) into one re-index. predict subgraphs re-index from genesis per the re-index-over-graft strategy.
4. **Topology (parallel):** consider isolating the heaviest chains onto a dedicated index node via `config.toml` deployment rules (Part 3 §8), and a dedicated indexing RPC path for those archives.
5. **Re-platform (committed decision):** predict-polymarket → Envio proceeds as planned — findings quantify why staying is futile (two >99.9%-discard firehoses, no graph-node mechanism applies). predict-omen is the confirmed second candidate (unretirable ~15k-template watch-list); decide after seeing post-Q-tier Gnosis numbers.
6. **Legacy registries (when scheduled):** autonolas-base first (its blocker is deterministic-crash vectors — unguarded eth_calls / JSON casts — not throughput; those fixes are the prerequisite for any speed at all), then the FDS migration both registries can take at specVersion 0.0.7 without waiting for Tier 3 Wave 3.

# Part 6 — Code-quality follow-ups from the docs review

Carried over from the docs-vs-code review (workflow `wf_ebc1b3b1-438`) after all doc corrections/additions were applied and the trivial config/comment fixes landed (config/comment cleanups, pearl-transactions in build.yml, removal of broken `--studio` deploy scripts). These are the items that still need **code changes, tests, or a maintainer decision** — they are correctness/hygiene work, not indexing-speed work, but several share a re-index or refactor window with Part 1 findings.

## Needs a decision + code change + tests

1. **predict-polymarket: `processRedemption` has no DepositWallet fallback (bug candidate).** `handleOrderFilledV2` resolves DepositWallet makers to their `TraderAgent`, but `processRedemption` only does `TraderAgent.load(redeemer)` and early-returns — redemptions initiated by a DW are silently dropped, undercounting `totalPayout`. Decision: fix in mapping (+ tests, + re-index from genesis to backfill, per the predict-* re-index-over-graft strategy) or accept-and-document given the planned Envio re-platform (see Part 1 §1 and Part 5 step 5).
2. **service-registry: `yarn generate-manifests` clobbers `subgraph.mode-mainnet.yaml`.** Regeneration renders BOTH networks from `subgraph.template.yaml`, which hardcodes an IdentityRegistryBridger data source that does not exist on Mode — the documented workflow step produces a broken Mode manifest. Fix: exclude mode-mainnet from generation, or make the bridger block a conditional Mustache section keyed off `networks.json`. Bundle with the specVersion bump in Part 1 §6.1.
3. **service-registry: multisig-address reuse re-creates the GnosisSafe template.** The Olas redeploy flow (terminate → re-register → deploy, often reusing the same multisig) hits an unguarded `GnosisSafe.create()` → duplicate dynamic data source → double-counted transactions. Fix: guard template creation with a first-sighting marker entity. Caveat: changes metric semantics for affected services (confirm with data consumers) and needs a re-index to repair history — same re-index window as Part 1 §6 (R1 bundle).
4. **babydegen-mode: `src/veloCLPool.ts` exports `handleSwap` but no manifest wires it.** Dead code or missing feature — delete it together with the other 4 unwired mapping files (see the babydegen profile in Part 1 §5 and finding §5.8), or wire a CL-pool template if per-swap impact tracking is actually wanted.
5. **marketplace: four unwired handlers in `src/marketplace/service-registry-l-2.ts`.** `handleActivateRegistration`, `handleDeployService`, `handleDeposit`, `handleOwnerUpdated` have no eventHandlers in any manifest. Delete or wire — see finding §3.8 (and its verifier note: the writer-less entity types `MarketplaceParamsUpdated`/`OwnerUpdated` go in the same sweep; confirm the unwiring is intentional first).

## Optional — docs already state reality; do only if the code should be the better version

6. **mech:** rename `tests/agent-mech-utilts.ts` → `agent-mech-utils.ts` (+ import in `agent-mech.test.ts`); the doc currently documents the typo'd name.
7. **marketplace:** add `totalPredictRequests` to `scripts/compare-global-metrics.js` `GLOBAL_FIELDS`; the doc currently notes it is not compared.
8. **staking:** add `blockNumber`/`blockTimestamp` to `StakingContract` if ordering by creation time is wanted (schema change → re-index; bundle with the staking items in the R1 batch, Part 1 §10). The doc example now orders by `id`.

# Appendix — Method & verification

- Full machine-readable findings: `scratchpad/opt-result.json` (session dir). Workflow `wf_0b3a58bc-2c3`: 24 agents, ~1.63M tokens, 347 tool calls.
- Every finding passed a second agent's adversarial check of (a) code evidence and (b) **fix feasibility against graph-node 0.40.1** — this killed 2 findings outright and downgraded several fixes (e.g. declared eth_calls rejected for polymarket's CTF calls because `CallArg` accepts only address literals/event params; AssemblyScript module-global "caches" rejected because each handler runs in a fresh WASM instance).
- The graph-node capability answers in Part 3 come from a dedicated research agent citing graph-node source (`docs/environment-variables.md`, `docs/aggregations.md`, `docs/metrics.md`, release tags) — version-pinned to v0.40.1 where it matters.
- Event-volume figures marked "measured" (e.g. pearl's 4,420 transfers/hour) were sampled live from the chain during the audit; treat others as order-of-magnitude reasoning from contract scope.
