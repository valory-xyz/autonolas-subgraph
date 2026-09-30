# Tokenomics squid

OLAS holder tracking on Robinhood Chain, ported from
`autonolas-subgraph-studio/subgraphs/tokenomics-l2` at verified main commit
`ab3ac860ada32aa16121c3637816cba3f8075f1b`.

It indexes OLAS `Transfer` events into the source's three entities:

| Entity | Meaning |
|---|---|
| `Token` | Token address, raw total supply (`balance`), number of positive-balance holders |
| `TokenHolder` | Holder address, token address, raw balance |
| `Transfer` | Sender, recipient, amount, block and transaction metadata |

Minting increases supply; burning decreases it. Ordinary transfers leave supply
unchanged. The zero address is excluded from holders. Zero-balance holder rows
remain queryable, but do not count toward `holderCount`. All amounts retain full
integer precision; divide OLAS raw units by 10^18 for display.

## Chain and source

`TOKENOMICS_CHAIN=robinhood` selects chain **4663**. The token address is
`0x092963938debd8013a2e545b3549f8a5ec0d2286`, from the
[registries deployment configuration](https://github.com/valory-xyz/autonolas-registries/blob/main/scripts/deployment/l2/globals_robinhood_mainnet.json).
Indexing begins at **56,201,065**, verified as the first bytecode block. The same
block emits a mint of **1 OLAS** to `0xeb2a22b27c7ad5eee424fd90b376c745e60f914e`.
The raw event is retained in `tests/fixtures/initial-mint.json`.

The config's `stakingTokenAddress` is a staking implementation, not the OLAS
ERC-20; this squid subscribes only to the OLAS token above. ABI generation uses
[`../../abis/OLAS.json`](../../abis/OLAS.json), shared with other indexers.

`INGEST_SOURCE=portal` uses the private Robinhood SQD dataset and requires
`SQD_PORTAL_URL` / `SQD_PORTAL_API_KEY`. `INGEST_SOURCE=rpc` ingests from `RPC_HTTP`.
Unset selects portal if a key exists, RPC otherwise. `RPC_RATE_LIMIT` optionally
limits ingestion requests per second. Indexing does **not** need contract-state
reads: balances are derived entirely from events. A full backfill does require
historical blocks/logs from the selected source.

## Run locally

Node 24 and Docker are required. Build the shared package first:

```sh
cd squids/_shared
npm ci
npm run build
cd ../tokenomics
cp .env.example .env
docker compose up -d
npm ci
npm run build
npm test
npm run migration:apply
npm run process
# Separate terminal, same directory:
npm run serve
```

PostgreSQL uses **23805**, independently of the staking database on 23804.
Set `GQL_PORT=4350` explicitly (use a different API port if running both locally).

Example GraphQL query for positive-balance holders:

```graphql
{
  tokens {
    id
    balance
    holderCount
  }
  tokenHolders(where: { balance_gt: "0" }, orderBy: balance_DESC, limit: 100) {
    id
    token
    balance
  }
}
```

Entity and field names mirror studio. SQD uses `where`, `orderBy`, `limit` query
arguments. IDs and address fields are lowercase hex strings; transfer IDs retain
graph-ts's transaction hash plus four-byte little-endian log index. Scalar
BigInts remain BigInts. One deployment tracks one token on one chain, so holder
IDs remain addresses, as in the source.

## Verification

The test suite covers mint/burn accounting, holder transitions, self-transfers,
zero-value transfers, large integers, event filtering, IDs and the real deployment
mint. Against an **empty migrated test database**, run:

```sh
npm run verify:persistence
```

This checks persisted balances and counts across separate batches and rolls all
fixtures back. To index a short real range, including the initial mint:

```sh
TOKENOMICS_TO_BLOCK=56201114 npm run process
npm run verify:api
VERIFY_BLOCK=56201114 npm run verify:chain
```

The API check starts and stops a temporary server on **4355**. The chain check
requires an archive-capable `RPC_HTTP` for historical `totalSupply()` and
`balanceOf()` reads and a stopped processor at the specified finalized block. It
compares supply, holder count, sum of balances, and each recorded holder balance.
This bounded check is not full-history validation. Remove `TOKENOMICS_TO_BLOCK`
to resume indexing from the saved checkpoint.

## Deployment and changes

Use the shared Dockerfile from the repository root:

```sh
docker build -f squids/Dockerfile --build-arg SQUID=tokenomics -t tokenomics-squid:local .
```

[deploy/k8s-example.yaml](deploy/k8s-example.yaml) defines migration, processor and
API workloads. Run migrations first, then exactly one processor per database,
with a `Recreate` rollout. API replicas can scale independently. Configure secrets
through infrastructure; private portal keys do not belong in the repository.

Generated models, ABI bindings, and SQL migrations are committed. Regenerate
with `npm run codegen` / `npm run typegen`; build before generating migrations.
The cache lives for one batch, so restart/reorg handling reloads database state.
Accounting changes affecting old blocks require a fresh database and full reindex;
never move the checkpoint backwards manually or start after the initial mint.

### Initial validation

The 13 tests pass after a clean dependency install. Migration application,
PostgreSQL persistence across batches, GraphQL queries, and checkpoint resume
passed. A real RPC run indexed blocks 56,201,065–56,201,114, including the initial
mint. At the final block, indexed supply (1 OLAS), holder count (1), and the
holder balance match historical contract reads. Full-history validation remains.

The RPC adapter uses the SDK’s optional `evm-normalization` and `evm-rpc` peers;
both are explicitly pinned so fresh installs and production images can load it.
