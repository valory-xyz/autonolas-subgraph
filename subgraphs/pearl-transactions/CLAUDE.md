# pearl-transactions (Gnosis — self-hosted port)

Funds-movement subgraph for Pearl **Master Safe / Agent Safe** accounts on
**Gnosis**. Powers the Pearl wallet transaction-history view (VLOP-73): every
fund movement in/out of the Master Safe, classified into wallet-history rows.

This is the **Gnosis-only, self-hosted-graph-node** port of the subgraph whose
canonical multi-network source lives in the **`autonolas-tokenomics-subgraph`**
repo (`subgraphs/pearl-transactions`). It was brought here to run on Olas's own
graph-node infra (`docker-compose.yaml`) as an alternative to The Graph
Studio/decentralized-network deployment (Studio Gnosis indexer kept hitting a
deterministic stall; the network deployment was uncurated/slow). Keep the
mapping logic in sync with the canonical source — fixes should land there first.

## Layout

- **`subgraph.yaml`** — single concrete Gnosis manifest (no template /
  `generate-manifests` here; this port is Gnosis-only). Addresses + start
  blocks are inlined from the canonical `networks.json` `gnosis` block.
- **`abis/`** — subgraph-local copies of the 6 ABIs the manifest references
  (`ServiceRegistryL2`, `ServiceRegistryTokenUtility`, `StakingFactory`,
  `StakingProxy`, `GnosisSafe`, `ERC20Detailed`) so the port is self-contained
  and doesn't depend on the shared root `abis/`.
- **`src/`** — handlers, copied verbatim from the canonical source:
  `service-registry.ts`, `service-registry-token-utility.ts`,
  `staking-factory.ts`, `staking-proxy.ts`, `erc20.ts`, `safe.ts`,
  `utils.ts`, `constants.ts`.
- **`tests/`** — Matchstick suites (`service-registry.test.ts`,
  `staking.test.ts`, `phase-2a.test.ts`).

## Data sources (Gnosis)

`ServiceRegistryL2` (`0x9338…755fD`), `ServiceRegistryTokenUtility`
(`0xa45E…18eD8`), `StakingFactory` (`0xb022…4700`) + `StakingProxy` template,
`OLAS` (`0xcE11…9d9f`), `WrappedNative` WXDAI (`0xe91D…a97d`), the two Gnosis
stablecoin Transfer sources (USDC `0xDDAf…7A83`, USDC.e `0x2a22…76F0`), and the
per-Safe `Safe` template (native receipts + owner-list upkeep).

## Key mechanisms

See the canonical `CLAUDE.md` in `autonolas-tokenomics-subgraph` for the full
writeup. The load-bearing pieces:
- **`classifyTransfer`** routes `(from, to)` into a `FundsCategory`. Registry
  dust → `OTHER` (hidden); Master Safe ↔ SRTU OLAS hops are dropped (deduped
  against the SEMANTIC bond row).
- **Bond attribution queue** — the SRTU handler is the producer (creates the
  `SERVICE_BOND_DEPOSIT`/`_REFUND` row + stamps `masterSafe`), the
  `ServiceRegistryL2` handler is the consumer (backfills `serviceId` +
  `bondType` + `agentSafe`). Hence `FundsMovement` is mutable.

## Develop & deploy (self-hosted)

```bash
cd subgraphs/pearl-transactions
yarn install
yarn codegen
yarn build            # uses subgraph.yaml (Gnosis)
yarn test             # Matchstick

# against the local graph-node from the repo-root docker-compose.yaml
docker compose up -d  # (from repo root) — graph-node has the gnosis RPC wired
yarn create-local
yarn deploy-local     # uploads to the node's IPFS (registry.autonolas.tech)
```

`deploy-local` points `--ipfs` at `https://registry.autonolas.tech` to match the
`ipfs:` the graph-node uses in `docker-compose.yaml` (the node must fetch from
the same IPFS the CLI uploads to). Adjust if your node uses a different IPFS.
