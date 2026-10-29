# marketplace-squid

Indexer for the Olas **Mech Marketplace** on chains graph-node does not
serve or is being retired on, built with the [SQD Squid SDK](https://docs.sqd.dev).
Chains: **Robinhood Chain** (4663) and **Base** (8453). It reads marketplace,
mech, registry and karma events, tracks mechs, requests, deliveries,
service activity and fees, stores them in PostgreSQL and serves them over a
GraphQL API.

SQD port of [`subgraphs/marketplace`](../../subgraphs/marketplace) with two
things removed on purpose:

- **No IPFS reading.** Request and delivery payloads are off-chain now.
  The raw 32-byte payload is still stored (`ipfsHashBytes`); nothing is
  fetched or parsed, so there is no `ParsedRequest` / `ParsedDelivery`.
- **No legacy AgentMech path.** These chains only ever had the marketplace.

Everything else — entity and field names, counter semantics, the
double-count guards, the fee → USD conversion — is the subgraph's, so a
consumer that reads the marketplace subgraph reads this the same way modulo
the query dialect (see [MIGRATION.md](MIGRATION.md)).

## How it works

Three processes, one codebase:

1. **Processor** (`node lib/main.js`) — downloads blockchain events from the
   SQD Portal (or, without a portal key, straight from the chain's JSON-RPC —
   see "Where blocks come from"), runs the handler code in `src/`, writes
   results to PostgreSQL. It saves its position (a "checkpoint") in the database after
   every batch, so it can be stopped and restarted at any time and continues
   where it stopped.
2. **GraphQL API** (`npx squid-graphql-server`) — reads the same PostgreSQL
   and answers queries. It has no state of its own.
3. **Migration job** (`npx squid-typeorm-migration apply`) — creates or
   updates the database tables. Runs once before the processor starts, and
   again after every schema change.

Key files:

| Path | What it is |
|---|---|
| `schema.graphql` | the data model — entities and their fields (header lists every delta from the subgraph schema) |
| `src/model/` | TypeScript classes generated from `schema.graphql` (do not edit by hand) |
| `src/abi/` | event decoders generated from the shared [`abis/`](../../abis) (do not edit by hand) |
| `src/constants.ts` | per-chain addresses, start blocks, mech factory table; `MARKETPLACE_CHAIN` selects the chain |
| `src/processor.ts` | which contracts and events to index, from which blocks; the portal / RPC source switch |
| `src/main.ts` | decode-and-dispatch: routes each event to its handler |
| `src/handlers.ts` | what each event does to the data — the subgraph's handlers, branch for branch |
| `src/logic.ts` | the pure half — ids, tx classification, factory tables. Unit-tested |
| `src/fee.ts` | fee unit → USD over the shared price source (native via Chainlink, USDC 1:1) |
| `src/rpc.ts` | wires the shared RPC client + Chainlink source (`latestRoundData` pinned to the event's block) |
| [`../_shared`](../_shared) | `@olas/squid-shared`: chain selection, RPC with fallback, Chainlink reader, entity cache. Build it first: `cd ../_shared && npm ci && npm run build` |
| `src/entityCache.ts` | read-through cache, FK-ordered writes |
| `db/migrations/` | generated SQL that creates the database tables |
| `squid.yaml` | SQD deployment description |

## Robinhood Chain (4663)

| Contract | Address | Deployed at block |
|---|---|---|
| ServiceRegistryL2 | `0xE3607b00E75f6405248323A9417ff6b39B244b50` | 58 564 789 (= start block) |
| ComplementaryServiceMetadata | `0xD1155408D58293BE0743225bcDe28b9FD0C12378` | 58 624 621 |
| KarmaProxy | `0x63C2c53c09dE534Dd3bc0b7771bf976070936bAC` | 59 575 473 |
| MechMarketplaceProxy | `0xa45E64d13A30a51b91ae0eb182e88a40e9b18eD8` | 59 578 054 |
| MechFactoryFixedPriceNative | `0x04b0007b2aFb398015B76e5f22993a1fddF83644` | 59 579 034 |
| MechFactoryFixedPriceTokenUSDC | `0x7Fd1F4b764fA41d19fe3f63C85d12bf64d2bbf68` | 59 579 676 |
| Chainlink ETH / USD | `0x78F3556b67E17Df817D51Ef5a990cDaF09E8d3A9` | — (8 decimals, 24h heartbeat) |

Sources: [autonolas-marketplace #197](https://github.com/valory-xyz/autonolas-marketplace/pull/197)
(marketplace contracts), `autonolas-registries` `globals_robinhood_mainnet.json`
(registry, metadata), Chainlink's `feeds-robinhood-mainnet.json`.

Three chain facts that shape the config:

- **No OLAS leg, no NVM legs.** The chain launched after the OLAS payment
  wind-down, so it has native (ETH) and "USDC" — which is **USDG**
  (`0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168`, 6 decimals), the chain's
  stablecoin; there is no canonical USDC on 4663 — only.
- **The USDG factory emits `CreateMechFixedPriceToken`**, not the
  `...TokenUSDC` name the other chains' USDC factories emit (it is a
  `MechFactoryFixedPriceTokenUSDC` deployment; verified against the forge
  artifact). It is registered on-chain under the `FixedPriceTokenUSDC`
  payment type. `src/constants.ts` records both.
- **The official RPC is pruned** (state for roughly the last few minutes).
  See `RPC_HTTP` below.

## Base (8453)

Replaces the Base marketplace subgraph (`../../subgraphs/marketplace/subgraph.base.yaml`),
so every address, start block and conversion is that manifest's and
`src/marketplace/{constants,fee-utils}.ts`'s. Consumers must get the same
numbers from both; the parity check is in the quest's `parity-plan.md`.

Deploying this squid does not switch anything. It runs at its own URL while
the Base subgraph stays live. Moving the frontend and the other consumers
onto it is a separate follow-up, done only after the parity check passes and
the frontend routing is updated.

| Contract | Address | From block |
|---|---|---|
| ServiceRegistryL2 | `0x3C1fF68f5aa342D296d4DEe4Bb1cACCA912D95fE` | 10 827 380 (= start block) |
| MechMarketplace (proxy) | `0xf24eE42edA0fc9b33B7D41B06Ee8ccD2Ef7C5020` | 26 642 705; **V1 ABI to 33 907 400, V2 from 33 907 401** |
| Karma | `0x1f84F8F70dE0651C2d51Bf8850FE9D0289Ba3B3A` | 26 642 705 |
| ComplementaryServiceMetadata | `0x28C1edC7CEd549F7f80B732fDC19f0370160707d` | 31 728 383 |
| 5 mech factories (FixedPrice Native / Token / TokenUSDC, NvmSubscription Native / TokenUSDC) | see `src/constants.ts` | 26 642 705 |
| Chainlink ETH / USD | `0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70` | 8 decimals |

What differs from Robinhood:

- **Two marketplace ABIs.** V1 `MarketplaceRequest` has no `requestDatas`
  and V1 `Deliver` has one `data` field (both different topic0s); V1
  `MarketplaceDelivery` indexes `requesters`, which keeps V2's topic0 but
  adds a topic. The subscription and the decoder (`decode.ts`) both switch
  at the block, like the subgraph's two data sources.
- **All four fee units.** `NATIVE` via Chainlink; `USDC` 1:1; `CREDITS`
  (both NVM factories) = credits × 0.99 / 1e6
  (`calculateBaseNvmCreditsToUsd`); `TOKEN` (OLAS) from the
  OLAS/USDC Balancer pool `0x5332…7E69` at the event's block.
- **`MaxDeliveryRateUpdated` is indexed.** The Base squid follows the
  marketplace subgraph and updates `Mech.maxDeliveryRate` and its USD value
  even when a signed-only mech has no mech-side on-chain delivery.
- **Historical updates require a full replay on Base.** The new subscription
  only sees past `MaxDeliveryRateUpdated` events when the squid is fully
  reindexed. Restarting from the old checkpoint does not backfill events that
  the previous processor did not subscribe to. Use blue-green reindexing and
  switch after catch-up and reconciliation.
- **Graph-node arithmetic.** Every USD step and running total is rounded to
  34 significant digits, half-up, as graph-node's `BigDecimal` is, so USD
  values are equal to the subgraph's rather than merely close.
- **Ingest from the portal** (`INGEST_SOURCE=portal`; `base-mainnet` is
  public, production uses the private portal + key). RPC ingestion cannot
  serve the address-less mech subscription on public Base RPCs.
  `RPC_HTTP` must be **archive** (`https://mainnet.base.org` is): a price read
  that falls back to `latest` no longer matches the subgraph.

## Environment variables

| Var | What |
|---|---|
| `DB_HOST` `DB_PORT` `DB_NAME` `DB_USER` `DB_PASS` | PostgreSQL connection |
| `MARKETPLACE_CHAIN` | which `CHAINS` entry to index: `robinhood` (default) or `base` |
| `INGEST_SOURCE` | `portal` or `rpc` — where blocks come from. Unset: `portal` when `SQD_PORTAL_API_KEY` is set, `rpc` otherwise. See below |
| `SQD_PORTAL_URL` | SQD Portal dataset URL; in portal mode it must name the chain's dataset or the processor refuses to start. **`robinhood-mainnet` is a private portal dataset** — the public portal answers 404 for it, so this and the key below come from the infra secret |
| `SQD_PORTAL_API_KEY` | key for the private portal (secret, sent as the `x-api-key` header) |
| `RPC_HTTP` | JSON-RPC endpoint. Always used for the Chainlink read behind fee → USD conversion (a handful of calls per mech request); also the ingestion source when `INGEST_SOURCE=rpc`. Archive-capable preferred, see below |
| `RPC_HTTP_FALLBACK` | optional second endpoint for the Chainlink read, tried when the primary fails with a non-revert error |
| `RPC_RATE_LIMIT` | optional requests/second cap for RPC ingestion (public endpoints return 429 under a backfill) |
| `GQL_PORT` | GraphQL server port. Always set it to 4350 — the server's built-in default is a different port |
| `PROMETHEUS_PORT` | processor metrics port. If unset, a random port is used |

### Where blocks come from

Two interchangeable sources build the same query (`LOG_QUERIES` in
`src/processor.ts`) and yield identically shaped blocks:

- **Portal** (`INGEST_SOURCE=portal`, the default once a key is set): the
  SQD Network dataset `robinhood-mainnet`. Fast — a full backfill is
  minutes — but **private**: the public portal answers 404, so it needs the
  private portal URL + key from infra (the same credentials the sibling
  squids use in production; whether they cover this dataset is an SQD
  account question, not a code one).
- **RPC** (`INGEST_SOURCE=rpc`, the default without a key): the chain's
  JSON-RPC through SQD's `EvmRpcDataSourceBuilder`. Works with nothing but
  an endpoint, including the official pruned one (ingestion needs block
  bodies and logs, not state). Every block is fetched with its
  transactions, so a backfill over the ~1.5M-block range is hours, not
  minutes — measured ~50 blocks/sec (≈ 8–9 h end to end) against the
  archive gateway, with no validation warnings — and a public endpoint will
  want `RPC_RATE_LIMIT`. At the head of this quiet chain it is entirely
  adequate. Block hash and logs bloom are verified; finality follows the
  node's `finalized` tag.

The checkpoint is source-agnostic: you can backfill over RPC and switch to
the portal later (or the reverse) without a re-index.

### About `RPC_HTTP` and fee conversion

Fees are converted at the price **of the event's block**, as graph-node did,
so a backfill reproduces what the subgraph would have computed. That needs
a node that can serve historical state. When the pinned read fails with a
non-revert error (pruned state, hole, rate limit) the processor tries
`RPC_HTTP_FALLBACK` at the same block, then the primary at `latest`, and
logs once per block that it did — the figure becomes "price at indexing
time" instead of "price at the event". It never stalls and never writes $0
for a transport problem; only a genuine revert / no-feed converts to $0
(the subgraph's `.reverted` branch). A one-line probe at startup says which
kind of node you have.

- `https://rpc-gate.autonolas.tech/robinhood-rpc/` — archive-capable
  (Valory's gateway). Use it for anything that is not a smoke test.
- `https://rpc.mainnet.chain.robinhood.com` — official, pruned. Fine at
  the chain head, which is all a fresh chain with no history needs.

USD totals are, as in the subgraph, approximate lower bounds; raw amounts
are always kept (`Request.feeRaw`, `DeliverForMarketplace.deliveryRate`).

## Run it locally

```bash
cp .env.example .env       # works as-is: no portal key -> ingests over RPC
docker compose up -d       # starts PostgreSQL on port 23801
npm ci                     # install dependencies
npm run build              # compile TypeScript to lib/
npx squid-typeorm-migration apply   # create the database tables
node lib/main.js           # start the processor
npx squid-graphql-server   # start the API on :4350 (separate terminal)
```

The processor prints progress lines (`rate: N blocks/sec, eta: ...`). The
Robinhood range is ~1.5M mostly-empty blocks from the registry deployment
to head; the backfill is a matter of minutes on the private portal and of
hours over RPC (set `RPC_HTTP` to the archive gateway for that).
Stopping it (Ctrl-C, crash, reboot) is always safe — restart it and it
continues from the checkpoint.

Node 24 is required (see [`.nvmrc`](../../.nvmrc)).

## Production

One Docker image (`../Dockerfile`, built from the repo root with
`--build-arg SQUID=<this folder>`), three workloads — full example in
`deploy/k8s-example.yaml`. Strict rules:

- **Run exactly one processor.** Never two. Two processors writing to one
  database corrupt the checkpoint. In Kubernetes: 1 replica, `Recreate`
  strategy (never `RollingUpdate`, which briefly runs two).
- The API can run with any number of replicas.
- Run the migration job before the first processor start and after every
  change to `db/migrations/`.
- Killing or restarting the processor is always safe.
- Sizing: 0.5–1 CPU; the history is small.

Image: `build-squid-image.yaml` (Actions → "Build Squid Image", `squid` =
`marketplace`, `version` = `vX.Y.Z`, from `main`).

## Making changes

First, two facts that decide everything below:

- Data the processor already wrote is **not** recalculated when you change
  code. New code only applies to new blocks.
- A full re-index from zero is minutes here. It is the normal, cheap
  operation — when in doubt, re-index.

### Fixing issues that only affect future blocks

1. `npm run build`
2. Deploy / restart the processor.

It continues from the checkpoint. Nothing else needed.

### Fixing issues that impacted already-indexed data

Restarting does not repair wrong rows. Do a **blue-green re-index**: deploy
the fixed code as a second squid with a fresh database, let it re-index
from zero, check the data, point the API at the new database, delete the
old one. The old squid keeps serving queries the whole time.

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
real foreign keys; graph-node did not. The module asserts the list is
exhaustive at load, so forgetting is a startup error, not silent data loss.

### Adding a mech factory (the checklist that matters)

The subgraph's CLAUDE.md lists three files to touch per factory. Here it
is **one table entry** in `src/constants.ts` (`CHAINS.<chain>.mechFactories`):
address, the event name it emits, payment type hash, fee unit, kind, start
block. That entry feeds the processor's address filter, the payment type
lookup and the fee unit lookup at once.

Do it **before** the first mech is created from the new factory. If you
don't: the marketplace `CreateMech` for that mech throws
`Unknown mech factory` and the processor crash-loops on that block until
the table is fixed — deliberately, the same fatal-halt policy as the
subgraph, because every later event of that mech would otherwise be
misattributed. A factory that emits an event other than the two already
listed (`CreateMechFixedPriceNative`, `CreateMechFixedPriceToken`) also
needs its ABI in [`abis/`](../../abis), the `typegen` script, and a topic in
`src/processor.ts` / `src/main.ts` — the NVM factories, if they ever come.

### Indexing a new contract or event

1. Put the contract's ABI JSON into the shared [`abis/`](../../abis) folder.
2. Add the file to the `typegen` script list in `package.json`, then
   `npm run typegen` — regenerates `src/abi/`.
3. Add the contract address + event to `src/processor.ts` (`addLog`).
4. Write the handler in `src/handlers.ts` and dispatch it in `src/main.ts`.
5. Old blocks contain events of the new contract too — so this normally
   ends with a blue-green re-index.

If you subscribe **without** an address filter (as the mech events are),
route the decode through `decodeForeign` in `src/main.ts` and have the
handler return early for unknown emitters. Indexed-ness is not part of an
event signature, so unrelated contracts can emit the same topic0 with a
different topic count; the raw decoder throws on those and kills the batch.

### Bringing up another chain

Add a `CHAINS` entry in `src/constants.ts` (addresses lowercase, deployment
blocks, factories, the Chainlink feed or `null`), set `MARKETPLACE_CHAIN`
and deploy against a fresh database. A squid deployment is one chain.
Nothing else in the code is chain-specific. TOKEN (OLAS) needs an
`olasPool` and CREDITS an `nvmCredits` entry, or they convert to $0 with a
warning; a chain with a V1 marketplace range sets `mechMarketplaceV1EndBlock`.

### Re-indexing from a specific block

Not supported, for the same two reasons as the sibling squids: the
handlers keep running totals (`Global`, `Sender`, `Mech`, `Service`
counters), so reprocessing a block double-counts it; and they depend on
state built from earlier blocks (`CreateMech`, `CreateMultisigWithAgents`
lookups), so a later start silently drops data. Either continue forward
from the checkpoint, or re-index everything from zero. Never edit
`squid_processor.status` by hand.

## Query semantics (unchanged from the subgraph)

| Field | Meaning |
|---|---|
| `Service.totalRequests` | requests made **BY** the service's multisig (demand side) |
| `Service.totalDeliveries` | on-chain deliveries made **BY** the service's mech (supply side). Not incremented by off-chain signed batches |
| `requests(where: {service: {id_eq: X}})` | requests **TO** service X's mech |
| `Sender.totalLegacyRequests` | misnomer kept: all-time requests by this sender across on-chain and off-chain paths |
| `Sender.totalMarketplaceRequests` | +1 per on-chain marketplace batch event |
| `Mech.totalDeliveriesTransactions` | delivered item count on the delivery mech, both on-chain and signed paths |
| `Global.totalMarketplace*` | count **events** (one per batch); `Global.totalRequests` / `totalDeliveries` count items |
| `Mech.maxDeliveryRate` / `maxDeliveryRateUSD` | latest advertised maximum and its USD conversion; not the charge for a specific request |
| `Request.feeRaw` / `feeUSD` | advertised-rate snapshot at request time; may be an upper bound, not actual spend |
| `Request.finalFeeUSD` | actual USD charge for on-chain marketplace Requests whose priority mech had a fee unit recorded at request time; signed-only deliveries create no Request entity, so they are excluded from fee totals and their raw actual charge is on `DeliverForMarketplace.deliveryRate` |
| `IndexerStatus` (id `"1"`) | last indexed block number + timestamp, for stale-data checks |

Before a chain's cap-and-actual contract upgrade, the advertised maximum and
actual charge are expected to match. After the first variable-price settlement,
they can differ. Record the upgrade and first variable-price settlement block
per chain before comparing historical and new fee reports.

`Mech.id` is the **serviceId**, not the mech address; `CreateMech` (id =
mech address) is the address → serviceId lookup. `Mech.karma` can go
negative.

## Tests

```bash
npm test
```

vitest, no database. `tests/handlers.test.ts` drives the handlers against
an in-memory cache through the scenarios the subgraph's Matchstick suite
covers (registry lifecycle, factory → CreateMech hand-off, on-chain
request/delivery with the fee write-once guard, direct-to-mech path,
off-chain signed batches, karma, foreign emitters). `tests/entityCache.test.ts`
runs the real `EntityCache` against a store fake that, like TypeORM, returns
rows without relations. `tests/rpc.test.ts` covers the Chainlink fallback
chain with viem stubbed. `tests/schema.test.ts` asserts no scalar shares a
column with a relation. `tests/fee.test.ts`, `tests/logic.test.ts` and
`tests/decode.test.ts` cover the pure parts. `tests/base.test.ts` covers
Base: chain table, V1/V2 split, subscriptions, the four fee units in
graph-node arithmetic (against live Base subgraph values) and an NVM-USDC
request end to end.

## Migration from the subgraph

There is no marketplace subgraph on Robinhood to cut over from — this is
the first indexer for the chain. On Base, consumers switch only after the
parity check against the Base subgraph passes. Consumers coming from the subgraph on
other chains: [MIGRATION.md](MIGRATION.md) lists the schema deltas, the id
scheme and the OpenReader query dialect.
