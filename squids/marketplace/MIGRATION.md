# Consuming the squid instead of the marketplace subgraph

Notes for consumers (the marketplace dapp, KPIs, mech-analytics) that read
`subgraphs/marketplace` on other chains and will read this squid on
Robinhood. There is no existing Robinhood subgraph to compare against, so
this is a schema/dialect guide, not a cutover diff.

## Query dialect: OpenReader, not the Graph

| Graph dialect | OpenReader |
|---|---|
| `service(id: "175")` | `serviceById(id: "175")` |
| `services(first: 10, skip: 20)` | `services(limit: 10, offset: 20)` |
| `where: {id_in: [...]}` | `where: {id_in: [...]}` (same) |
| `where: {service_: {id: "175"}}` | `where: {service: {id_eq: "175"}}` |
| `where: {questionTitle_not: ""}` | `where: {field_not_eq: ""}` |
| `orderBy: blockTimestamp, orderDirection: desc` | `orderBy: blockTimestamp_DESC` |
| `_meta { block { number } }` | `squidStatus { height }` — or `indexerStatusById(id: "1") { blockNumber blockTimestamp }` for a timestamp |

Ids that were `Bytes` are lowercase hex **strings**; filter values must be
lowercase.

## Schema deltas

Field names on the surviving entities are identical to the subgraph's.
What changed:

- **Dropped — legacy AgentMech path**: `MechAgent`, `MarketplaceMech`,
  `CreateAgent`, `UpdateAgentHash`, `RequestToMech`, `DeliverForMech`,
  `RequestsPerAgentOnchain`, `AgentMultisigAssociation`,
  `Global.totalLegacyRequests / totalLegacyDeliveries /
  totalLegacyTransactions / totalLegacyAtaTransactions`.
  `Service.mechs` / `Service.marketplaceMechs` (which resolved to the legacy
  entities) are replaced by **`Service.mech`**, the marketplace `Mech`.
  The dapp's separate top-level `meches` query is unaffected.
- **Dropped — IPFS parsing**: `ParsedRequest`, `ParsedDelivery`,
  `Request.parsedRequest`, `Deliver.parsedDelivery`,
  `Global.totalPredictRequests`, `Sender.totalPredictRequests`.
  `RequestToMarketplace.ipfsHashBytes` and
  `DeliverForMarketplace.ipfsHashBytes` are still written (the raw 32-byte
  payload) — a consumer can build an IPFS link from them, exactly as the
  dapp's "Request Data" / "Delivery Data" columns do today.
- **Dropped — never-wired event rows**: `ActivateRegistration`,
  `DeployService`, `Deposit`, `OwnerUpdated`, `MarketplaceParamsUpdated`,
  `SetMechFactoryStatuses`, `PendingMechData`.
- **Renamed**: `Transfer.internal_id` → `Transfer.serviceId` (OpenReader
  rejects underscores in field names).
- **Typed**: `Service.agentIds` is `[Int!]!` (was `[BigInt!]!`).
- **Ids**: event-log rows and on-chain `Deliver` rows are
  `<txHash>-<logIndex>`; signed `Deliver` rows are `<txHash>-<requestId>`
  (the subgraph concatenated the bytes without a separator). `Request`,
  `RequestToMarketplace`, `DeliverForMarketplace` are keyed by the
  `requestId` hex exactly as before; `Mech` by serviceId; `CreateMech` by
  mech address; `CreateMultisigWithAgents` by multisig; `Global` by `""`.

## Semantics that are the same, and worth re-reading

Everything the subgraph's CLAUDE.md says about counters holds here, in
particular:

- `Service.totalRequests` is **demand-side** (requests made by the
  service's multisig). Requests **to** a service's mech are
  `requests(where: {service: {id_eq: ...}})`.
- Off-chain signed deliveries create a `Deliver` and bump
  `Mech.totalDeliveriesTransactions`, `Sender.totalLegacyRequests` and the
  `Global` item counters — but **not** `Service.totalDeliveries` and they
  create no `Request`. The dapp already derives the Supply/Demand roles
  from `Mech.totalDeliveriesTransactions` and the multisigs'
  `Sender.totalLegacyRequests` for exactly this reason
  (autonolas-frontend-mono #441); those fields are here unchanged.
- `Request.finalFeeUSD` is write-once and is the only thing
  `Sender.totalFeesPaidUSD` / `Global.totalFeesPaidUSD` accumulate;
  `feeUSD` is an upper-bound estimate.
- USD figures are approximate: the price is read at the event's block when
  the RPC can serve it and at indexing time otherwise (logged). On
  Robinhood the fee units are `NATIVE` (ETH, Chainlink) and `USDC` (USDG,
  1:1). `TOKEN` and `CREDITS` do not occur on this chain and would convert
  to $0.

## Validating a deployment

No subgraph to diff against, so validate against the chain:

1. `indexerStatusById(id: "1").blockNumber` is within a few blocks of
   `eth_blockNumber`.
2. `createMeches { totalCount }` equals the number of `CreateMech` logs on
   the marketplace proxy (`eth_getLogs`, topic
   `0x46e1ca45…ecacd6`); `globalById(id: "").totalMechs` matches.
3. For a sampled service: `serviceById(id).latestMultisig` equals the last
   `CreateMultisigWithAgents` for that id in the registry logs.
4. For a sampled delivery tx: one `Deliver` per delivered request id, the
   `DeliverForMarketplace.deliveryRate` equals the log's `deliveryRate`,
   and `Request.finalFeeUSD` ≈ rate × ETH/USD at that block.
5. Processor logs contain no `Unknown mech factory` and no
   `PendingMechData not found` lines (both mean the factory table or a
   start block is wrong).
