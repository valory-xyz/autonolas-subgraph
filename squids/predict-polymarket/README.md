# predict-polymarket-squid

SQD/Subsquid indexer for Olas Predict trader agents on Polymarket (Polygon).
Replaces the graph-node subgraph (`autonolas-subgraph/subgraphs/predict-polymarket`).
DepositWallet linking is factory-event based (`WalletDeployed`), replacing the
legacy global pUSD Transfer heuristic.

## Stack

- classic Squid SDK: `@subsquid/evm-processor` + `@subsquid/typeorm-store`
- data source: SQD Network (v2 gateway today; Portal-native SDK port is a
  planned follow-up), API key required
- Postgres store + `@subsquid/graphql-server` GraphQL API
- one external eth_call (CTF `getCollectionId` at `ConditionPreparation`),
  memoized, via `RPC_POLYGON_HTTP`

## Environment

| Var | What |
|---|---|
| `DB_HOST` `DB_PORT` `DB_NAME` `DB_USER` `DB_PASS` | Postgres |
| `SQD_API_KEY` | SQD data-lake key (secret). Without it: slow RPC-only mode |
| `RPC_POLYGON_HTTP` | Polygon RPC for the eth_call + chain head |
| `GQL_PORT` | GraphQL server port (set 4350; server default differs) |
| `PROMETHEUS_PORT` | processor metrics port (random if unset) |

## Local development

```bash
cp .env.example .env       # fill SQD_API_KEY
docker compose up -d       # Postgres on :23798
npm ci && npm run build
npx squid-typeorm-migration apply
node lib/main.js           # processor; resumes from checkpoint on restart
npx squid-graphql-server   # GraphQL on :4350 (separate terminal)
```

After changing `schema.graphql`: `npm run codegen && npm run build`, then
`npx squid-typeorm-migration generate && ... apply`.
After changing `abi/*.json`: `npm run typegen`.

## Production

One image (see `Dockerfile`), three workloads — see `deploy/k8s-example.yaml`:

1. migration Job — `npx squid-typeorm-migration apply`
2. processor — `node lib/main.js`. **Exactly 1 replica, Recreate strategy**
   (concurrent processors corrupt the cursor). Safe to kill any time —
   resumes from the `squid_processor.status` checkpoint; reorgs are rolled
   back automatically via the hot-blocks change journal.
3. GraphQL API — `npx squid-graphql-server`, scale freely, stateless.

Backfill sizing: ~2 CPU for the initial 1–2 days, then 0.5–1 CPU.
Full re-index from genesis is always a valid recovery path (~1–2 days).

## Validation

`scripts/compare-vs-subgraph.py <graphql-url>` diffs this store against a
graph-node deployment of the subgraph: per-day statistics for fully-elapsed
days, TraderAgent identity, and DepositWallet→agent links (factory vs pUSD
heuristic). Note: old subgraph deployments miss adapter payouts and
v2-only-market trades — see the decision doc for the known classes.
