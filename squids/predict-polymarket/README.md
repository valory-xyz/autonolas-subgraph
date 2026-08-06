# predict-polymarket-squid

Indexer for Olas Predict trader agents on Polymarket (Polygon), built with
the [SQD Squid SDK](https://docs.sqd.dev). It reads events from the
blockchain, computes agent trading data (bets, market participation,
profits, payouts), stores it in PostgreSQL, and serves it over a GraphQL
API.

## How it works

Three processes, one codebase:

1. **Processor** (`node lib/main.js`) — downloads blockchain events from
   the SQD Portal, runs the handler code in `src/`, writes results
   to PostgreSQL. It saves its position (a "checkpoint") in the database
   after every batch, so it can be stopped and restarted at any time and
   it continues where it stopped.
2. **GraphQL API** (`npx squid-graphql-server`) — reads the same
   PostgreSQL and answers queries. It has no state of its own.
3. **Migration job** (`npx squid-typeorm-migration apply`) — creates or
   updates the database tables. Runs once before the processor starts,
   and again after every schema change.

Key files:

| Path | What it is |
|---|---|
| `schema.graphql` | the data model — entities and their fields |
| `src/model/` | TypeScript classes generated from `schema.graphql` (do not edit by hand) |
| `src/abi/` | event decoders generated from the shared [`abis/`](../../abis) (do not edit by hand) |
| `src/processor.ts` | which contracts and events to index, from which blocks |
| `src/main.ts` | decode-and-dispatch: routes each event to its handler |
| `src/handlers.ts` + `src/logic.ts` | the handler code — what each event does to the data |
| `db/migrations/` | generated SQL that creates the database tables |
| `squid.yaml` | SQD deployment description |

## Environment variables

| Var | What |
|---|---|
| `DB_HOST` `DB_PORT` `DB_NAME` `DB_USER` `DB_PASS` | PostgreSQL connection |
| `SQD_PORTAL_URL` | SQD Portal dataset URL. Defaults to the public portal, which needs no key. Production uses the private portal URL |
| `SQD_PORTAL_API_KEY` | key for the private portal (secret, sent as the `x-api-key` header). Leave empty for the public portal |
| `RPC_POLYGON_HTTP` | a Polygon RPC endpoint. Used only for two contract calls per new market — not for event ingestion |
| `GQL_PORT` | GraphQL server port. Always set it to 4350 — the server's built-in default is a different port |
| `PROMETHEUS_PORT` | processor metrics port. If unset, a random port is used |

## Run it locally

```bash
cp .env.example .env       # defaults work as-is (public portal, no key)
docker compose up -d       # starts PostgreSQL on port 23798
npm ci                     # install dependencies
npm run build              # compile TypeScript to lib/
npx squid-typeorm-migration apply   # create the database tables
node lib/main.js           # start the processor
npx squid-graphql-server   # start the API on :4350 (separate terminal)
```

The processor prints progress lines (`rate: N blocks/sec, eta: ...`).
A full index of the history takes 1–2 days of continuous running.
Stopping it (Ctrl-C, crash, reboot) is always safe — restart it and it
continues from the checkpoint.

## Production

One Docker image (see `Dockerfile`), three workloads — full example in
`deploy/k8s-example.yaml`. Strict rules:

- **Run exactly one processor.** Never two. Two processors writing to one
  database corrupt the checkpoint. In Kubernetes: 1 replica, `Recreate`
  strategy (never `RollingUpdate`, which briefly runs two).
- The API can run with any number of replicas.
- Run the migration job before the first processor start and after every
  change to `db/migrations/`.
- Killing or restarting the processor is always safe.
- Sizing: ~2 CPU while it indexes the history, then 0.5–1 CPU.

## Making changes

First, two facts that decide everything below:

- Data the processor already wrote is **not** recalculated when you change
  code. New code only applies to new blocks.
- A full re-index from zero takes only 1–2 days. It is a normal, cheap
  operation here — when in doubt, re-index.

### Fixing issues that only affect future blocks

This also covers bugs that crashed the processor before writing anything
wrong.

1. `npm run build`
2. Deploy / restart the processor.

It continues from the checkpoint. Nothing else needed.

### Fixing issues that impacted already-indexed data

The wrong rows are already in the database — restarting does not repair
them. Do a **blue-green re-index**:

1. Deploy the fixed code as a second squid with a fresh, empty database
   (second Postgres or second database on the same server).
2. Let it re-index everything from zero (1–2 days).
3. Check the data.
4. Point the API at the new database. Delete the old one.

The old squid keeps serving queries the whole time, so users see no
downtime. Only for very small, fully understood mistakes: repairing the
affected rows directly with SQL is acceptable — the database is ours.

### Adding or changing a field / entity

1. Edit `schema.graphql`.
2. `npm run codegen` — regenerates `src/model/`.
3. Update the handler code to fill the new field.
4. `npm run build`
5. `npx squid-typeorm-migration generate` (needs a running PostgreSQL) —
   creates a new file in `db/migrations/`. Commit it.
6. Deploy: run the migration job, restart the processor.
7. Decide: does the new field need values for old blocks too? If yes —
   blue-green re-index (see above). If it only needs to fill from now on —
   you are done.

### Re-indexing from a specific block

Not supported. Two reasons:

- The handlers keep running totals (`totalTraded`, `totalBets`, the
  `Global` counters). Processing the same blocks twice adds the same
  trades to the totals twice. The database has no way to know a block was
  already counted.
- The handlers also depend on state built from the earliest blocks (agent
  registrations, market creation). An index that starts at a later block
  is missing that state and silently drops data.

So there are only two valid modes: continue forward from the checkpoint
(automatic), or re-index everything from zero (blue-green, 1–2 days).
Never edit the checkpoint in `squid_processor.status` by hand.

### Indexing a new contract or event

1. Put the contract's ABI JSON into the shared [`abis/`](../../abis)
   folder.
2. Add the file to the `typegen` script list in `package.json`, then
   `npm run typegen` — regenerates `src/abi/`.
3. Add the contract address + event to `src/processor.ts` (`addLog`).
4. Write the handler in `src/main.ts`.
5. Old blocks contain events of the new contract too — so this normally
   ends with a blue-green re-index.

## Migration from the subgraph

One-time cutover material (data validation script, known differences from
old subgraph deployments, cutover checklist): see
[MIGRATION.md](MIGRATION.md).
