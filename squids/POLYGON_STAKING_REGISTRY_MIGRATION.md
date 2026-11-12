# Polygon staking and service-registry cutover

Replaces the two Polygon Studio deployments using the existing squids, including
wallet clearing (#170) and StakingToken v0.4 (#171). Base and Robinhood retain
their configuration. For source addresses, event semantics, schema differences
and build commands, see the [staking README](staking/README.md) and
[service-registry README](service-registry/README.md).

## Deploy and replay

Create separate Polygon workloads and fresh PostgreSQL databases using each
squid's `deploy/k8s-example.yaml`. Each database has one processor replica and
its own API; do not share databases or cursors with other chains or squids.

| Processor setting | staking | service-registry |
| --- | --- | --- |
| Chain selection | `STAKING_CHAIN=polygon` | `SERVICE_REGISTRY_CHAIN=polygon` |
| Portal dataset | `polygon-mainnet` | `polygon-mainnet` |
| Replay from block | 62,213,142 (factory) | 41,783,952 (registry); 82,500,133 (bridger) |
| RPC | Polygon archive `RPC_HTTP` required | No RPC required |

Use `SQD_PORTAL_URL=https://portal.sqd.dev/datasets/polygon-mainnet` and
`INGEST_SOURCE=portal` for staking. The public Portal is keyless; private
Portal overrides require `SQD_PORTAL_API_KEY`. Remove any environment left
pointing at Base/Robinhood and any `STAKING_TO_BLOCK` verification limit.

Staking's start is the retained Studio replay boundary, not factory deployment
(59,560,456): the factory nonce remained 1 through block 70M, as checked in
review #174, so no staking instances are skipped. Preserve registry's original
bridger boundary to replay historical authorization events.

Build each image, apply **all committed database migrations** before starting
its processor/API, then replay from these source boundaries. Staking includes
the v0.4 migration; Polygon configuration adds no further schema migration.
A graph-node cursor, graft or imported latest state cannot replace replay.

## Acceptance before consumer cutover

- Verify staking's archive RPC serves historical reads. Startup checks factory
  bytecode and `owner()` at the replay boundary; reads never fall back to latest.
- Let both processors catch up and verify throughput within the deployment's
  resources. Polygon Portal samples in review #174 were ~0.8 / 1.3 / 1.1 Safe
  execution logs/block at 45M / 70M / 96M; samples do not establish replay speed.
- Adapt consumer queries to SQD GraphQL using the READMEs, then compare APIs at
  a common indexed block: registry services, identities, wallets and Safe
  aggregates; staking stake/unstake/claim totals and per-service epoch history.
- Preserve staking history IDs, epoch numbers, timestamps and zero-reward rows,
  including baseline timestamps as adjacent interval boundaries.
  `totalEpochsParticipated` counts unique history rows including rebaselines,
  not reward-eligible intervals.

Switch endpoints only after these checks pass. Track deployment versions and
consumer switches in the internal deployment tracking document.
