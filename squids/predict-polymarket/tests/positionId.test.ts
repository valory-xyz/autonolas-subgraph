// Protocol V2 position ID decoding. Layout (docs.polymarket.com/resources/onchain-position-data):
//   [moduleId 8 | baseHash 128 | arity 16 | reserved 64 | resolutionChain 16 | conditionIndex 16 | outcomeIndex 8]
// The condition ID is the position ID without its outcome byte (bytes31);
// Gamma, the CLOB and the Data API carry it right-padded to bytes32.
import { expect, it } from "vitest";
import { decodePositionId, padConditionId } from "../src/positionId";

// Recorded from the Gamma API (GET /markets?version=v2): conditionId and
// positionIds [Yes, No] exactly as served, and the market's module.
const GAMMA_V2_MARKETS = [
  // BinaryModule market
  [1, "0x01e8a4b7d8fb97379337bb29380b28df56000000000000000000000000000000",
    "863358210533918701740174954868484610826072786730813595626095950865979408384",
    "863358210533918701740174954868484610826072786730813595626095950865979408385"],
  // NegRiskModule market, conditionIndex 1: only the outcome byte is dropped
  [2, "0x02dffa4b8e1f2af8be25e1443a82c69f88000500000000000000000000000100",
    "1300360066161977289524430685838222987903983325604679475414554323874840838400",
    "1300360066161977289524430685838222987903983325604679475414554323874840838401"],
] as const;

it.each(GAMMA_V2_MARKETS)("decodes Gamma's module %i position IDs to its padded condition ID", (moduleId, padded, yes, no) => {
  [yes, no].forEach((pid, outcome) => {
    const d = decodePositionId(BigInt(pid));
    expect(Number(d.moduleId)).toBe(moduleId);
    expect(Number(d.outcomeIndex)).toBe(outcome);
    expect(d.conditionId).toBe(padded.slice(0, 64)); // bytes31
    expect(padConditionId(d.conditionId)).toBe(padded);
  });
});

it("keeps leading zero bytes of the condition and reads the whole outcome byte", () => {
  const condition = `0x0000${"ab".repeat(27)}0000`;
  const d = decodePositionId((BigInt(condition) << 8n) | 0xffn);
  expect(d).toEqual({ moduleId: 0, conditionId: condition, outcomeIndex: 255 });
  expect(padConditionId(condition)).toBe(`${condition}00`);
});
