import { describe, expect, it } from "vitest";
import { encodeAbiParameters, parseAbiParameters } from "viem";
import { decodeStakingConfig } from "../src/stakingConfig";

// Rebuild a real createStakingInstance(implementation, initPayload) calldata
// so the test exercises the same two-level decode the handler does: strip the
// factory selector, then the initialize() selector inside initPayload.
const STAKING_PARAMS = parseAbiParameters(
  "(bytes32 metadataHash,uint256 maxNumServices,uint256 rewardsPerSecond," +
    "uint256 minStakingDeposit,uint256 minNumStakingPeriods," +
    "uint256 maxNumInactivityPeriods,uint256 livenessPeriod," +
    "uint256 timeForEmissions,uint256 numAgentInstances,uint256[] agentIds," +
    "uint256 threshold,bytes32 configHash,bytes32 proxyHash," +
    "address serviceRegistry,address activityChecker)"
);

const ZERO32 = `0x${"00".repeat(32)}` as const;
const ZERO20 = `0x${"00".repeat(20)}` as const;

function buildCalldata(minStakingDeposit: bigint, numAgentInstances: bigint) {
  const params = encodeAbiParameters(STAKING_PARAMS, [
    {
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
  ] as never);
  // initialize(...) selector + encoded struct
  const initPayload = `0xaaaaaaaa${params.slice(2)}` as `0x${string}`;
  const outer = encodeAbiParameters(parseAbiParameters("address, bytes"), [
    ZERO20,
    initPayload,
  ]);
  // createStakingInstance(...) selector + encoded args
  return `0xbbbbbbbb${outer.slice(2)}`;
}

describe("decodeStakingConfig", () => {
  it("pulls minStakingDeposit and numAgentInstances out of the calldata", () => {
    const cfg = decodeStakingConfig(buildCalldata(20_000_000_000_000_000_000n, 2n));
    expect(cfg).toEqual({
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

  it("returns null for calldata that is not the call we model", () => {
    // e.g. the factory reached through a router or a multisig batch — the
    // subgraph skipped the proxy in the equivalent (reverted) case.
    expect(decodeStakingConfig("0xdeadbeef")).toBeNull();
    expect(decodeStakingConfig("0x")).toBeNull();
    expect(decodeStakingConfig(undefined)).toBeNull();
  });

  it("returns null rather than throwing on truncated calldata", () => {
    const good = buildCalldata(1n, 1n);
    expect(decodeStakingConfig(good.slice(0, 100))).toBeNull();
  });
});
