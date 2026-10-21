# service-registry-squid

Indexer for the Olas **Service Registry on Robinhood Chain** (chain id 4663)
and **Base** (8453), built with the [SQD Squid SDK](https://docs.sqd.dev). It reads registry
events from the chain, tracks services, their multisigs, ERC-8004 identity
links and daily agent activity, stores the result in PostgreSQL, and serves
it over a GraphQL API.

SQD port of
[`subgraphs/service-registry`](https://github.com/valory-xyz/autonolas-subgraph-studio)
in the `autonolas-subgraph-studio` repo. The subgraph keeps serving the
graph-node chains; Robinhood is squid-only from day one, and Base moves off
graph-node once each consumer passes a parity check against the Base
subgraph (`subgraph.base.yaml`, same start blocks and addresses).

## How it works

Three processes, one codebase:

1. **Processor** (`node lib/main.js`) — downloads events from the SQD
   Portal, runs the handler code in `src/`, writes results to PostgreSQL.
   It saves its position after every batch, so it can be stopped and
   restarted at any time and continues where it stopped.
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
| `src/constants.ts` | chain, contract addresses, start block |
| `src/processor.ts` | which contracts and events to index, from which blocks |
| `src/main.ts` | decode-and-dispatch: routes each event to its handler |
| `src/handlers.ts` + `src/logic.ts` | the handler code — what each event does to the data |
| `src/entityCache.ts` | read-through cache, FK-ordered writes, the known-multisig set |
| `db/migrations/` | generated SQL that creates the database tables |
| `squid.yaml` | SQD deployment description |

## What replaces the subgraph's Safe template

The subgraph starts a per-address listener for each service multisig when
`CreateMultisigWithAgents` fires. SQD fixes the set of contracts when the
processor starts, so instead the processor subscribes to
`ExecutionSuccess` and `ExecutionFromModuleSuccess` **by topic, from any
address**, and drops every log whose address is not in the in-memory set
of known service multisigs (`EntityCache.isKnownMultisig`). Nothing about
foreign Safes is stored.

`src/safeLogs.ts` reproduces the template's timing: when a Safe is first
registered in a block, graph-node re-runs every Safe log of that block for
the new template — including logs *before* `CreateMultisigWithAgents`
(e.g. the reuse module's `execTransaction`) — after the block's other
events. A Safe registered again later gets no second template (graph-node
drops duplicate data sources), so its executions count once.

Measured on Robinhood before committing to it: 11 such logs over 20,000
blocks (~34 minutes), from 7 Safes — about 470 logs a day chain-wide. On
Base: 0.02 logs/block at 15M, 0.9 at 46M, ~10.7 at head (~460k a day), about
45M logs over the whole backfill. If
that ever grows to Polygon levels, split the subscription into an
address-filtered range up to a checkpoint plus a topic-only tail, the
"factory contracts" pattern in
[SQD's docs](https://docs.sqd.dev/en/sdk/squid-sdk/resources/evm/factory-contracts).

## Differences from the subgraph

Entity for entity the same. Forced by the store:

- every id is a string; address-keyed entities (`Multisig`, `Creator`,
  `Operator`) use the lowercase hex address where the subgraph used `Bytes`;
- addresses and hashes are lowercase hex strings, not `Bytes`;
- `ERC8004Agent.service` is `ERC8004Agent.services`, a derived list.
  OpenReader can only derive a one-to-one over a unique column, and making
  `Service.erc8004Agent` unique would turn "two services point at one
  agent" — merely odd on graph-node — into a unique violation that stalls
  the processor. The link itself is a plain assignment, exactly as in the
  subgraph.
- `ERC8004Metadata.agent` is a real foreign key, so a `MetadataSet` that
  lands before its `ServiceAgentLinked` creates the `ERC8004Agent` row here,
  where the subgraph left a dangling reference and no row.

A Safe reused across service redeployments is counted once per execution,
as in the subgraph: graph-node ignores a template whose address, name and
context duplicate an existing one (`is_duplicate_of` in graph-node's
`chain/ethereum/src/data_source.rs`).

Query syntax is squid GraphQL, not subgraph GraphQL: `limit` / `offset`
instead of `first` / `skip`, `orderBy: field_ASC` instead of
`orderBy` + `orderDirection`, and nested filters as
`where: { creator: { id_eq: "0x…" } }` instead of `creator_: { id: "0x…" }`.
Consumers written against the subgraph need those three changes.

## Environment variables

| Var | What |
|---|---|
| `DB_HOST` `DB_PORT` `DB_NAME` `DB_USER` `DB_PASS` | PostgreSQL connection |
| `SERVICE_REGISTRY_CHAIN` | Which `CHAINS` entry in `src/constants.ts` this deployment indexes: `robinhood` (default) or `base`; an unknown name refuses to start |
| `SQD_PORTAL_URL` | SQD Portal dataset URL. Defaults to the chain's dataset; an override must name the same dataset or the processor refuses to start |
| `SQD_PORTAL_API_KEY` | key for the private portal (secret, sent as the `x-api-key` header). **Required on Robinhood** (private dataset). Optional on Base, but set it in production: the public portal rate-limits a backfill |
| `GQL_PORT` | GraphQL server port. Always set it to 4350 — the server's built-in default is a different port |
| `PROMETHEUS_PORT` | processor metrics port. If unset, a random port is used |

No RPC: nothing here reads contract state.

## Run it locally

```bash
cp .env.example .env       # then fill in SQD_PORTAL_API_KEY
docker compose up -d       # starts PostgreSQL on port 23800
npm ci                     # install dependencies
npm run build              # compile TypeScript to lib/
npx squid-typeorm-migration apply   # create the database tables
node lib/main.js           # start the processor
npx squid-graphql-server   # start the API on :4350 (separate terminal)
```

On Robinhood the backfill is minutes. On Base it is bound by the
chain-wide Safe stream (~45M logs), so use the private portal. Stopping the processor (Ctrl-C, crash, reboot) is always
safe — restart it and it continues from the checkpoint.

## Production

One Docker image (`../Dockerfile`, built from the repo root with
`--build-arg SQUID=<this folder>`), three workloads — full example in
`deploy/k8s-example.yaml`. Strict rules:

- **Run exactly one processor.** Two processors writing to one database
  corrupt the checkpoint. In Kubernetes: 1 replica, `Recreate` strategy.
- The API can run with any number of replicas.
- Run the migration job before the first processor start and after every
  change to `db/migrations/`.

## Making changes

```bash
npm run typegen     # after changing which ABIs / events are used
npm run codegen     # after editing schema.graphql -> regenerates src/model
npm run build
npm test            # vitest, no database needed
npx squid-typeorm-migration generate   # after a schema change; needs the local DB up
```

Handlers take plain decoded parameters and the `IEntityCache` interface, so
`tests/handlers.test.ts` runs the full lifecycle against
`tests/inMemoryCache.ts` with no Postgres.

## Adding a chain

Add an entry to `CHAINS` in `src/constants.ts` (portal dataset, registry and
bridger addresses, start block), set `SERVICE_REGISTRY_CHAIN` to its key and
deploy against a fresh database. One deployment is one chain; nothing else
in the code names a chain.

## Shared code

Chain selection and the entity cache come from [`../_shared`](../_shared)
(`@olas/squid-shared`, installed via `file:../_shared`). Build it before this
squid: `cd ../_shared && npm ci && npm run build`. The shared `../Dockerfile` does
the same, which is why the image build context is the repo root.
