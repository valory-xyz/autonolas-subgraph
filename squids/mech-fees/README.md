# mech-fees-squid

Indexer for the **mech marketplace fees** on one chain, built with the
[SQD Squid SDK](https://docs.sqd.dev). It reads every fee event on the
marketplace's balance trackers — accruals to a mech, withdrawals by a mech,
protocol drains — and stores them per mech, per payment model and per day,
in raw token units and in USD at the event's block. One deployment indexes
one chain, picked by `MECH_FEES_CHAIN`; Robinhood Chain (4663) is the first.

SQD port of
[`subgraphs/new-mech-fees`](https://github.com/valory-xyz/autonolas-subgraph-studio)
in the `autonolas-subgraph-studio` repo. All four payment models the
subgraph knows are implemented, so any of its seven chains can move here by
setting `MECH_FEES_CHAIN` to its `CHAINS` entry and re-indexing:

| Model | Tracker | Raw unit | USD |
|---|---|---|---|
| `native` | BalanceTrackerFixedPriceNative | wei | Chainlink <native>/USD at the block; xDAI 1:1 on Gnosis |
| `token-usdc` | BalanceTrackerFixedPriceToken (USDC, or **USDG on Robinhood**) | 6-decimal units | 1:1 |
| `nvm` | BalanceTrackerNvmSubscription* | credits | `credits × ratio / 1e18 / 10^tokenDecimals`; withdrawals are paid in xDAI or USDC |
| `token-olas` | BalanceTrackerFixedPriceToken (OLAS) | OLAS wei | Balancer pool spot price (× native feed where the pool's quote is WETH/WMATIC), the Uniswap V2 pair × ETH/USD on Ethereum, USD 0 on Celo |

Why this exists next to the marketplace squid: the marketplace records a fee
only when it sees an on-chain request, so off-chain (signed) requests never
reach its totals. The trackers see every accrual regardless of how the
request arrived. On the other chains `townhall-kpis` reads `new-mech-fees`
for this (`DrainTotals`, `MechModel`), and olas.network's fees-collected
metric reads the trackers' `collectedFees()` and `Drained` logs on-chain;
on Robinhood both can read this squid.

## How it works

Three processes, one codebase:

1. **Processor** (`node lib/main.js`) — reads blocks from the SQD Portal (or
   an RPC), runs the handlers in `src/`, writes to PostgreSQL. It checkpoints
   after every batch, so it can be stopped and restarted at any time.
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
| `src/constants.ts` | the `CHAINS` table: trackers per model, burn address, pricing pool, Chainlink feed, NVM ratio |
| `src/pricing.ts` | amount → USD per model, over the shared Chainlink / Balancer / Uniswap readers |
| `src/processor.ts` | subscriptions, portal-or-RPC ingestion, optional end block |
| `src/main.ts` | decode-and-dispatch: routes each event to its handler by tracker address |
| `src/handlers.ts` + `src/logic.ts` | the handler code, ported branch for branch from the subgraph's four mappings and `utils.ts` |
| `src/entityCache.ts` | FK-safe flush order over the shared entity cache |
| `db/migrations/` | generated SQL that creates the tables |
| `scripts/verify-vs-chain.py` | recomputes the model totals from raw tracker logs and diffs them against a deployment |

Shared code (chain selection, RPC reads with fallback, Chainlink and DEX
readers, the entity cache) lives in [`../_shared`](../_shared) and is
consumed as `@olas/squid-shared`. It must be built before this package
resolves it: `cd ../_shared && npm ci && npm run build`.

## Differences from the subgraph

Entity for entity the same, with the same ids (`Global` is `""`, `Mech` is
the mech address, `MechModel` is `${mech}-${model}`, `MechTransaction` and
`DrainEvent` are `${txHash}-${logIndex}`, `DailyTotals` is the day start,
`MechDaily` is `${mech}-${dayStart}`, `DrainTotals` is the model). Forced by
the store: `Bytes` fields are lowercase hex strings. Added: `IndexerStatus`
(id `"1"`, last indexed block) for stale-data checks.

Behaviour kept for parity, including the odd bits:

- A native or USDC fee event whose price is unavailable / zero is **skipped**
  (the subgraph `return`s). An OLAS event whose pool read fails is recorded
  with USD 0. Drains are never skipped.
- NVM raw units differ between fee-in (credits as emitted) and fee-out
  (token amount converted back through the ratio), as in the subgraph. Use
  USD for cross-checks.
- Withdrawals to the chain's burn address are ignored.

Query dialect is OpenReader, not The Graph: `globalById(id: "")` instead of
`global(id: "")`, `drainTotals` instead of `drainTotals_collection`, `limit`
instead of `first`, `orderBy: timestamp_DESC`.

## Environment variables

| Var | What |
|---|---|
| `DB_HOST` `DB_PORT` `DB_NAME` `DB_USER` `DB_PASS` | PostgreSQL connection |
| `MECH_FEES_CHAIN` | which `CHAINS` entry to index. Default `robinhood`; an unknown name refuses to start |
| `INGEST_SOURCE` | `portal` or `rpc`. Unset: `portal` when `SQD_PORTAL_API_KEY` is set, `rpc` otherwise |
| `SQD_PORTAL_URL` | SQD Portal dataset URL. `robinhood-mainnet` is a **private** dataset: it and the key come from the infra secret |
| `SQD_PORTAL_API_KEY` | key for the private portal (secret, `x-api-key` header) |
| `RPC_HTTP` | JSON-RPC for the price reads at each event's block (Chainlink; on OLAS chains also the pool reserves) and for ingestion when `INGEST_SOURCE=rpc`. Archive-capable for a backfill; a pruned node falls back to the current price with a warning |
| `RPC_HTTP_FALLBACK` | optional second endpoint for the price reads |
| `RPC_RATE_LIMIT` | optional requests/second cap for RPC ingestion |
| `MECH_FEES_END_BLOCK` | optional: index up to this block and exit. For validation runs only |
| `GQL_PORT` | GraphQL server port. Always 4350 |
| `PROMETHEUS_PORT` | processor metrics port |

## Run it locally

```bash
cd ../_shared && npm ci && npm run build && cd ../mech-fees
cp .env.example .env       # then fill in the portal URL / key, or use INGEST_SOURCE=rpc
docker compose up -d       # PostgreSQL on port 23802
npm ci && npm run build
npx squid-typeorm-migration apply
node lib/main.js           # processor
npx squid-graphql-server   # API on :4350, separate terminal
```

## Validating a deployment

```bash
./scripts/verify-vs-chain.py http://localhost:4350/graphql https://rpc-gate.autonolas.tech/robinhood-rpc/
```

The script reads the squid's indexed block, pulls every tracker log up to
it from RPC, and recomputes per model: fee-in count and raw sum, fee-out
count and raw sum (burn address excluded), drain count and raw sum, and the
`Global` USD totals using the Chainlink answer at each event's block. Raw
figures must match exactly; USD must match to the precision of the feed.

## Bringing up another chain

Every subgraph chain is already in `CHAINS`. Set `MECH_FEES_CHAIN`, point
`RPC_HTTP` at an archive node for that chain, and deploy against a fresh
database. Nothing else in the code is chain-specific. A tracker whose model
has no pricing config (an `nvm` tracker without `nvm`) refuses to start.

## Production

One Docker image (`../Dockerfile`, built from the repo root with
`--build-arg SQUID=<this folder>`), three workloads — full example in `deploy/k8s-example.yaml`. Exactly one
processor per database; the API can scale; run the migration job before the
first start and after every schema change.
