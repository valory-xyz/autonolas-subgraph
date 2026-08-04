# Migration from the graph-node subgraph

One-time notes for the cutover from [`subgraphs/predict-polymarket`](../../subgraphs/predict-polymarket)
to this squid. Irrelevant once the subgraph is retired.

> **Which side is newer — read this first.** This squid is ported from the
> **latest** subgraph code and contains all of its features
> (`dailyTradedSettled`, adapter payouts via `PositionsRedeemed`, v2 token
> derivation), plus one deliberate redesign: deposit wallets are linked from
> the wallet factory's `WalletDeployed` event instead of reading pUSD
> transfers. The **deployed** subgraph behind a public endpoint may be an
> older build that is missing those features. So when the compare script
> reports differences of the classes listed below, the missing data is on
> the deployed-subgraph side — it does not mean the squid is behind.

## Validating squid data against the subgraph

`scripts/compare-vs-subgraph.py <subgraph-graphql-url>` diffs this squid's
Postgres against a deployed subgraph. The two stores are usually at different
block heights, so it only compares data that is frozen on both sides:

1. **DailyProfitStatistic** rows for days fully elapsed on both sides —
   row ids (`<agent>_<dayTimestamp>`) match across stores, fields compared
   one by one. The field list adapts to the deployed subgraph's schema
   version automatically.
2. **TraderAgent identity** (id → serviceId), height-filtered.
3. **DepositWallet → agent links** — factory-derived here vs pUSD-heuristic
   in the subgraph. A *wrong link* on a shared wallet counts as a failure;
   wallets present on only one side are reported but expected (different
   methods, different heights).

Cumulative running totals are excluded by design — they cannot match across
different heights.

Requirements: the local squid Postgres container running (name override via
`PG_CONTAINER` env), plain python3, no packages.

## Interpreting known discrepancy classes

Old subgraph deployments (pre-May 2026 code) differ from this squid in ways
that are missing data on the subgraph side, not squid bugs:

- `totalPayout: subgraph=0, squid=N` — the deployment predates the
  collateral-adapter handlers, so post-cutover redemptions
  (`PositionsRedeemed`) are absent from it. Verifiable on-chain per tx.
- missing/lower bet counts on v2-only markets — the deployment predates the
  eth_call-based TokenRegistry derivation, so trades on markets without v1
  `TokenRegistered` events were dropped.
- no `DepositWallet` entity / `dailyTradedSettled` field — older schema.

Always compare against the newest deployed version of the subgraph.

## Cutover checklist

1. Production backfill complete (processor at chain head).
2. Compare script vs the newest subgraph deployment: agents + daily stats
   match; discrepancies limited to the known classes above.
3. DepositWallet links spot-check passes (shared wallets, same agent).
4. Consumers switched to the squid GraphQL endpoint (note: query dialect is
   OpenReader — filters look like `where: {id_eq: ...}`).
5. Grace period, then retire the graph-node deployment.
