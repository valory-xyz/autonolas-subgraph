# Staking squid

Robinhood Chain staking indexer, ported from **autonolas-subgraph-studio main
`ab3ac860ada32aa16121c3637816cba3f8075f1b`** (PR #169). It tracks factory events,
dynamically discovered staking proxies, services, rewards by epoch, OLAS stake
and claimed-reward totals, and cumulative daily snapshots.

## Chain configuration

- Chain ID: **4663** (`STAKING_CHAIN=robinhood`).
- Factory: `0x1bd1505b711fb58c54ca3712e6bef47a133892d9`.
- Start block: **58,661,778**, first factory bytecode verified using archive RPC.
- OLAS token: `0x092963938debd8013a2e545b3549f8a5ec0d2286`.
- The deployment config's `stakingTokenAddress`, `0x87c511c8ae3faf0063b3f3cf9c6ab96c4aa5c60c`,
  is the **staking implementation**, not the ERC-20. It reports `VERSION() = 0.2.0`.

Addresses come from the [registries deployment configuration](https://github.com/valory-xyz/autonolas-registries/blob/main/scripts/deployment/l2/globals_robinhood_mainnet.json).
Factory `InstanceCreated` events discover instances; verifier/implementation addresses
are not independent event sources. New instances need no configuration change.

## Local development

Node 24 and Docker are required. From the repository root, first build the shared package:

```sh
cd squids/_shared
npm ci
npm run build
cd ../staking
cp .env.example .env
docker compose up -d
npm ci
npm run build
npm test
npm run migration:apply
npm run process
# separate terminal, same directory and .env:
npm run serve
```

PostgreSQL uses port **23804**. Set `GQL_PORT=4350` explicitly for the API.
The schema, generated models and ABI decoders, and initial migration are committed.
Type generation reads the repository’s shared [`abis/`](../../abis) directory,
including the `stakingManager()` getter introduced in studio main. Regenerate with `npm run codegen` and
`npm run typegen`; build before generating migrations.

## Ingestion and RPC

`INGEST_SOURCE=portal` uses the private `robinhood-mainnet` SQD dataset, configured
with `SQD_PORTAL_URL` and `SQD_PORTAL_API_KEY`. `INGEST_SOURCE=rpc` uses `RPC_HTTP`.
Unset selects portal if a key exists, RPC otherwise. The public dataset URL alone
does not grant access. `RPC_RATE_LIMIT` optionally caps ingestion requests/second.

**RPC_HTTP must support historical eth_call**, even with portal ingestion. The
processor reads configuration at instance creation and service deposits/bonds at
stake time. The example uses the Olas archive RPC. Genuine contract reverts use
the studio defaults; transport errors and unavailable historical state fail the
batch instead of replacing history with current state. There is no latest fallback.
An RPC that silently ignores block tags is unsuitable.

Proxy logs are subscribed by topic, then checked against factory-discovered
instances before decoding. Known malformed events fail the batch. Removal/status
changes are stored as events and do not stop tracking an instance, matching studio.
All caches are rebuilt each batch so retries and hot-block rollback reload canonical
state. Snapshot statistics load all services per batch; review memory usage if the
service population grows substantially.

## Migration behavior

The port preserves the source's accounting, including:

- Actual security deposit plus bonds per agent slot, with the logged minimum-stake
  fallback only when contract reads revert or are absent.
- Unstake subtracts the amount recorded at stake time.
- Forced unstake returns rewards to the pool and does not count a payout.
- OLAS-only earned/claimed totals and snapshot population/median.
- Epoch rollover, zero-reward histories and migrated-service filtering.
- Separate cumulative earned and paid-out totals, including claim-only days.

Pearl intentionally shows a continuous sequence of epochs, including zero-reward
entries after a service unstakes. Unstaking alone does not end that contract's
history: it continues until the service stakes in a different contract. Those
entries also count toward `totalEpochsParticipated`, matching studio. Do not remove
unstaked services from epoch rollover or treat a null `latestStakingContract` as a
reason to skip them.

Version gating also matches studio: absent VERSION, `0.1.0`, `0.2.0`, and externally
managed `0.3.0` instances are indexed. Other versions are recorded with
`eventsIndexed=false` and a warning. Supporting new event signatures requires an
explicit ABI/handler update; do not just remove the guard.

GraphQL retains entity/field names, with SQD query conventions (`where`, `orderBy`,
`limit`) instead of graph-node's. Addresses/bytes are lowercase hex strings; event
IDs retain graph-ts's transaction hash plus four-byte little-endian log index.
Daily IDs retain the UTF-8 timestamp hex encoding, and the Global singleton ID is
an empty string. BigInt **arrays** are decimal string arrays because SQD's model
generator does not support native BigInt arrays; scalar BigInt fields stay BigInt.
Missing service references in epoch history fail explicitly instead of creating
SQL rows with dangling foreign keys. Start from factory deployment with an empty DB.

## Verification and deployment

`npm test` covers accounting, epochs, foreign log filtering, same-batch discovery,
RPC failure handling and FK write order. With an empty migrated local database:

```sh
npm run verify:persistence
npm run verify:api
```

The persistence check verifies cross-batch PostgreSQL state and rolls all fixtures
back. The API check starts a temporary server on port 4354, queries it, then stops it.
For a bounded ingestion smoke test, set `STAKING_TO_BLOCK=58666777` when starting
the processor. It always starts at factory deployment; remove the upper bound to
continue from its saved checkpoint. A bounded run does not establish full-history
parity or current indexing completeness.

Use the shared `squids/Dockerfile` with `--build-arg SQUID=staking`. See
[deploy/k8s-example.yaml](deploy/k8s-example.yaml) for migration, processor and API
workloads. Run exactly **one processor** per database, using `Recreate` rollout.
The GraphQL API can scale independently. Secrets belong in infrastructure config.

Schema changes need a generated migration. Accounting changes affecting old data
need a fresh database and full reindex before switching the API. Never manually
rewind the processor checkpoint: handlers accumulate totals.

### Initial validation

Build, 17 regression tests, migration application, cross-batch PostgreSQL persistence,
GraphQL queries, and the shared Docker image build passed. A bounded RPC run reached
block 58,666,777 successfully; that early range had no indexed staking instances,
so lifecycle accounting was exercised with fixtures, not a full live-history replay.
The production dependency audit passed the high/critical gate (seven moderate
findings remain in the inherited dependency stack).

The RPC adapter's optional `evm-normalization` and `evm-rpc` peer dependencies
are explicitly pinned and covered by a source-import test for fresh installs.
