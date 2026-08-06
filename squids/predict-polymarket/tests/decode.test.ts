// The decode layer is where trade direction and timestamps are derived —
// misreading either misclassifies every trade with an otherwise-green suite.
import { describe, expect, it } from "vitest";
import { eventMeta, inferV1Direction, inferV2Direction } from "../src/decode";

describe("inferV1Direction", () => {
  it("makerAssetId 0 = BUY, outcome token is the taker asset", () => {
    expect(inferV1Direction(0n, 555n)).toEqual({
      isBuying: true,
      outcomeTokenId: 555n,
    });
  });

  it("non-zero makerAssetId = SELL, outcome token is the maker asset", () => {
    expect(inferV1Direction(555n, 0n)).toEqual({
      isBuying: false,
      outcomeTokenId: 555n,
    });
  });
});

describe("inferV2Direction", () => {
  it("side 0 = BUY, side 1 = SELL, for both number and bigint decodings", () => {
    expect(inferV2Direction(0)).toBe(true);
    expect(inferV2Direction(1)).toBe(false);
    expect(inferV2Direction(0n)).toBe(true);
    expect(inferV2Direction(1n)).toBe(false);
  });
});

describe("eventMeta", () => {
  it("converts SQD millisecond timestamps to seconds and casts blocks to bigint", () => {
    const meta = eventMeta(
      { number: 88_000_000, timestamp: 1_750_010_000_500 }, // ms, mid-second
      { transactionHash: "0xabc", logIndex: 7 },
    );
    expect(meta.blockNumber).toBe(88_000_000n);
    expect(meta.blockTimestamp).toBe(1_750_010_000n); // floored seconds
    expect(meta.transactionHash).toBe("0xabc");
    expect(meta.logIndex).toBe(7);
  });

  it("day-buckets correctly through the seconds conversion", () => {
    // 1_749_945_600s is a UTC midnight; the ms value must land in that day
    const meta = eventMeta(
      { number: 1, timestamp: 1_749_945_600_000 + 3_600_000 }, // +1h in ms
      { transactionHash: "0x", logIndex: 0 },
    );
    expect((meta.blockTimestamp / 86_400n) * 86_400n).toBe(1_749_945_600n);
  });
});
