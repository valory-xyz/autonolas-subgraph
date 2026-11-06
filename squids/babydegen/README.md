# Babydegen (Basius) squid — Base

SQD port of autonolas-subgraph-studio `subgraphs/babydegen/babydegen-base`
(Studio `olas-babydegen-base`), which tracks the Basius agent (agentId 115) on
Base. It is being ported in three slices (BDMARK-2311):

| Slice | Content | Status |
|---|---|---|
| 1 | Scaffold, service discovery, Safe/funding flows, token balances, token pricing | this package |
| 2 | Aerodrome Slipstream (CL) and v2 positions, gauges, LiFi swaps | next |
| 3 | 1800-block snapshot scheduler, ROI/APR, `AgentPortfolioSnapshot`, `DailyPopulationMetric`, parity script, k8s example | last |

Entities written today: `Service`, `ServiceRegistration`, `ServiceIndex`,
`ServiceRegistry`, `AddressType`, `FundingBalance`, `TokenBalance`, `Token`,
`PriceSource`, `PriceUpdate`, and `AgentPortfolio`. `AgentPortfolio` differs
from the subgraph until slice 3 ports `calculatePortfolioMetrics`: its metrics
stay 0, `lastUpdated` stays at creation, and `firstTradingTimestamp` and
`firstFundingEthPrice` come from the first funding, where the subgraph falls
back to the registration timestamp first. Consumers read only
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
this squid's `abis/`: event-only fragments of `GnosisSafe.json` and
`ServiceRegistryL2.json` with just the five events handled, copied verbatim
from the shared files.

## Ingestion: restart on a new Safe

Every subgraph handler is gated on a tracked Safe (`Service.load(...)`), so
the squid does not stream all USDC/WETH Transfers or every Safe event on
Base. It subscribes to:

- ServiceRegistryL2 `RegisterInstance` / `CreateMultisigWithAgents`;
- `Transfer` on the 8 tracked tokens with `from` or `to` = a service safe;
- `SafeReceived` / `ExecutionSuccess` / `ExecutionFromModuleSuccess` emitted
  by a service or operator safe (the subgraph's `Safe` template instances,
  kept in the squid-only `SafeDataSource` table).

When a block registers a new Basius service, the stream ends after that
block (`src/sources.ts`), the block's missing logs are fetched with
`eth_getLogs` by block hash (`src/block.ts`), and `src/main.ts` starts a new
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
- **Prices.** The subgraph's own rules are kept: Chainlink at 1e8 with a 24h
  staleness cut-off (pricing) or none (`getEthUsd`), a 300 s cache on the
  `Token` row, $1 fallback for the critical stablecoins, and AERO from the
  AERO/USDC v2 pool. `PriceUpdate.block` is 0, as in the subgraph.
