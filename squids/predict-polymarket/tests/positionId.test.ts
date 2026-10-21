// Protocol V2 position ID decoding. Layout (docs.polymarket.com/resources/onchain-position-data):
//   [moduleId 8 | baseHash 128 | arity 16 | reserved 64 | resolutionChain 16 | conditionIndex 16 | outcomeIndex 8]
// The condition ID is the position ID without its outcome byte (bytes31);
// Gamma, the CLOB and the Data API carry it right-padded to bytes32.
import { expect, it } from "vitest";
import { decodePositionId, padConditionId } from "../src/positionId";

// Recorded from the Gamma API (GET /markets?version=v2): a NegRiskModule
// market's conditionId (conditionIndex 1) and positionIds [Yes, No] exactly
// as served. Only the outcome byte is dropped.
const NEG_RISK_CONDITION = "0x02dffa4b8e1f2af8be25e1443a82c69f88000500000000000000000000000100";
const NEG_RISK_POSITIONS = [
  "1300360066161977289524430685838222987903983325604679475414554323874840838400",
  "1300360066161977289524430685838222987903983325604679475414554323874840838401",
];

it("decodes Gamma's NegRisk position IDs to module 2 and its padded condition ID", () => {
  NEG_RISK_POSITIONS.forEach((pid, outcome) => {
    const d = decodePositionId(BigInt(pid));
    expect(d).toEqual({ moduleId: 2, conditionId: NEG_RISK_CONDITION.slice(0, 64), outcomeIndex: outcome }); // bytes31
    expect(padConditionId(d.conditionId)).toBe(NEG_RISK_CONDITION);
  });
});

it("keeps leading zero bytes of the condition and reads the whole outcome byte", () => {
  const condition = `0x0000${"ab".repeat(27)}0000`;
  const d = decodePositionId((BigInt(condition) << 8n) | 0xffn);
  expect(d).toEqual({ moduleId: 0, conditionId: condition, outcomeIndex: 255 });
  expect(padConditionId(condition)).toBe(`${condition}00`);
});
