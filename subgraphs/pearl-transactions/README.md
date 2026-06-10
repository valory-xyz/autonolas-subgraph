# pearl-transactions (Gnosis)

Pearl wallet transaction-history subgraph (VLOP-73) — Gnosis only, for the
self-hosted graph-node in this repo. Indexes every fund movement in/out of a
Pearl Master Safe and classifies it into wallet-history rows
(`MASTER_FUNDING_IN`, `MASTER_TO_AGENT`, `SERVICE_BOND_DEPOSIT`/`_REFUND`,
`STAKING_REWARD_CLAIM`, …).

Canonical multi-network source: **`autonolas-tokenomics-subgraph`** →
`subgraphs/pearl-transactions`. This folder is the Gnosis-only port for Olas's
own infra. See [`CLAUDE.md`](./CLAUDE.md) for details.

## Commands

```bash
yarn install
yarn codegen
yarn build        # subgraph.yaml (Gnosis)
yarn test         # Matchstick

# self-hosted deploy (graph-node from repo-root docker-compose.yaml)
yarn create-local
yarn deploy-local
```
