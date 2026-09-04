# Migration from the graph-node subgraph

One-time notes for the cutover from `subgraphs/pearl-transactions` (in the
**`autonolas-subgraph-studio`** repo) to this squid. Irrelevant once the
Polygon graph-node deployment is retired.

> **Which subgraph copy is the source.** There are two. The one this squid
> is ported from lives in `autonolas-subgraph-studio/subgraphs/pearl-transactions`:
> four manifests generated from `networks.json`, schema v2 (separate
> `BondMovement` ledger, `AGENT_OLAS_TO_MASTER` pre-split). This repo also
> has a `subgraphs/pearl-transactions`, but it is an older Gnosis-only fork
> on schema v1 with no `BondMovement` — do not port from or compare
> against it.

## Why Polygon moved

`INDEXING-PERFORMANCE.md` in the studio repo diagnosed it: chain-wide
ERC-20 `Transfer` data sources dominate, and `handleErc20Transfer` did up
to 6 store lookups before concluding "not ours" for ~99.99% of transfers.
Polygon ran at ~5 blocks/sec through the USDC.e-dense range and sat ~15
days behind head. Gnosis, Base and Optimism were fine and stay on
graph-node.

This squid's mapping runs at ~2,000 blocks/sec. The fix was not SQD by
itself — it was collapsing that per-transfer store lookup into an
in-memory index (`EntityCache.trackedIndex`), which the tracked-address
set is small enough to allow.

## Validating squid data

`scripts/compare-vs-subgraph.py <subgraph-graphql-url>` diffs this squid's
Postgres against a deployed subgraph. The two stores use different ID
schemes — the subgraph concatenates `Bytes`, the squid joins strings — so
**nothing is compared by row id**; every section matches on semantic keys
(`txHash` + category + token + amount, and so on), height-capped to the
lower of the two heads.

### There is no deployed Polygon endpoint to compare against

Checked at time of writing:

| Endpoint | State |
|---|---|
| `transactions-gnosis.subgraph.autonolas.tech` | live, at head |
| `transactions-base.subgraph.autonolas.tech` | live, at head |
| `transactions-optimism.subgraph.autonolas.tech` | live, at head |
| `transactions-polygon.subgraph.autonolas.tech` | **does not exist** |
| Studio `pearl-polygon-transactions` v0.0.5 | **404 Not found** |
| Gateway `FAhPh2M5JXjGysCHG1RzABKXr9efmh92w9bARk5DJ5iV` | needs a Graph API key |

So the baseline the migration plan assumed is not available. Two ways
forward, in order of preference:

1. **Validate against Base instead.** Base runs the same v2 schema, is at
   chain head, and has real Pearl data. Set `CHAIN = CHAINS.base` in
   `src/constants.ts`, point `SQD_PORTAL_URL` at `base-mainnet`, index into
   a scratch database, and run the compare script against
   `https://transactions-base.subgraph.autonolas.tech`. This validates the
   handler logic end-to-end on real data — which is the thing that can
   actually be wrong. It does not validate Polygon-specific constants, so
   review those by eye against `networks.json`.
2. **Get a Graph gateway API key** and compare Polygon directly against the
   published subgraph. Note the deployment was last seen ~15 days behind
   head, so the comparison is capped at its height.

Both are worth doing. (1) is the stronger correctness signal; (2) is the
stronger Polygon-specific signal.

The endpoint path shape is the bare domain, with no `/graphql` and no
`/subgraphs/name/...` suffix.

## Deliberate differences from the subgraph

These are intended. When the compare script flags them, they are not bugs.

### Schema

- `Bytes` ids and fields are lowercase hex `String`s.
- `@entity(immutable: true|false)` is gone. Immutability was a graph-node
  storage optimization (skipping block-range versioning) with no TypeORM
  equivalent. The write patterns it implied are still honoured by the
  handlers, and the comments saying so are kept.
- `PendingBondCounter`, `PendingBondRow` and `AgentBondAttributionGuard`
  are dropped. All three were keyed by transaction hash and existed only
  because graph-node handlers cannot share state across one transaction's
  events. A SQD batch handler sees a whole block at once (and SQD never
  splits a block across batches), so the bond-attribution queue is a plain
  in-memory `Map` — see `BondQueue` in `src/logic.ts`. `ServiceIndex` and
  `PendingRegistration` are kept: those genuinely span transactions.
- `IndexerStatus` is added. OpenReader has no `_meta { block { number
  timestamp } }`; Subsquid offers only `squidStatus { height }`, a block
  number with no timestamp. Pearl's `computeIsDataDelayed` drives its
  stale-data indicator off a *timestamp*, so the processor writes this
  singleton once per batch and the frontend maps
  `indexerStatusById(id: "1")` into its existing `SubgraphMeta` shape —
  leaving `computeIsDataDelayed` untouched.

### Behaviour

- **Relations are FK-enforced.** The staking handlers used to fall back to
  assigning a raw `owner` / `multisig` address to `FundsMovement.masterSafe`
  / `.agentSafe` when the `Service` had no resolved link. graph-node
  tolerates that dangling reference (it simply resolves to null at query
  time); TypeORM rejects it. The relation is left null instead, and the
  raw addresses are still carried by `from` / `to`, so no information is
  lost — but a subgraph row with a dangling `masterSafe` and the squid row
  with a null one are the same fact expressed differently.
- **`getOwners` is read at the first-sighting block, not `latest`.** The
  subgraph's graph-node binding did this implicitly. Doing it explicitly
  makes an archive RPC a hard requirement; see README.
- **Address-less subscriptions skip malformed foreign logs.** The Safe and
  StakingProxy templates became topic-only subscriptions with no address
  filter, and topic0 does not encode indexed-ness, so unrelated contracts
  emit colliding topics with a different topic count. `decodeForeignSafe`
  drops exactly those. The subgraph never saw them because a template only
  ever attached to addresses it had spawned.
- **`ExecutionSuccess` and `ExecutionFromModuleSuccess` are not indexed at
  all.** Their subgraph handlers were documented no-ops (the events carry
  no amount or recipient, so native-out tracking needs trace handlers), but
  a graph-node template subscribes per contract and pays for them anyway.
  They are 97% of Safe log volume. Dropping them changes no output.

### Known gap carried over, not fixed

`SAFE_SETUP_TRANSFER` can still miss a deposit made **before** the indexer
first learns a Master Safe exists — the normal Pearl flow is create Safe →
fund it → register service, and discovery happens at registration. It is
tempting to think the unfiltered Safe subscription fixes this, since the
logs are no longer invisible. It does not: blocks are processed strictly
forward, so at the funding block the address is still unknown and the
transfer is still discarded. A real fix needs buffering-and-backfill or a
targeted lookback once a Safe is discovered. Deliberately out of scope for
the port, so that every compare-script difference is a bug rather than
possibly an improvement.

## Query dialect

The API speaks **OpenReader**, not the Graph query dialect. Every query
Pearl sends today needs rewriting:

| Graph | OpenReader |
|---|---|
| `first: $n, skip: $m` | `limit: $n, offset: $m` |
| `orderBy: blockTimestamp, orderDirection: desc` | `orderBy: blockTimestamp_DESC` |
| `where: { masterSafe: $x }` | `where: { masterSafe: { id_eq: $x } }` |
| `masterSafe(id: $x)` | `masterSafeById(id: $x)` |
| `_meta { block { number timestamp } }` | `indexerStatusById(id: "1") { blockNumber blockTimestamp }` |

Pearl already has a per-chain schema-revision mechanism —
`TRANSACTION_HISTORY_SUBGRAPH_SCHEMA_BY_EVM_CHAIN` and
`getTransactionHistorySchemaRevision` in `frontend/constants/urls.ts`,
where each revision owns a query document, a Zod schema and a normalizer to
shared domain types, and the hooks/components stay revision-agnostic. Add a
third `'sqd'` revision the same way. Do **not** put a Graph-compat proxy in
front of the squid.

Remember a complete ledger is `fundsMovements` **∪** `bondMovements`.

## Cutover checklist

1. Private portal URL + key in place; archive RPC in place.
2. Production backfill complete (processor at chain head).
3. Compare script green against Base (handler logic) and, if a gateway key
   is obtained, against the published Polygon subgraph.
4. Spot-check a real Pearl user's history end to end against the wallet UI.
5. Pearl PR: `'sqd'` schema revision + the Polygon URL in
   `TRANSACTION_HISTORY_SUBGRAPH_URLS_BY_EVM_CHAIN`.
6. Grace period, then retire the Polygon graph-node deployment.
