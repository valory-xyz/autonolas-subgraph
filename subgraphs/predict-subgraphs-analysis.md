# Predict Subgraphs Analysis

Analysis of `predict-omen` and `predict-polymarket` subgraph logic, correctness, and gaps.

---

## predict-omen

### 1. No Agent ID Filtering (High Priority) — FIXED

**Files changed**: `src/service-registry-l-2.ts`, `src/constants.ts`, `schema.graphql`, `subgraph.yaml`

Previously, `handleCreateMultisigWithAgents` created a `TraderAgent` for **every** service that creates a multisig — no agent ID check. Non-prediction agents trading on whitelisted markets would be counted.

**Fix**: Added two-step `RegisterInstance` + `TraderService` filtering pattern (matching polymarket). Added `PREDICT_AGENT_IDS = [14, 25]` constant (both Valory trader agent IDs on Gnosis, per https://olas.network/data). Only services with the correct agent ID create `TraderAgent` entities.

**Tests added**: `tests/service-registry-l-2.test.ts` (11 tests) — covers agent ID filtering, duplicate prevention, wrong agent ID rejection, Global tracking.

---

### 2. Event Ordering Race Condition (Medium Priority) — NOT AN ISSUE

**File changed**: `src/conditional-tokens.ts` (comment only)

`handleConditionPreparation` only saves if a `Question` already exists for the `questionId`. Initially flagged as a race condition (condition dropped if `ConditionPreparation` fired before `LogNewQuestion`), but the ordering is guaranteed: `LogNewQuestion` always fires before `ConditionPreparation` (the `questionId` comes from Reality.eth), which in turn precedes `FixedProductMarketMakerCreation`.

**Resolution**: Kept the original Question-existence guard — saving unconditionally would store a `ConditionPreparation` for every CTF condition ever prepared on Gnosis (unnecessary DB load). Added a comment in the handler documenting the ordering guarantee.

**Tests added**: `tests/conditional-tokens.test.ts` (3 tests) — covers skipping unknown questions, saving with known Question, block metadata.

---

### 3. Dead Code / Schema Bloat (Low Priority) — FIXED

**Files changed**: `src/realitio.ts`, `schema.graphql`

**Removed orphaned handlers** from `realitio.ts`:
- `handleLogAnswerReveal`
- `handleLogNotifyOfArbitrationRequest`
- `handleLogFinalize`

**Removed unused entity types** from `schema.graphql`:
- `LogNewAnswer`
- `LogSetQuestionFee`
- `LogNewTemplate`
- `QuestionFinalized`
- `LogNotifyOfArbitrationRequest`

Also removed unused imports (`LogAnswerRevealEvent`, `LogNotifyOfArbitrationRequestEvent`, `LogFinalizeEvent`, `QuestionFinalized`, `LogNotifyOfArbitrationRequest`).

---

### 4. `handleLogFinalize` Overwrites Without Loading (Low Priority) — FIXED

Resolved as part of fix #3 — the handler was removed entirely along with the other orphaned handlers.

---

## predict-polymarket

### 5. `Bet.question` Can Be Null (Low Priority) — FIXED

**File changed**: `src/ctf-exchange.ts`

If `OrderFilled` fires before `QuestionInitialized`, the bet won't link to a question. Settlement still works via `MarketParticipant`, but queries on `question.bets` would miss these bets.

**Fix**: Added `log.warning()` when question is not found at bet creation time for debugging visibility.

---

### 6. `QuestionResolution` Duplicate Risk (Low Priority) — FIXED

**File changed**: `src/utils.ts`

`processMarketResolution` created `new QuestionResolution(conditionId)` without checking existence. If resolved twice, the second create would fail on the immutable entity.

**Fix**: Added `QuestionResolution.load()` check — returns early if already resolved.

**Tests added**: `tests/profit.test.ts` — "Duplicate resolution: second QuestionResolved is a no-op" test.

---

### 7. Global Saved Unnecessarily (Low Priority) — FIXED

**File changed**: `src/utils.ts`

`processMarketResolution` always called `global.save()` even when no participants were processed.

**Fix**: `global.save()` now only fires when at least one delta is non-zero (i.e., at least one participant was processed).

**Tests added**: `tests/profit.test.ts` — "Resolution with no participants: global settled totals unchanged" test.

---

## Both Subgraphs: Logic Correctness

### Core settlement logic is sound
- Both correctly implement two-tier accounting (`totalTraded` immediate, `totalTradedSettled` at resolution)
- Both correctly separate profit calculation (at settlement) from payout tracking (at redemption)
- Invalid answer handling (`[1,1]` split = `balance/2`) is correct in both
- Sell bets with negative amounts/shares are tracked correctly
- Idempotency via `participant.settled` flag works as intended

### predict-omen re-answer logic is correct
- Full market cost for re-answers (`newExpectedPayout - totalTraded - totalFees`) ensures correct chaining
- Old daily stat reversal uses `previousAnswerTimestamp` correctly
- Delta accumulation for globals handles negative values
- Triple re-answer test validates A->B->C chains

### predict-polymarket settlement logic is correct
- No re-answer handling needed (Polymarket resolutions are final)
- NegRisk markets correctly mapped: `outcome=true` -> YES (index 0), `outcome=false` -> NO (index 1)
- Token registry bidirectional check prevents duplicate registration

---

## Summary

| # | Priority | Subgraph | Issue | Status |
|---|----------|----------|-------|--------|
| 1 | **High** | predict-omen | No agent ID filtering — tracked all services | FIXED + 11 tests |
| 2 | **Medium** | predict-omen | Event ordering race — ConditionPreparation dropped | NOT AN ISSUE (ordering guaranteed) + 3 tests |
| 3 | **Low** | predict-omen | Dead code — orphaned handlers and unused entities | FIXED |
| 4 | **Low** | predict-omen | `handleLogFinalize` overwrites without loading | FIXED (removed) |
| 5 | **Low** | predict-polymarket | `Bet.question` null if traded before init | FIXED (warning log) |
| 6 | **Low** | predict-polymarket | `QuestionResolution` duplicate risk | FIXED + 1 test |
| 7 | **Low** | predict-polymarket | `global.save()` called unnecessarily | FIXED + 1 test |

### Test Results After Fixes
- **predict-omen**: 33 tests pass (19 existing + 14 new)
- **predict-polymarket**: 98 tests pass (96 existing + 2 new)
