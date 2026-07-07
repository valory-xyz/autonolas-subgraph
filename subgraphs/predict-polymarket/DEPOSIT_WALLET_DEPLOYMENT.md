# Polymarket DepositWallet (Path A) Deployment

The subgraph runs as a grafted deployment to attribute CLOB v2 trades — whose
`OrderFilled.maker` is a per-user Polymarket DepositWallet (DW) rather than the Olas
service Safe — back to the funding Safe. The DW → Safe link is recorded from the
just-in-time pUSD top-up (Safe → DW) that precedes each bet. See `CLAUDE.md` §5b
(DepositWallet Attribution) for the handler-level mechanism.

## Grafting

The manifest grafts onto the paused v1_1_1 base deployment
(`QmNUEbuDnozskYSzHQLHah2RUjKzvoj5Y4nS7nBEDxB1kE`) at block `86236542` — the exact paused
head of the base (`features: [grafting]` + a `graft:` block). Grafting must be at the head:
below it, prod's shared chain block cache has evicted the older block hashes around the graft
point, which aborts start with `store error: Unexpected null for non-null column`. The head's
hash is still recorded, so grafting at the head resolves.

## Constraints

- **The `pUSD` dataSource `startBlock` (86236542) must equal the graft block.** DepositWallet
  indexing is forward-only, so any future re-graft must stay at or below the earliest
  safe → DW top-up (first DW trade in prod: block `88031656`) — DW links recorded before a
  later graft point would be lost, silently dropping those wallets' trades.
- **`DepositWallet` must stay `immutable: false`.** An `immutable: true` entity makes
  graph-node's graft copy fail with the same `Unexpected null for non-null column` error (the
  immutable `block$` storage path).
- **`indexerHints: prune: 300`** — the deployment retains ~300 blocks of history, so
  block-pinned (time-travel) queries older than that are unsupported; validation scripts
  compare current state only.
