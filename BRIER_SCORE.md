# Brier Score — design doc

Status: predict-omen ✅ implemented; predict-polymarket ⏳ planning
Scope: `subgraphs/predict-omen`, `subgraphs/predict-polymarket`
Driver: Predict economy "Performance" card — replace OLAS Staking APR with **Brier Score**, with `7D / 30D / 90D / Max` windowing alongside ROI and Prediction Accuracy.

## Why this doc exists

The website wants per-window Brier Score as a third KPI on the predict-economy Performance card. Brier is a scoring rule for probabilistic forecasts:

```
brier = mean_i((p_i − actual_i)²)
```

where `p_i` is the predicted probability the bet's outcome will resolve true and `actual_i ∈ {0, 1}` (or 0.5 for invalid resolutions). Lower is better; 0 = perfect prediction, 0.25 = uniform 50/50, 1 = maximally wrong.

Neither predict subgraph indexed predicted probability before this work. This doc covers what shipped for Omen, what's still TODO for Polymarket, and the design decisions worth carrying across.

## predict-omen — shipped

### Schema additions

`Bet`:
```graphql
# Implied probability the market assigned to `outcomeIndex` at trade time, 1e18-scaled.
# Buy:  investmentAmount * 1e18 / outcomeTokensBought
# Sell: returnAmount      * 1e18 / outcomeTokensSold
# Required; zero is the sentinel for genuine zero-token degenerate trades
# (Brier aggregation filters out zero-probability bets).
impliedProbability: BigInt!
```

`DailyProfitStatistic`:
```graphql
# Brier-score accumulators for buys that settled on this day, 1e18-scaled.
# Per-bet contribution: ((impliedProbability - actual)^2) / 1e18, where actual is
# 1e18 if the bet's outcome won, 0 if it lost, or 5e17 for invalid resolutions.
# Sells and bets missing `impliedProbability` are excluded.
# Mean Brier over a window: sum(brierSum) / sum(brierCount) (1e18-scaled).
brierSum: BigInt!
brierCount: Int!
```

`MarketParticipant` (so re-answer can reverse exactly):
```graphql
# Required: pre-Brier participants read as zero (graph-node default for missing fields),
# which is exactly the correct reversal value — no historical Brier was credited.
brierSumApplied: BigInt!
brierCountApplied: Int!
```

### Where it's set

| Step | Handler | What happens |
|---|---|---|
| Trade | `handleBuy` / `handleSell` ([`src/FixedProductMarketMakerMapping.ts`](subgraphs/predict-omen/src/FixedProductMarketMakerMapping.ts)) | `bet.impliedProbability = computeImpliedProbability(amount, outcomeTokens)` |
| Fresh settlement | `handleLogNewAnswer` ([`src/realitio.ts`](subgraphs/predict-omen/src/realitio.ts)) | Iterate `participant.bets`, sum buy-side Brier vs winning outcome, credit `dailyStat.brierSum` + `brierCount` on settlement day; store `brierSumApplied`/`brierCountApplied` on participant |
| Re-answer | `handleLogNewAnswer` | Reverse stored `brierSumApplied`/`brierCountApplied` from previous answer's daily stat, recompute over current bets vs new outcome, credit new day, update stored values |

Bet-iteration uses the existing `participant.bets` array (stored, not derived) so it's pruning-resilient and shares its loop with the existing `countedInProfit`/`countedInTotal` marking pass — one entity load per bet.

### Design decisions

1. **Settlement-day attribution.** Brier lands on the day the oracle resolves the market, matching how `dailyProfit` is attributed. "7D Brier" = average Brier of buys settled in the last 7 days. The website's window sum becomes `sum(brierSum) / sum(brierCount)`, units cancel.
2. **Sells excluded.** A sell reduces a position; treating it as a "prediction against the outcome" conflates rebalancing with conviction. Sells still get an `impliedProbability` stored for analytics, but `bet.amount.lt(0)` is filtered out at aggregation time.
3. **Invalid resolutions use `actual = 0.5` (5e17).** Mirrors the on-chain `[1, 1]` payout split. Sells still excluded.
4. **1e18 fixed-point everywhere.** Consistent with the codebase rule "All financial fields are BigInt — no BigDecimal anywhere." `impliedProbability` is in `[0, 1e18]`; per-bet Brier contribution is computed as `(p − actual)² / 1e18`, also `[0, 1e18]`, so the daily sum stays in the same scale and is naturally summable across days.
5. **`brierSumApplied` on `MarketParticipant`.** Mirrors how `expectedPayout` enables `dailyProfit` reversal on re-answer. Stores exactly what was credited so the in-between-bets case (bet placed between answer A and re-answer B) reverses correctly without double-counting.
6. **Buys with zero outcome tokens.** `impliedProbability` stays `null` (defensive — should not happen for valid FPMM trades). Brier aggregation skips these.

### How a consumer computes a windowed Brier

```graphql
{
  dailyProfitStatistics(
    where: {
      traderAgent: "0x...",
      date_gte: $sevenDaysAgo
    }
  ) {
    brierSum
    brierCount
  }
}
```

```ts
const sum  = days.reduce((s, d) => s + BigInt(d.brierSum), 0n);
const cnt  = days.reduce((s, d) => s + d.brierCount, 0);
const brier = cnt === 0 ? null : Number(sum * 10000n / BigInt(cnt) / 10n ** 18n) / 10000;
//                              ↑ keep 4 decimals of precision before downcasting to JS number
```

### Backfill

**Re-index the entire subgraph from the start block on deploy.** `impliedProbability` is computed from event params at trade time and `brierSum` / `brierCount` are populated at settlement — there's no way to retroactively fill them on existing entities without replaying the events. A full re-index ensures every historical bet contributes to windowed Brier from day one.

This re-index is shared with the market-categories work in [MARKET_CATEGORIES.md](MARKET_CATEGORIES.md) — both features land in the same deploy and are backfilled together in a single pass from the start block. No separate migration handler is needed.

### Tests

`tests/brier-score.test.ts` — 7 cases:
- Buy / Sell record `impliedProbability` correctly
- Zero-token degenerate trade stores `impliedProbability = 0` and is skipped at Brier aggregation
- Winning + losing bets sum into `brierSum` with correct count
- Sells excluded from Brier
- Invalid answer uses 0.5 actual for both outcomes
- Re-answer reverses old contribution, applies new on the new settlement day

## predict-polymarket — planning (not yet implemented)

Polymarket's accounting differs enough that this is its own design problem, not a copy-paste.

### Where the implied probability lives on Polymarket

Polymarket uses a **CTF Exchange order book + NegRiskAdapter**, not an FPMM. Tracked event is `OrderFilled` (`subgraphs/predict-polymarket/src/uma-mapping.ts`). The agent is always the **maker**; trade direction is inferred from asset flow:

```
maker gives USDC → agent BUYs outcome tokens   → impliedProb = USDC out / tokens in
maker gives tokens → agent SELLs outcome tokens → impliedProb = USDC in  / tokens out
```

Both sides have the price implied by the fill ratio. USDC is 6 decimals; outcome tokens are 6 decimals (confirm with current code). Scale to 1e18 for storage to match Omen.

### Resolution outcome

Polymarket resolution fires via UMA `OptimisticOracleV3` (see `handleAssertionResolved` or whichever Polymarket settlement handler exists). For each settled `MarketParticipant`:

- Winning outcome index → `actual = 1e18` for bets on that index, `0` otherwise.
- No "invalid" case to handle (per `predict-polymarket` CLAUDE.md: "**No re-answer logic** — Polymarket resolutions are final.").

### Schema additions (proposed — mirror Omen)

```graphql
# subgraphs/predict-polymarket/schema.graphql

type Bet @entity(immutable: true) {  # NB: immutable on Polymarket
  ...
  impliedProbability: BigInt  # 1e18-scaled, nullable
}

type DailyAgentPerformance @entity(immutable: false) {  # or equivalent
  ...
  brierSum: BigInt!
  brierCount: Int!
}
```

`MarketParticipant.brierSumApplied`/`brierCountApplied` are **not needed** on Polymarket because resolutions are final — no reversal path.

### Mapping changes

| File | Change |
|---|---|
| `src/ctf-exchange-mapping.ts` (or wherever `OrderFilled` lands) | After deriving buy/sell + maker amounts, set `bet.impliedProbability = (USDC * 1e18) / outcomeTokenAmount` |
| Whichever handler fires at UMA resolution (the equivalent of `handleLogNewAnswer`) | For each settled `MarketParticipant`, sum buy-side Brier across `participant.bets` and credit settlement-day's daily stat |

### Differences worth flagging

- **Bets are immutable** on Polymarket — can't add `countedInProfit`/etc. flags retroactively. Brier is purely additive on settlement day.
- **No re-answer** — drop the `brierSumApplied`/`brierCountApplied` participant fields, keep schema lean.
- **Agent gating** — only agent ID 86 is tracked (see polymarket CLAUDE.md). Same gate applies to Brier — the iteration is over already-gated `MarketParticipant`s, so no extra work.
- **NegRisk markets** — multi-outcome (n > 2). Brier generalises: `actual = 1e18` for the winning outcome index, `0` for all others. Each bet still contributes one term. If NegRisk markets are in scope, double-check that `bet.outcomeIndex` covers the full outcome set and not just the binary-collapsed view.

### Effort estimate

| Step | Effort |
|---|---|
| Schema additions + codegen | ~1 hour |
| Mapping changes (set on fill, accumulate at resolve) | ~3-4 hours |
| Tests (Matchstick) | ~2-3 hours |
| Backfill decision (re-index vs accept gap) | TBD |

**Total**: ~1 day implementation. Compare with Omen which took similar time once design was set.

## Open questions for both subgraphs

1. **Window edges**: should the website also surface raw `(brierSum, brierCount)` per day so the frontend can render a Brier time series, or only the rolled-up windowed average? Storing per-day is free (already there); decide on the API shape.
2. **Display formatting**: Brier ∈ [0, 1], typical "good" predict-market values land around 0.20-0.25. Format as `0.23` (2 dp) or as a percentage / quality score (`Brier 0.23 → quality 77%`)? UX decision, not subgraph.
3. **Score interpretation popover**: Brier is unintuitive ("lower is better, baseline ~0.25"). Worth a small info tooltip on the metric card. UX, not subgraph.
4. **Sells: include or exclude?** Currently excluded on Omen. If a future use case needs "every trade is a prediction" Brier, we can add a second metric (`brierSumAllTrades`) without breaking the buy-only one. Keep the door open in the schema if there's appetite.
