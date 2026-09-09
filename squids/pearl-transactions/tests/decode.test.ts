import { describe, expect, it } from "vitest";
import { decodeForeignSafe } from "../src/decode";
import { isRevert } from "../src/rpc";
import { isStakingProxy } from "../src/logic";
import { ROLE_AGENT, ROLE_MASTER, ROLE_STAKING } from "../src/constants";

// The two bugs the first live smoke run surfaced, plus the predicate that
// keeps foreign emitters out of the staking path. All three were previously
// unreachable from a test.

describe("decodeForeignSafe", () => {
  const decodingError = () => {
    const e = new Error("Topic count mismatch. Expected 1 topics, received 2.");
    e.name = "DecodingError";
    throw e;
  };

  it("returns null on a topic-shape mismatch from a foreign contract", () => {
    // indexed-ness is not part of an event signature, so an unrelated
    // contract's `AddedOwner(address indexed)` collides with Safe's
    // `AddedOwner(address)` on topic0 but carries an extra topic.
    expect(decodeForeignSafe({ decode: decodingError }, {})).toBeNull();
  });

  it("rethrows anything that is not a shape mismatch", () => {
    // A genuine decoding bug must still crash the batch rather than
    // silently drop data.
    const boom = () => {
      throw new TypeError("Cannot read properties of undefined");
    };
    expect(() => decodeForeignSafe({ decode: boom }, {})).toThrow(TypeError);
  });

  it("passes the decoded value through and preserves the receiver", () => {
    // The real decoder reads `this.topicCount`, so a bare function
    // reference would lose its receiver — this asserts we call it as a
    // method.
    const event = {
      marker: "ok",
      decode(this: { marker: string }) {
        return this.marker;
      },
    };
    expect(decodeForeignSafe(event, {})).toBe("ok");
  });
});

describe("isRevert", () => {
  const err = (name: string, cause?: unknown) =>
    Object.assign(new Error(name), { name, cause });

  it("treats a wrapped revert as a revert", () => {
    // viem wraps everything in ContractFunctionExecutionError, so the
    // verdict has to come from the cause chain.
    expect(
      isRevert(
        err("ContractFunctionExecutionError", err("ContractFunctionRevertedError"))
      )
    ).toBe(true);
  });

  it("treats a wrapped zero-data result as a revert", () => {
    expect(
      isRevert(
        err("ContractFunctionExecutionError", err("ContractFunctionZeroDataError"))
      )
    ).toBe(true);
  });

  it("does NOT treat a wrapped HTTP failure as a revert", () => {
    // This is the whole point: a rate-limit blip read as "not a Safe" would
    // drop a real user's history. The wrapper name is identical to the
    // genuine-revert case above.
    expect(
      isRevert(err("ContractFunctionExecutionError", err("HttpRequestError")))
    ).toBe(false);
  });

  it("does not treat the bare wrapper as a revert", () => {
    expect(isRevert(err("ContractFunctionExecutionError"))).toBe(false);
  });

  it("finds a revert nested several levels down", () => {
    expect(
      isRevert(
        err("A", err("B", err("C", err("ContractFunctionRevertedError"))))
      )
    ).toBe(true);
  });

  it("terminates on a cause chain that loops", () => {
    const a: any = Object.assign(new Error("a"), { name: "a" });
    a.cause = a;
    expect(isRevert(a)).toBe(false);
  });

  it("is false for a plain error and for null", () => {
    expect(isRevert(new Error("boom"))).toBe(false);
    expect(isRevert(null)).toBe(false);
  });
});

describe("isStakingProxy", () => {
  const tracked = (role: any) => ({
    id: "0xproxy",
    role,
    masterSafeId: null,
    serviceId: null,
  });

  it("accepts only a STAKING row", () => {
    expect(isStakingProxy(tracked(ROLE_STAKING))).toBe(true);
    expect(isStakingProxy(tracked(ROLE_MASTER))).toBe(false);
    expect(isStakingProxy(tracked(ROLE_AGENT))).toBe(false);
  });

  it("rejects an untracked emitter", () => {
    // The staking topics have no address filter, so every foreign contract
    // emitting a colliding topic0 lands here.
    expect(isStakingProxy(null)).toBe(false);
  });
});
