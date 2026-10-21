// V1 regression: recorded V1 (CTF position system) logs replayed through
// src/dispatch.ts must give exactly main's bet totals.
//
// tests/fixtures/v1-replay.json: two agent-86 services, one filling from its
// Safe on CTFExchange and NegRiskCtfExchange, one through its DepositWallet on
// the CLOB v2 CTF Exchange, plus the registry, wallet-factory, TokenRegistered
// and ConditionPreparation logs those fills need.
// tests/fixtures/v1-replay.expected.json: the snapshot main (7d0705d3)
// produces for the same logs, from main.ts's decode-and-dispatch and main's
// handlers. The CTF getCollectionId eth_call is replaced by the token IDs
// Gamma serves for those conditions, recorded in the fixture.
import { expect, it, vi } from "vitest";

const derivation = vi.hoisted(() => ({
  derived: {} as Record<string, string[]>,
  collaterals: [] as string[],
}));
vi.mock("../src/tokenDerivation", () => ({
  getOutcomeTokenId: vi.fn(async (conditionId: string, collateral: string, indexSet: number) => {
    derivation.collaterals.push(collateral);
    return derivation.derived[conditionId]?.[indexSet - 1] ?? null;
  }),
}));

import { InMemoryCache } from "./inMemoryCache";
import { loadFixture, RawLog, RecordedBlock, snapshot, sqdBlock } from "./replay";
import { dispatchLog } from "../src/dispatch";
import { Bet } from "../src/model";

const USDC_E = "0x2791bca1f2de4661ed88a30c99a7a9449aa84174";

it("replays recorded V1 logs through dispatch with exactly main's bet totals", async () => {
  const v1 = loadFixture<{ derivedTokenIds: Record<string, string[]>; logs: { block: RecordedBlock; log: RawLog }[] }>(
    "v1-replay.json",
  );
  derivation.derived = v1.derivedTokenIds;
  const cache = new InMemoryCache();
  for (const { block, log } of v1.logs) await dispatchLog(cache, sqdBlock(block), log);

  expect(snapshot(cache)).toEqual(loadFixture("v1-replay.expected.json"));
  // V1 conditions still derive their CTF token IDs from USDC.e
  expect(derivation.collaterals).toEqual([USDC_E, USDC_E, USDC_E, USDC_E]);
  // and V1 bets are not tagged with the V2 collateral
  for (const b of cache.all(Bet)) expect(b.collateral ?? null, b.id).toBeNull();
});
