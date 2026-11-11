# Polygon staking and service-registry cutover

This ports the Polygon Studio deployments to the existing `squids/staking`
and `squids/service-registry` processors. It includes the protocol changes
merged in infra #170 (wallet clearing) and #171 (StakingToken v0.4).
Base and Robinhood retain their existing configuration. Other chains are
outside this migration.

## Sources and history

| Squid | Source | Address | First indexed block |
| --- | --- | --- | --- |
| staking | StakingFactory | `0x46c0d07f55d4f9b5eed2fc9680b5953e5fd7b461` | 62,213,142 |
| service-registry | ServiceRegistryL2 | `0xe3607b00e75f6405248323a9417ff6b39b244b50` | 41,783,952 |
| service-registry | IdentityRegistryBridger | `0x6f121552765424f0b2331b541c0938480ca314db` | 82,500,133 |

These are the addresses and ranges from Studio's
`subgraphs/staking/subgraph.matic.yaml`,
`subgraphs/service-registry/subgraph.matic.yaml` and their `networks.json` files.
Staking's OLAS token is `0xfef5d947472e72efbb2e388c730b7428406f2f95`
(Studio `shared/constants.ts`). Preserve the original bridger start block,
including the legacy authorization events before protocol upgrades.

Staking discovers proxies from factory events and reads their configuration at
creation. `VERSION() == "0.4.0"` selects the v0.4 event decoder. Legacy
interfaces and version guards remain active. No new implementation address or
guessed activation block is needed. Confirm final release ABI compatibility
before accepting new v0.4 deployments.

Registry wallet clearing follows emitted `AgentMultisigUpdated` events;
termination alone does not clear a wallet. Replacing a nonzero old multisig
clears its authorization; `AgentWalletSet` explicitly authorizes a wallet.
Service identity links and metadata are preserved. This needs no contract
version switch and handles both legacy and updated bridger emissions.

## Deploy two independent Polygon databases

Build the existing Docker image once per squid, from the repository root:

```sh
docker build -f squids/Dockerfile --build-arg SQUID=staking -t staking-polygon:VERSION .
docker build -f squids/Dockerfile --build-arg SQUID=service-registry -t registry-polygon:VERSION .
```

Use each squid's `deploy/k8s-example.yaml` as a template. Give the Polygon
workloads and database secrets distinct names. Each processor requires its own
fresh PostgreSQL database; neither shares a database/cursor with Base,
Robinhood or the other Polygon squid. One processor replica per database.

Staking processor environment:

```dotenv
STAKING_CHAIN=polygon
INGEST_SOURCE=portal
SQD_PORTAL_URL=https://portal.sqd.dev/datasets/polygon-mainnet
RPC_HTTP=https://rpc-gate.autonolas.tech/polygon-rpc/
RPC_RATE_LIMIT=10
```

Staking requires archive `eth_call` even with Portal ingestion. Startup checks
factory bytecode and `owner()` at the factory boundary; unavailable historical
state fails indexing rather than falling back to current state. `INGEST_SOURCE=rpc`
is also supported. Remove any `STAKING_TO_BLOCK` verification limit for production.

Registry processor environment:

```dotenv
SERVICE_REGISTRY_CHAIN=polygon
SQD_PORTAL_URL=https://portal.sqd.dev/datasets/polygon-mainnet
```

The registry processor reads logs only and does not need an RPC endpoint.
Both use the public Polygon Portal dataset keyless. For private Portal access,
set a URL naming `polygon-mainnet` and the processor's `SQD_PORTAL_API_KEY`.
Do not carry over another chain's dataset, RPC or database environment.

For each squid, apply **all committed database migrations** before starting
its processor/API (`npm run migration:apply`, then `npm run process` and
`npm run serve`, or the corresponding image commands). Staking includes the
additive v0.4 migration. No additional schema migration is introduced by the
Polygon chain configuration.

Replay from the source boundaries above and let each processor catch up.
A fresh replay reconstructs historical clearing and staking events. A graph-node
cursor, graft, or imported latest state cannot substitute for that replay.
Keep existing consumer endpoints until acceptance checks pass.

## Consumer acceptance before endpoint cutover

SQD GraphQL is not a drop-in graph-node endpoint. Update consumers to use
`where`, `limit`/`offset`, and `orderBy: field_ASC/field_DESC` instead of
`first`/`skip`, `orderDirection`, and graph-node filters. Addresses and hashes
are lowercase strings; BigInt arrays are decimal string arrays. Registry's
`ERC8004Agent.service` becomes the derived list `services`. See each squid's
README for schema details and ID encodings.

Compare the new APIs with the existing Polygon endpoints at a common indexed
block: service identities, multisigs and wallet authorization for registry;
stake/unstake/claim totals and per-service epoch history for staking. Check Safe
activity aggregates too. Registry's chain-wide Safe subscription must catch up
within the deployment's resources before consumers switch; the Base/Robinhood
throughput measurements do not establish Polygon throughput.

Preserve staking history IDs, on-chain epoch numbers, timestamps and ordinary
zero-reward rows. `totalEpochsParticipated` counts unique history rows including
rebaselines, not reward-eligible intervals. `isRebaseline` adds metadata without
removing or renumbering rows; retain its timestamp as an adjacent interval boundary.
Recipient arrays record actual v0.4 payouts, and unstake alone must not create a
second payout. Baseline checkpoints produce no claimable rewards or back-pay.

Pearl still needs its separate v0.4 consumer work: live eligibility reads from
the contract (`rebaselinePending` and `mapServiceIdBaselineMissing`),
baseline-aware history/streak presentation, and recipient-aware payout
reconciliation where applicable. Indexing does not replace those reads or
consumer acceptance. Switch consumer endpoints only after replay, API query
adaptation and these relevant release checks are complete.
