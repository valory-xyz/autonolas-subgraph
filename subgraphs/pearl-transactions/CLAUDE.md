# pearl-transactions (Gnosis — self-hosted port)

Funds-movement subgraph for Pearl **Master Safe / Agent Safe** accounts on
**Gnosis**. Powers the Pearl wallet transaction-history view (VLOP-73): every
fund movement in/out of the Master Safe, classified into wallet-history rows.

This is the **Gnosis-only, self-hosted-graph-node** port of the subgraph whose
canonical multi-network source lives in the **`autonolas-tokenomics-subgraph`**
repo (`subgraphs/pearl-transactions`). It was brought here to run on Olas's own
graph-node infra (`docker-compose.yaml`) as an alternative to The Graph
Studio/decentralized-network deployment (Studio Gnosis indexer kept hitting a
deterministic stall; the network deployment was uncurated/slow). Keep the
mapping logic in sync with the canonical source — fixes should land there first.

## Layout

- **`subgraph.yaml`** — single concrete Gnosis manifest (no template /
  `generate-manifests` here; this port is Gnosis-only). Addresses + start
  blocks are inlined from the canonical `networks.json` `gnosis` block.
- **`abis/`** — subgraph-local copies of the 6 ABIs the manifest references
  (`ServiceRegistryL2`, `ServiceRegistryTokenUtility`, `StakingFactory`,
  `StakingProxy`, `GnosisSafe`, `ERC20Detailed`) so the port is self-contained
  and doesn't depend on the shared root `abis/`.
- **`src/`** — handlers, copied verbatim from the canonical source:
  `service-registry.ts`, `service-registry-token-utility.ts`,
  `staking-factory.ts`, `staking-proxy.ts`, `erc20.ts`, `safe.ts`,
  `utils.ts`, `constants.ts`.
- **`tests/`** — Matchstick suites (`service-registry.test.ts`,
  `staking.test.ts`, `phase-2a.test.ts`).

## Data sources (Gnosis)

`ServiceRegistryL2` (`0x9338…755fD`), `ServiceRegistryTokenUtility`
(`0xa45E…18eD8`), `StakingFactory` (`0xb022…4700`) + `StakingProxy` template,
`OLAS` (`0xcE11…9d9f`), `WrappedNative` WXDAI (`0xe91D…a97d`), the two Gnosis
stablecoin Transfer sources (USDC `0xDDAf…7A83`, USDC.e `0x2a22…76F0`), and the
per-Safe `Safe` template (native receipts + owner-list upkeep).

## Key mechanisms

See the canonical `CLAUDE.md` in `autonolas-tokenomics-subgraph` for the full
writeup. The load-bearing pieces:
- **`classifyTransfer`** routes `(from, to)` into a `FundsCategory`. Registry
  dust → `OTHER` (hidden); Master Safe ↔ SRTU OLAS hops are dropped (deduped
  against the SEMANTIC bond row).
- **Bond attribution queue** — the SRTU handler is the producer (creates the
  `SERVICE_BOND_DEPOSIT`/`_REFUND` row + stamps `masterSafe`), the
  `ServiceRegistryL2` handler is the consumer (backfills `serviceId` +
  `bondType` + `agentSafe`). Hence `FundsMovement` is mutable.

## Known limitations & consumer gotchas

- **Native OUTBOUND is not indexed.** Only native *inbound* is captured, via
  the Safe template's `SafeReceived`. The `ExecutionSuccess` /
  `ExecutionFromModuleSuccess` handlers are registered in the manifest but
  `emitNativeOutPlaceholder` (`src/safe.ts`) is an intentional no-op — Safe
  executions carry `value=0` on the outer tx, so the moved amount needs
  call/trace handlers. Consequences: a native `MASTER_WITHDRAWAL` row never
  exists (native xDAI leaving a Master Safe to an untracked address is
  invisible); native Agent-Safe outflows (`AGENT_TO_APP`) are likewise
  invisible. Native Master → Agent hops DO appear, but only because the
  *receiving* Agent Safe's own `SafeReceived` fires. ERC-20 outbound is
  tracked normally via the token Transfer data sources (indexed token set
  only).
- **Reward rows are double-booked — filter by `source`.** Each on-chain OLAS
  reward transfer (staking proxy → Agent Safe) yields two `FundsMovement`
  rows: the `SEMANTIC` row (`STAKING_REWARD_CLAIM` from `RewardClaimed`, or
  `UNSTAKE_REWARD` from `ServiceUnstaked`/`ServiceForceUnstaked`) *and* a
  `RAW_TRANSFER` row (always categorised `STAKING_REWARD_CLAIM`) from the
  OLAS Transfer handler. Asymmetric with bonds, where the raw Master ↔ SRTU
  hop is suppressed. Sum amounts with a `source` filter (e.g.
  `source: SEMANTIC`) or every reward double-counts; note the unstake pair
  lands under *different* categories per source, so category-only grouping
  mixes them. `DailyServiceFunds` / `Service.totalOlasRewardsClaimed` are
  bumped only on the SEMANTIC path and are safe as-is.
- **`TokenBalance` is net observed flow, not a balance.** It diverges from
  `balanceOf` in three ways: (1) no opening baseline — per the Path A
  decision the FE fetches opening balances via archive RPC at
  `historyFloorBlock`; (2) native coin never touches it (`handleSafeReceived`
  has no balance hook, native-out is unindexed); (3) bond hops don't adjust
  it — Master Safe ↔ SRTU transfers classify `null` and `handleErc20Transfer`
  returns before the balance update, so a Master Safe's OLAS `TokenBalance`
  overstates by the locked bond amount until refund. (The `classifyTransfer`
  comment claiming the TokenBalance delta "is updated separately … and is
  unaffected" is stale — the early return skips it; fix it in the canonical
  repo.) `OTHER`-category rows also skip balance updates. Treat it as a
  display heuristic, not a reconciliation source.
- **Scope is ALL Olas services on Gnosis, not just Pearl.** There is no
  Pearl allowlist: any Safe that ever receives an Olas service NFT (or
  appears as `ServiceStaked.owner`) and answers `getOwners()` becomes a
  `MasterSafe`; `masterEoa = owners[0]` assumes Pearl's 1-of-2 onboarding
  and can be meaningless for other safes. `SERVICE_BOND_*` rows are written
  for *every* SRTU event chain-wide; non-tracked payers just leave
  `masterSafe = null`. Gotcha: staking-side rows (`STAKING_REWARD_CLAIM`,
  `UNSTAKE_REWARD`, `SERVICE_EVICTED`) fall back to
  `row.masterSafe = event.params.owner` when the Service has no resolved
  link — possibly a *dangling* reference (no `MasterSafe` entity exists), so
  `masterSafe { id }` sub-selects return null while the raw FK is populated.
- **Agent signer EOAs are not tracked.** Despite the `TrackedEOA` schema
  comment, `RegisterInstance.agentInstance` is never written to `TrackedEOA`
  — only `Service.operators` are, once, at `AgentSafe` creation
  (`getOrCreateAgentSafe`; its "picked up incrementally in
  handleRegisterInstance" comment is also stale — that handler upserts
  nothing). Operators added after the Agent Safe exists are untracked too.
  Effect: a Master Safe ERC-20 top-up to the agent's signer EOA classifies
  as `MASTER_WITHDRAWAL` (not `MASTER_TO_AGENT`, no `AgentFundingEvent`);
  a native top-up to it is entirely invisible (native-out, above).
- **Discovery-time anchoring.** A Master Safe enters the index at first
  sighting (service-NFT Transfer to it, or `ServiceStaked.owner`), not at
  Safe deployment: the `SAFE_DEPLOYED` row carries the *discovery* tx hash
  (NFT mint/stake), and all pre-discovery activity is permanently unindexed
  (token Transfers classify null with no `TrackedSafe` yet; the `Safe`
  template only spawns at discovery) — this is what `historyFloorBlock`
  exists for. `SAFE_SETUP_TRANSFER` only fires for a Master-EOA → Safe hop
  *after* discovery; in the usual fund-then-mint order the real setup hop
  precedes discovery and is missed, so either `setupTransferSeen` stays
  `false` forever with no `SAFE_SETUP_TRANSFER` row, or a later unrelated
  Master-EOA inbound gets mislabeled as the setup transfer (the setup label
  only applies to inbounds from a `MASTER_EOA`-tracked address; other EOA
  inbounds are `MASTER_FUNDING_IN`).

## Develop & deploy (self-hosted)

```bash
cd subgraphs/pearl-transactions
yarn install
yarn codegen
yarn build            # uses subgraph.yaml (Gnosis)
yarn test             # Matchstick

# against the local graph-node from the repo-root docker-compose.yaml
docker compose up -d  # (from repo root) — graph-node has the gnosis RPC wired
yarn create-local
yarn deploy-local     # uploads to the node's IPFS (registry.autonolas.tech)
```

`deploy-local` points `--ipfs` at `https://registry.autonolas.tech` to match the
`ipfs:` the graph-node uses in `docker-compose.yaml` (the node must fetch from
the same IPFS the CLI uploads to). Adjust if your node uses a different IPFS.

## Known risk — token-Transfer firehose

The `OLAS` / `WrappedNative` / `USDC` / `USDC.e` data sources index **every**
token `Transfer` on Gnosis from block `27871084` (filtered in-handler via
`classifyTransfer`). Starting at the registry block bounds it, but it's still a
full-token firehose and is the **most plausible driver of the Studio
"deterministic indexer stall"** — more so than the Gnosis RPC. Self-hosting +
a healthier archive RPC does **not** reduce this event volume, so the stall can
reproduce here. Any real fix (e.g. narrowing the indexed Transfer set) must land
in the canonical `autonolas-tokenomics-subgraph` first per the sync policy above.

## Maintenance trap — staking implementation allowlist

`StakingFactory.InstanceCreated` only spawns the `StakingProxy` template when
`event.params.implementation` is on the hardcoded per-network allowlist in
`src/constants.ts` (`isAllowedImplementation`; Gnosis currently a single
address, `0xEa00…7AB1`, copied from the canonical `autonolas-tokenomics-subgraph` staking subgraph).
Unknown implementations are skipped **silently** (they may have incompatible
event ABIs). When Olas ships a new staking implementation, this subgraph
loses, with no error: `StakingContract` entities, all
`STAKING_REWARD_CLAIM` / `UNSTAKE_REWARD` / `SERVICE_EVICTED` rows,
`Service.state` STAKED/UNSTAKED transitions — and the unrecognised proxy's
raw OLAS reward transfers misclassify as `APP_TO_AGENT`. Adding an address
requires a code change + full-history re-sync (already-emitted
`InstanceCreated` events are not replayed on a live deployment), and must
land in the canonical repo first. Also permanent: a proxy whose
`minStakingDeposit` / `numAgentInstances` eth_calls revert at creation is
skipped for good (warning log in `src/staking-factory.ts`). Keep the list in
lockstep with the canonical `autonolas-tokenomics-subgraph` staking subgraph
(this repo's `subgraphs/staking` has no allowlist — it templates
unconditionally and is Mode-only).
