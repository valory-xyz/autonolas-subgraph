import { describe, expect, it } from "vitest";
import { decodeForeign, eventMeta } from "../src/decode";

describe("eventMeta", () => {
  it("converts the header's ms timestamp to seconds and lowercases addresses", () => {
    const m = eventMeta(
      { number: 59_600_000, timestamp: 1_789_000_000_999 },
      {
        address: "0xA45E64D13A30A51B91AE0EB182E88A40E9B18ED8",
        transactionHash: "0xabc",
        logIndex: 3,
        transaction: { from: "0xFEED000000000000000000000000000000000001", to: null },
      }
    );
    expect(m.blockNumber).toBe(59_600_000n);
    expect(m.blockTimestamp).toBe(1_789_000_000n); // floored, not rounded
    expect(m.address).toBe("0xa45e64d13a30a51b91ae0eb182e88a40e9b18ed8");
    expect(m.txFrom).toBe("0xfeed000000000000000000000000000000000001");
    expect(m.txTo).toBeNull();
    expect(m.logIndex).toBe(3);
  });

  it("leaves tx fields null when the subscription did not include the transaction", () => {
    const m = eventMeta(
      { number: 1, timestamp: 1000 },
      { address: "0xab", transactionHash: "0x1", logIndex: 0 }
    );
    expect(m.txFrom).toBeNull();
    expect(m.txTo).toBeNull();
  });
});

describe("decodeForeign", () => {
  it("drops a shape mismatch (DecodingError) and returns null", () => {
    const err = Object.assign(new Error("wrong topic count"), { name: "DecodingError" });
    const ev = {
      decode() {
        throw err;
      },
    };
    expect(decodeForeign(ev, {})).toBeNull();
  });

  it("rethrows anything that is not a DecodingError", () => {
    const ev = {
      decode() {
        throw new TypeError("bug in the decoder");
      },
    };
    expect(() => decodeForeign(ev, {})).toThrow(TypeError);
  });

  it("keeps the decoder's receiver (`this`) intact", () => {
    const ev = {
      topicCount: 2,
      decode(this: { topicCount: number }, log: { topics: string[] }) {
        if (log.topics.length !== this.topicCount) {
          throw Object.assign(new Error("x"), { name: "DecodingError" });
        }
        return { ok: true };
      },
    };
    expect(decodeForeign(ev, { topics: ["a", "b"] })).toEqual({ ok: true });
    expect(decodeForeign(ev, { topics: ["a"] })).toBeNull();
  });
});
