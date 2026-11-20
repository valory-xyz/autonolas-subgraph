# Babydegen (Basius) squid — Base

SQD port of autonolas-subgraph-studio `subgraphs/babydegen/babydegen-base`
(Studio `olas-babydegen-base`), which tracks the Basius agent (agentId 115) on
Base, as corrected by studio #174 + #175. It is being ported in three slices
(BDMARK-2311):

| Slice | Content | Status |
|---|---|---|
| 1 | Scaffold, service discovery, Safe/funding flows, token balances, token pricing | done (2a: brought up to #175) |
| 2 | Aerodrome / Aero CL and v2 positions, gauges, LiFi swaps | this package (2b) |
| 3 | 1800-block snapshot scheduler, ROI/APR, `AgentPortfolioSnapshot`, `DailyPopulationMetric`, parity script, k8s example | last |

Entities written today: `Service`, `ServiceRegistration`, `ServiceIndex`,
`ServiceRegistry`, `AddressType`, `FundingBalance`, `TokenBalance`, `Token`,
`PriceSource`, `PriceUpdate`, `AgentPortfolio`, and from slice 2
`ProtocolPosition`, `NFTPositionMapping`, `UncollectedPrincipal`,
`ClaimableRewardBeforeBlock`, `CreditedRewardClaim`, `PendingMintPosition`,
`SwapTransaction`, `AgentSwapBuffer`, `AeroGauge` and `V2PoolVenue`
(`SwapToEntryAssociation` is never written by the subgraph and is left out). `AgentPortfolio` differs
from the subgraph until slice 3 ports `calculatePortfolioMetrics`: its metrics
stay 0, `lastUpdated` stays at creation, and `firstTradingTimestamp` and
`firstFundingEthPrice` come from registration or the first funding, where the
subgraph can also fall back to the registration timestamp from that call. Consumers read only
`dailyPopulationMetrics`, so nothing switches before slice 3.

## Running locally

Node 24. From the repository root, build the shared package first:

```sh
cd squids/_shared && npm ci && npm run build
cd ../babydegen
cp .env.example .env
docker compose up -d          # Postgres on 23811
npm ci && npm run build && npm test
npm run migration:apply
npm run process
npm run serve                 # separate terminal, same .env (GQL_PORT=4350)
```

Regenerate with `npm run codegen` (models) and `npm run typegen` (decoders).
Typegen reads the shared `abis/` (ERC20Detailed, AggregatorV3Interface),
babydegen-mode's `VelodromeV2Pool.json` (the ABI the studio subgraph uses), and
this squid's `abis/`: fragments of the studio ABIs with just the events
handled and the functions called, copied verbatim (GnosisSafe,
ServiceRegistryL2, both NFPMs, the CL pool/factory/gauges, the Voter and v2
gauge, AeroV2Pool, the v2 factories, the GaugeManager, LiFiDiamond and
AerodromeLpSugar).

## Ingestion: restart on a new Safe

Every subgraph handler is gated on a tracked Safe (`Service.load(...)`), so
the squid does not stream all USDC/WETH Transfers or every Safe event on
Base. It subscribes to:

- ServiceRegistryL2 `RegisterInstance` / `CreateMultisigWithAgents`;
- `Transfer` on the 13 tracked tokens with `from` or `to` = a service safe;
- `SafeReceived` / `ExecutionSuccess` / `ExecutionFromModuleSuccess` emitted
  by a service or operator safe (the subgraph's `Safe` template instances,
  kept in the squid-only `SafeDataSource` table).

The Transfer and Safe requests include the transaction (`from`, `to`,
`value`, `input`) and all its logs (`transactionLogs`): the handlers read the
sender, the Safe's `execTransaction` calldata and the receipt, as the
subgraph's `receipt: true` handlers do.

Position, pool, gauge and LiFi events are not streamed chain-wide. Agents
act through their Safe's `execTransaction`, so the transaction logs of the
Safe and Transfer requests carry the NFPM, v2 pool, gauge and LiFi events
the subgraph's handlers act on. Three small streams are chain-wide: the
Aerodrome v2 and Aero v2 PoolFactory `PoolCreated` and the Aero GaugeManager
`GaugeCreated` (they decide which pools are tracked and which gauge pays an
Aero v2 pool). An agent's position event outside a Safe or tracked-token
transaction would be missed (a one-off check over the Basius safes is in
the BDMARK-2333 report).

The subgraph's pool templates are rows: a `VeloV2Pool` instance is a
squid-only `VeloV2PoolDataSource` row (the LpSugar `once` bootstrap at the
start block, and whitelisted Aerodrome v2 `PoolCreated` after it), an
`AeroV2Pool` instance a `V2PoolVenue` row. Pool events reach the handlers
only from those addresses, and a pool created in a block runs that block's
events after the others, as graph-node does for a new data source. The
bootstrap reads LpSugar at the start block once (39 pools, about 2 min on
`mainnet.base.org`).

When a block registers a new Basius service, the stream ends after that
block (`src/sources.ts`), the block's missing logs are fetched with
`eth_getLogs` by block hash, with the other logs of their transactions from
the receipts (`src/block.ts`), and `src/main.ts` starts a new
processor run with the new safes in its filters, from the next block. A
restart per new service is cheap; Basius has a handful.

graph-node's template semantics are kept: a Safe instance created in block N
runs all of its block-N events, including ones before the registration, after
the block's other events; a second `Safe.create` for an address that already
has one is dropped (so a shared operator safe counts once).

`INGEST_SOURCE`, `SQD_PORTAL_URL`, `SQD_PORTAL_API_KEY` and `RPC_RATE_LIMIT`
behave as in the other squids (`@olas/squid-shared` `getIngestionConfig`).
The public `base-mainnet` portal answers 529 under a sustained backfill; use a
key or RPC ingestion. `BABYDEGEN_TO_BLOCK` stops at a block for parity runs.

## RPC

`RPC_HTTP` must be an **archive** Base endpoint: every price is read at the
event's block (Chainlink `latestRoundData`, Aerodrome `getReserves`), as is
`ethereum.hasCode` for the EOA check. Reads are strict, like `squids/staking`:
a revert is the subgraph's `.reverted`, any other failure fails the batch.
There is no fallback to `latest`. Startup checks the registry's code at the
start block. `mainnet.base.org` is archive but rate-limited; its `eth_getLogs`
is capped, which matters for RPC ingestion.

## Parity notes

- **Numbers.** Every `BigDecimal` step goes through `src/decimal.ts`, a port
  of graph-node's arithmetic (bigdecimal 0.1.2 plus `normalized()`): 34
  significant digits, half-up for positives. Negatives are truncated and can
  keep a 35th digit, a quirk of bigdecimal 0.1.2's digit count that the port
  keeps on purpose.
- **Ids.** Bytes ids are lowercase hex as graph-node prints them, including
  the UTF-8 ones: `ServiceRegistration`/`ServiceIndex` `"0x363037"` for
  service 607, `TokenBalance` = hex of `"<safe>-<token>"`, `ServiceRegistry`
  = hex of `"registry"`, `PriceUpdate` = token address + hex of the timestamp.
- **Lists.** `Token.priceSources`, `Service.positionIds` and
  `ServiceRegistry.serviceAddresses` are id lists (graph-node returned
  entities for `priceSources`).
- **Safe 1.4.1 is not seen, on purpose.** The subgraph's ABI declares
  `ExecutionSuccess(bytes32,uint256)` with nothing indexed (Safe ≤ 1.3.0).
  Safe 1.4.1 indexes `txHash`, so its log has two topics and graph-node skips
  it; the squid skips it too. ETH sent out by a 1.4.1 service safe through
  `execTransaction` is therefore missing from funding and ETH balance in both.
- **Funding (#175).** Every tracked token and ETH counts. The user side is
  the operator Safe, the tx sender, any Safe (`getThreshold()` answers,
  cached as `AddressType.isSafe`) or an EOA; never the service Safe, its
  `agentInstances` or the zero address. An outflow to another contract is a
  withdrawal only when the receipt shows nothing coming back to the Safe.
  ETH out is decoded from the Safe's own `execTransaction` (a Call or the
  Calls of a `multiSend` it delegatecalls). Withdrawals go to
  `totalWithdrawnUsd`; `netUsd` equals `totalInUsd`; `totalOutUsd` and
  `fundingOutTxs` stay empty.
- **Prices (#175).** Chainlink at 1e8 with a 90000 s staleness cut-off
  against the block (pricing) or none (`getEthUsd`), a 300 s cache on the
  `Token` row, sources read by priority, pool pair legs priced from their
  own feed (never $1 / $3000), stable v2 pools quoted with `getAmountOut`, CL
  pools with each side's decimals. No $1 fallback: without a valid price a
  token keeps its last one with `priceStale`, a stablecoin below $0.98 is
  `depegged`. `PriceUpdate.block` is 0, as in the subgraph. Aero v2 pools have
  no `stable()`; their kind comes from the `V2PoolVenue` row the Aero
  factory wrote, as in the subgraph.
- **Positions (#174 + #175).** CL ids are `utf8hex("<safe>-<protocol>-<tokenId>")`,
  v2 ids `utf8hex("<safe>-<protocol>-<pool>")`, with protocol `aerodrome-cl`,
  `aerodrome-v2`, `aero-cl` or `aero-v2` (the emitting NFPM or the pool's
  factory picks it). Collected fees exclude principal released by
  `DecreaseLiquidity`; gauge rewards are credited from `EmissionsClaimed`
  (Aero CL), the gauge `Withdraw` after the reward (legacy CL), or split by
  what each position had earned before the block, else by liquidity.
  `SwapTransaction` and `CreditedRewardClaim` ids keep graph-node's bytes
  (`txHash ++ "-" ++ logIndex` as UTF-8, `txHash ++ logIndex` as 4
  little-endian bytes). The subgraph's in-memory pool caches (poolIndexCache,
  discoveredPools) only save calls; they change no row and are not ported.
- **Portfolio metrics.** `calculatePortfolioMetrics` is still a no-op at
  every call site (part 3); `refreshAllActivePositions` (src/refresh.ts) is
  the scheduler's protocol dispatch, exported for part 3.
