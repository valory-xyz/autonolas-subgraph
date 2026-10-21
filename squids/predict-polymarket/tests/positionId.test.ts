// Protocol V2 position ID decoding. Layout (docs.polymarket.com/resources/onchain-position-data):
//   [moduleId 8 | baseHash 128 | arity 16 | reserved 64 | resolutionChain 16 | conditionIndex 16 | outcomeIndex 8]
// The condition ID is the position ID with the outcome byte dropped (bytes31);
// Gamma, the CLOB and the Data API carry it right-padded to bytes32.
import { describe, expect, it } from "vitest";
import { decodePositionId, padConditionId } from "../src/positionId";

// Recorded from the Gamma API (GET /markets?version=v2): market id, its
// conditionId and its positionIds ([0] = Yes, [1] = No) exactly as served.
const GAMMA_V2_MARKETS = [
  {
    // BinaryModule market (module 1, arity 0, conditionIndex 0)
    id: "5929025",
    conditionId:
      "0x01e8a4b7d8fb97379337bb29380b28df56000000000000000000000000000000",
    positionIds: [
      "863358210533918701740174954868484610826072786730813595626095950865979408384",
      "863358210533918701740174954868484610826072786730813595626095950865979408385",
    ],
    moduleId: 1,
  },
  {
    // NegRiskModule market, first condition of a 5-condition event
    id: "5929023",
    conditionId:
      "0x02dffa4b8e1f2af8be25e1443a82c69f88000500000000000000000000000000",
    positionIds: [
      "1300360066161977289524430685838222987903983325604679475414554323874840838144",
      "1300360066161977289524430685838222987903983325604679475414554323874840838145",
    ],
    moduleId: 2,
  },
  {
    // NegRiskModule market, conditionIndex 1 of the same event: the
    // condition ID keeps the conditionIndex bits, only the outcome byte goes
    id: "5929029",
    conditionId:
      "0x02dffa4b8e1f2af8be25e1443a82c69f88000500000000000000000000000100",
    positionIds: [
      "1300360066161977289524430685838222987903983325604679475414554323874840838400",
      "1300360066161977289524430685838222987903983325604679475414554323874840838401",
    ],
    moduleId: 2,
  },
];

// mulberry32: tiny deterministic PRNG so the randomized test is reproducible.
function prng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomBytes31(rand: () => number): string {
  let hex = "";
  for (let i = 0; i < 31; i++) {
    hex += Math.floor(rand() * 256)
      .toString(16)
      .padStart(2, "0");
  }
  return `0x${hex}`;
}

/** Independent encoder: positionId = conditionId (bytes31) << 8 | outcomeIndex. */
function encodePositionId(conditionId31: string, outcomeIndex: number): bigint {
  return (BigInt(conditionId31) << 8n) | BigInt(outcomeIndex);
}

describe("decodePositionId", () => {
  it("decodes real Gamma V2 position IDs into module, condition and outcome", () => {
    for (const m of GAMMA_V2_MARKETS) {
      m.positionIds.forEach((pid, outcome) => {
        const d = decodePositionId(BigInt(pid));
        expect(Number(d.moduleId), `module of ${m.id}`).toBe(m.moduleId);
        expect(Number(d.outcomeIndex), `outcome of ${m.id}`).toBe(outcome);
        // bytes31: Gamma's bytes32 value without its trailing zero byte
        expect(d.conditionId, `condition of ${m.id}`).toBe(
          m.conditionId.slice(0, 64),
        );
        expect(padConditionId(d.conditionId)).toBe(m.conditionId);
      });
    }
  });

  it("round-trips 256 seeded random bytes31 conditions for outcomes 0 and 1", () => {
    const rand = prng(0x5eed2026);
    const cases: string[] = [];
    for (let i = 0; i < 256; i++) cases.push(randomBytes31(rand));
    // the PRNG must actually produce varied conditions
    expect(new Set(cases).size).toBe(256);

    let checked = 0;
    for (const conditionId of cases) {
      for (const outcomeIndex of [0, 1]) {
        const d = decodePositionId(encodePositionId(conditionId, outcomeIndex));
        expect(d.conditionId).toBe(conditionId);
        expect(padConditionId(d.conditionId)).toBe(`${conditionId}00`);
        expect(Number(d.outcomeIndex)).toBe(outcomeIndex);
        expect(Number(d.moduleId)).toBe(parseInt(conditionId.slice(2, 4), 16));
        checked += 1;
      }
    }
    expect(checked).toBe(512);
  });

  it("keeps leading zero bytes of the condition (fixed 31-byte width, lowercase)", () => {
    const conditionId = `0x0000${"ab".repeat(27)}0000`;
    expect(conditionId.length).toBe(64);
    const d = decodePositionId(encodePositionId(conditionId, 1));
    expect(d.conditionId).toBe(conditionId);
    expect(Number(d.moduleId)).toBe(0);
    expect(Number(d.outcomeIndex)).toBe(1);
    expect(padConditionId(d.conditionId)).toBe(`${conditionId}00`);

    // output hex must be lowercase so it joins against Gamma / Data API ids
    const upper = decodePositionId(
      encodePositionId(`0x${"AF".repeat(31)}`, 0),
    );
    expect(upper.conditionId).toBe(`0x${"af".repeat(31)}`);
  });
});

describe("padConditionId", () => {
  it("right-pads a bytes31 condition ID with one zero byte to 32 bytes", () => {
    const c31 = `0x01${"5a".repeat(29)}07`;
    const padded = padConditionId(c31);
    expect(padded).toBe(`${c31}00`);
    expect(padded).toHaveLength(66);
    // left-padding (numeric zero-extension) would be the classic mistake
    expect(padded).not.toBe(`0x00${c31.slice(2)}`);
  });
});
