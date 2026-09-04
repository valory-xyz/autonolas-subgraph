# pearl-transactions-squid

Funds-movement indexer for Pearl **Master Safe / Agent Safe** accounts on
Polygon, built with the [SQD Squid SDK](https://docs.sqd.dev). It reads
events from the blockchain, classifies every fund movement in and out of a
user's wallets, stores the result in PostgreSQL, and serves it over a
GraphQL API. It powers Pearl's wallet transaction-history view.

SQD port of
[`subgraphs/pearl-transactions`](https://github.com/valory-xyz/autonolas-subgraph-studio)
(in the `autonolas-subgraph-studio` repo — **not** the copy in this repo,
which is an older Gnosis-only fork). The subgraph still serves Gnosis, Base
and Optimism; Polygon moved here because graph-node indexed it at roughly
5 blocks/sec through the USDC.e-dense range and sat ~15 days behind head.

## How it works

Three processes, one codebase:

1. **Processor** (`node lib/main.js`) — downloads blockchain events from the
   SQD Portal, runs the handler code in `src/`, writes results to
   PostgreSQL. It saves its position (a "checkpoint") after every batch, so
   it can be stopped and restarted at any time and continues where it
   stopped.
2. **GraphQL API** (`npx squid-graphql-server`) — reads the same PostgreSQL
   and answers queries. It has no state of its own.
3. **Migration job** (`npx squid-typeorm-migration apply`) — creates or
   updates the database tables. Runs once before the processor starts, and
   again after every schema change.

Key files:

| Path | What it is |
|---|---|
| `schema.graphql` | the data model — entities and their fields |
| `src/model/` | TypeScript classes generated from `schema.graphql` (do not edit by hand) |
| `src/abi/` | event decoders generated from the shared [`abis/`](../../abis) (do not edit by hand) |
| `src/constants.ts` | per-chain addresses; one line selects which chain this deployment indexes |
| `src/processor.ts` | which contracts and events to index, from which blocks |
| `src/main.ts` | decode-and-dispatch: routes each event to its handler |
| `src/handlers.ts` | what each event does to the data (store + RPC) |
| `src/logic.ts` | the pure half — classification, ID shapes, the bond queue. Unit-tested |
| `src/entityCache.ts` | read-through cache, FK-ordered writes, tracked-address index |
| `src/rpc.ts` | the four contract calls, memoized |
| `db/migrations/` | generated SQL that creates the database tables |
| `scripts/compare-vs-subgraph.py` | data validation against a deployed subgraph |

## Environment variables

| Var | What |
|---|---|
| `DB_HOST` `DB_PORT` `DB_NAME` `DB_USER` `DB_PASS` | PostgreSQL connection |
| `SQD_PORTAL_URL` | SQD Portal dataset URL. Defaults to the public portal — see the warning below. Production uses the private portal URL |
| `SQD_PORTAL_API_KEY` | key for the private portal (secret, sent as the `x-api-key` header). Leave empty for the public portal |
| `RPC_POLYGON_HTTP` | a Polygon RPC endpoint. **Must be archive-capable** — see below |
| `GQL_PORT` | GraphQL server port. Always set it to 4350 — the server's built-in default is a different port |
| `PROMETHEUS_PORT` | processor metrics port. If unset, a random port is used |

### Two endpoint requirements that are not optional

**The private portal.** The public portal answers a sustained backfill with
HTTP 529 (`Service is overloaded`) and 10-second backoffs. The backfill is
~12.8M blocks. On the public portal it does not finish in reasonable time.

**An archive RPC.** `src/rpc.ts` reads a Safe's `getOwners()` and
`getThreshold()` *at the block where the Safe is first seen*, not at
`latest`. Owner lists change over time — that is exactly why
`AddedOwner` / `RemovedOwner` / `ChangedThreshold` are indexed — so reading
at `latest` and then replaying historical owner events on top would produce
a wrong owner set and, worse, a wrong `masterEoa`, which routes a user's
whole history to the wrong place. A non-archive node will fail these calls
on historical blocks.

## Run it locally

```bash
cp .env.example .env       # defaults work as-is (public portal, no key)
docker compose up -d       # starts PostgreSQL on port 23799
npm ci                     # install dependencies
npm run build              # compile TypeScript to lib/
npx squid-typeorm-migration apply   # create the database tables
node lib/main.js           # start the processor
npx squid-graphql-server   # start the API on :4350 (separate terminal)
```

The processor prints progress lines (`rate: N blocks/sec, eta: ...`).
Stopping it (Ctrl-C, crash, reboot) is always safe — restart and it
continues from the checkpoint.

Two rate numbers appear in those lines. `mapping` is our handler
throughput (~2,000 blocks/sec); `rate` is end-to-end and is bounded by
portal ingest. If `rate` is far below `mapping`, the bottleneck is the
portal, not this code.

Node 24 is required (see [`.nvmrc`](../../.nvmrc)). On Node 22, `npm`
crashes resolving vitest's peer set with
`Cannot read properties of null (reading 'edgesOut')`.

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
- A full re-index from zero is a normal, cheap operation here — when in
  doubt, re-index.

### Fixing issues that only affect future blocks

1. `npm run build`
2. Deploy / restart the processor.

It continues from the checkpoint. Nothing else needed.

### Fixing issues that impacted already-indexed data

Restarting does not repair wrong rows. Do a **blue-green re-index**:

1. Deploy the fixed code as a second squid with a fresh, empty database.
2. Let it re-index everything from zero.
3. Check the data (`scripts/compare-vs-subgraph.py`).
4. Point the API at the new database. Delete the old one.

The old squid keeps serving queries throughout, so users see no downtime.
For very small, fully understood mistakes, repairing the affected rows
directly with SQL is acceptable — the database is ours.

### Adding or changing a field / entity

1. Edit `schema.graphql`.
2. `npm run codegen` — regenerates `src/model/`.
3. Update the handler code to fill the new field.
4. `npm run build`
5. `npx squid-typeorm-migration generate` (needs a running PostgreSQL) —
   creates a new file in `db/migrations/`. Commit it.
6. Deploy: run the migration job, restart the processor.
7. Decide: does the new field need values for old blocks too? If yes —
   blue-green re-index. If it only needs to fill from now on, you are done.

If the new entity references another, add it to `FLUSH_ORDER` in
`src/entityCache.ts` **after** everything it points at. TypeORM enforces
real foreign keys; graph-node did not.

### Re-indexing from a specific block

Not supported, for the same two reasons as predict-polymarket: the handlers
keep running totals (`totalOlasRewardsClaimed`, the daily buckets), so
reprocessing a block double-counts it; and they depend on state built from
earlier blocks (service registrations, Safe discovery), so a later start
silently drops data. Either continue forward from the checkpoint, or
re-index everything from zero. Never edit `squid_processor.status` by hand.

### Indexing a new contract or event

1. Put the contract's ABI JSON into the shared [`abis/`](../../abis) folder.
2. Add the file to the `typegen` script list in `package.json`, then
   `npm run typegen` — regenerates `src/abi/`.
3. Add the contract address + event to `src/processor.ts` (`addLog`).
4. Write the handler in `src/handlers.ts` and dispatch it in `src/main.ts`.
5. Old blocks contain events of the new contract too — so this normally
   ends with a blue-green re-index.

If you subscribe **without** an address filter, route the decode through
`decodeForeignSafe` in `src/main.ts`. Indexed-ness is not part of an event
signature, so unrelated contracts can emit the same topic0 with a different
topic count; the raw decoder throws on those and kills the batch.

### Bringing up another chain

`src/constants.ts` carries the full per-chain table (Gnosis, Polygon,
Optimism, Base). Change `CHAIN` and redeploy against a fresh database — a
squid deployment is one chain. Nothing else in the code is Polygon-specific.

## Migration from the subgraph

One-time cutover material — validation, known differences, cutover
checklist: see [MIGRATION.md](MIGRATION.md).
