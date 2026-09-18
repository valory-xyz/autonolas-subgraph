# liquidity-squid

Indexer for the **OLAS protocol-owned liquidity pools** on one L2, built with
the [SQD Squid SDK](https://docs.sqd.dev). It tracks each pool's reserves,
LP token supply, LP transfers and swap fees, stores them in PostgreSQL and
serves them over a GraphQL API. One deployment indexes one chain, picked by
`LIQUIDITY_CHAIN`; Robinhood Chain (4663) is the first.

SQD port of
[`subgraphs/liquidity-l2`](https://github.com/valory-xyz/autonolas-subgraph-studio)
in the `autonolas-subgraph-studio` repo. Both pool kinds the subgraph knows
are implemented, so any of its chains can move here by adding a `CHAINS`
entry and re-indexing:

| Kind | Reserves | Fees | Chains today |
|---|---|---|---|
| `uniswap-v2` | from the pair's `Sync` event | 0.3% of each `Swap`'s input | Robinhood (OLAS/WETH), Celo (Ubeswap CELO/OLAS) |
| `balancer-v2` | `getPoolTokens` at every mint/burn, then Vault `Swap` deltas | `amountIn × swapFeePercentage` per Vault `Swap` | Gnosis, Polygon, Arbitrum, Optimism, Base (two pools) |

## How it works

Three processes, one codebase:

1. **Processor** (`node lib/main.js`) — reads blocks from the SQD Portal (or
   an RPC, see below), runs the handlers in `src/`, writes to PostgreSQL. It
   checkpoints after every batch, so it can be stopped and restarted at any
   time.
2. **GraphQL API** (`npx squid-graphql-server`) — reads the same PostgreSQL.
   Stateless.
3. **Migration job** (`npx squid-typeorm-migration apply`) — creates or
   updates the tables. Once before the first processor start, and after
   every schema change.

Key files:

| Path | What it is |
|---|---|
| `schema.graphql` | the data model (header lists every delta from the subgraph schema) |
| `src/model/` | TypeScript classes generated from `schema.graphql` (do not edit by hand) |
| `src/abi/` | event decoders generated from the shared [`abis/`](../../abis) (do not edit by hand) |
| `src/constants.ts` | the `CHAINS` table: pools, DEX kind, start blocks, Chainlink feed per chain |
| `src/processor.ts` | subscriptions, portal-or-RPC ingestion, optional end block |
| `src/main.ts` | decode-and-dispatch: routes each event to its handler |
| `src/handlers.ts` + `src/logic.ts` | the handler code, ported branch for branch from the subgraph |
| `src/entityCache.ts` | FK-safe flush order over the shared entity cache |
| `db/migrations/` | generated SQL that creates the tables |
| `scripts/verify-vs-chain.py` | compares a deployment against RPC ground truth |

Shared code (chain selection, RPC reads with fallback, Chainlink and DEX
readers, the entity cache) lives in [`../_shared`](../_shared) and is
consumed as `@olas/squid-shared`. It must be built before this package
resolves it: `cd ../_shared && npm ci && npm run build`.

## Differences from the subgraph

Entity for entity the same, with these deltas:

- ids and addresses are lowercase hex strings, not `Bytes`;
- `PoolMetrics.celoUsdPrice` → **`nativeUsdPrice`** and `PriceData` id
  `celo-usd` → **`native-usd`**: it is the chain's native token price from
  Chainlink, whatever the chain (0 where no feed is configured, as on Gnosis);
- `PoolMetrics.dex` names the pool kind; **`BPTTransfer.pool`** and
  **`DailyFees.pool`** link the row to its pool, so a chain with several
  pools (Base) stays attributable;
- **ids changed shape**: `DailyFees` is `${pool}-${dayTimestamp}` (subgraph:
  the day timestamp alone) and `BPTTransfer` is `${txHash}-${logIndex}`
  (subgraph: the two concatenated as bytes). A consumer moving a chain here
  — olas.network reads `celoUsdPrice` in
  `common-util/api/other-metrics/protocol.ts` — has to change field name,
  ids and dialect together;
- `IndexerStatus` (id `"1"`) carries the last indexed block, for stale checks.

Query dialect is OpenReader, not The Graph: `poolMetrics`, `dailyFees`,
`bptTransfers` with `limit` / `offset` / `orderBy: field_DESC`, and
`poolMetricsById(id)` for a single row (the subgraph's
`poolMetrics_collection` / `poolMetrics(id)`).

## Environment variables

| Var | What |
|---|---|
| `DB_HOST` `DB_PORT` `DB_NAME` `DB_USER` `DB_PASS` | PostgreSQL connection |
| `LIQUIDITY_CHAIN` | which `CHAINS` entry to index. Default `robinhood` |
| `INGEST_SOURCE` | `portal` or `rpc`. Unset: `portal` when `SQD_PORTAL_API_KEY` is set, `rpc` otherwise |
| `SQD_PORTAL_URL` | SQD Portal dataset URL. `robinhood-mainnet` is a **private** dataset: the public portal answers 404, so it and the key come from the infra secret |
| `SQD_PORTAL_API_KEY` | key for the private portal (secret, `x-api-key` header) |
| `RPC_HTTP` | JSON-RPC for the contract reads (Uniswap V2: `token0`/`token1` once; Balancer: pool id and swap fee once, `getPoolTokens` at every mint/burn block; Chainlink at most hourly), and ingestion when `INGEST_SOURCE=rpc`. Archive-capable on Balancer chains |
| `RPC_HTTP_FALLBACK` | optional second endpoint for the contract reads |
| `RPC_RATE_LIMIT` | optional requests/second cap for RPC ingestion |
| `LIQUIDITY_END_BLOCK` | optional: index up to this block and exit. For validation runs only |
| `GQL_PORT` | GraphQL server port. Always 4350 |
| `PROMETHEUS_PORT` | processor metrics port |

## Run it locally

```bash
cd ../_shared && npm ci && npm run build && cd ../liquidity
cp .env.example .env       # then fill in the portal URL / key, or use INGEST_SOURCE=rpc
docker compose up -d       # PostgreSQL on port 23801
npm ci && npm run build
npx squid-typeorm-migration apply
node lib/main.js           # processor
npx squid-graphql-server   # API on :4350, separate terminal
```

## Validating a deployment

```bash
./scripts/verify-vs-chain.py http://localhost:4350/graphql https://rpc-gate.autonolas.tech/robinhood-rpc/ --from-block 59278000
```

The script reads the squid's indexed block, then recomputes at that block
from RPC: LP total supply, reserves, LP-transfer count, swap count and the
fee sums from the raw Swap logs. Every figure must match exactly.

Both kinds were validated this way before the first deployment: Robinhood
(Uniswap V2, RPC ingestion via the archive gate) and Base's OLAS/USDC pool
(Balancer V2, public portal) to block 12,700,000, including 214 swaps of
reserve deltas.

## Bringing up another chain

Add or complete the `CHAINS` entry in `src/constants.ts` (lowercase
addresses, pool kind, start block, Chainlink feed or `null`), set
`LIQUIDITY_CHAIN` and deploy against a fresh database. Nothing else in the
code is chain-specific. The six subgraph chains are already in the table.

## Production

One Docker image (`../Dockerfile`, built from the repo root with
`--build-arg SQUID=<this folder>`), three workloads — full example in `deploy/k8s-example.yaml`. Exactly one
processor per database; the API can scale; run the migration job before the
first start and after every schema change.
