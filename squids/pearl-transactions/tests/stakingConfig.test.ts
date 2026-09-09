import { describe, expect, it } from "vitest";
import * as factory from "../src/abi/StakingFactory/functions";
import * as proxy from "../src/abi/StakingProxy/functions";
import { decodeStakingConfig } from "../src/stakingConfig";

// Build real calldata with the same generated bindings the decoder uses, so
// the test exercises the actual two-level decode: createStakingInstance,
// then initialize() inside initPayload. No hand-copied struct.
const ZERO32 = `0x${"00".repeat(32)}`;
const ZERO20 = `0x${"00".repeat(20)}`;

function buildCalldata(minStakingDeposit: bigint, numAgentInstances: bigint) {
  const initPayload = proxy.initialize.encode({
    _stakingParams: {
      metadataHash: ZERO32,
      maxNumServices: 10n,
      rewardsPerSecond: 1n,
      minStakingDeposit,
      minNumStakingPeriods: 3n,
      maxNumInactivityPeriods: 2n,
      livenessPeriod: 86400n,
      timeForEmissions: 100n,
      numAgentInstances,
      agentIds: [40n],
      threshold: 1n,
      configHash: ZERO32,
      proxyHash: ZERO32,
      serviceRegistry: ZERO20,
      activityChecker: ZERO20,
    },
    _serviceRegistryTokenUtility: ZERO20,
    _stakingToken: ZERO20,
  } as never);
  return factory.createStakingInstance.encode({
    implementation: ZERO20,
    initPayload,
  } as never);
}

describe("decodeStakingConfig", () => {
  it("pulls minStakingDeposit and numAgentInstances out of the calldata", () => {
    expect(
      decodeStakingConfig(buildCalldata(20_000_000_000_000_000_000n, 2n))
    ).toEqual({
      minStakingDeposit: 20_000_000_000_000_000_000n,
      numAgentInstances: 2n,
    });
  });

  it("handles a zero deposit without treating it as absent", () => {
    // 0 is a legitimate value; a truthiness check here would drop the proxy.
    expect(decodeStakingConfig(buildCalldata(0n, 1n))).toEqual({
      minStakingDeposit: 0n,
      numAgentInstances: 1n,
    });
  });

  it("returns null for calldata that is not createStakingInstance", () => {
    // The generated binding checks the selector, so a same-layout call from
    // some other contract cannot be silently mis-read.
    expect(decodeStakingConfig("0xdeadbeef")).toBeNull();
    expect(decodeStakingConfig("0x")).toBeNull();
    expect(decodeStakingConfig(undefined)).toBeNull();
  });

  it("throws on calldata that has our selector but malformed body", () => {
    // Deliberately NOT null. null means "a different call, skip this proxy",
    // which silently drops the proxy and every staking event for it. Our own
    // selector with a body we cannot decode means the bindings or ABI have
    // regressed, and that must surface rather than masquerade as a foreign
    // call.
    expect(() =>
      decodeStakingConfig(buildCalldata(1n, 1n).slice(0, 100))
    ).toThrow();
  });
});
