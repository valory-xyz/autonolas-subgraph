import { it, expect, vi } from "vitest";
import {
  assertArchiveRpc,
  StakingReader,
  ContractRevert,
  supportsEvents,
} from "../src/rpc";
import * as stakingProxy from "../src/abi/StakingProxy/functions";
import { StakingContract } from "../src/model";

it("preserves version gating from studio main", () => {
  expect(supportsEvents(null, null)).toBe(true);
  expect(supportsEvents("0.2.0", null)).toBe(true);
  expect(supportsEvents("0.3.0", null)).toBe(false);
  expect(supportsEvents("0.3.0", "0x" + "11".repeat(20))).toBe(true);
  expect(supportsEvents("0.4.0", null)).toBe(false);
});
it("pins reads to the event block and never falls back to latest on transport errors", async () => {
  const calls: unknown[][] = [];
  const reader = new StakingReader(async (_, args) => {
    calls.push(args);
    throw new Error("missing trie node");
  });
  await expect(
    reader.read(
      "0x" + "11".repeat(20),
      123n,
      stakingProxy.minStakingDeposit,
      {},
    ),
  ).rejects.toThrow("missing trie node");
  expect(calls).toHaveLength(1);
  expect(calls[0][1]).toBe("0x7b");
});
it("checks factory code and a real historical call before indexing", async () => {
  const calls: Array<[string, unknown[]]> = [];
  const request = async (method: string, params: unknown[]) => {
    calls.push([method, params]);
    return method === "eth_getCode"
      ? "0x6000"
      : `0x${"00".repeat(12)}${"11".repeat(20)}`;
  };
  await expect(assertArchiveRpc(request, "0x" + "22".repeat(20), 100)).resolves.toBeUndefined();
  expect(calls.map(([method]) => method)).toEqual(["eth_getCode", "eth_call"]);
  expect(calls.map(([, params]) => params[1])).toEqual(["0x64", "0x64"]);
});
it("fails archive validation when historical code or calls return empty data", async () => {
  await expect(
    assertArchiveRpc(async () => "0x", "0x" + "22".repeat(20), 100),
  ).rejects.toThrow("returned no factory code at block 100");
  await expect(
    assertArchiveRpc(
      async (method) => (method === "eth_getCode" ? "0x6000" : "0x"),
      "0x" + "22".repeat(20),
      100,
    ),
  ).rejects.toThrow("cannot call the staking factory at block 100");
});
it("defaults only genuine revert/empty results and marks degraded config", async () => {
  const reader = new StakingReader(
    async () => {
      throw new ContractRevert("execution reverted");
    },
    () => {},
  );
  expect(await reader.config("0x" + "11".repeat(20), 123n)).toMatchObject({
    configComplete: false,
    isOlasStaking: false,
    eventsIndexed: true,
    minStakingDeposit: 0n,
    stakingToken: null,
  });
  const empty = new StakingReader(async () => "0x");
  expect(
    await empty.read(
      "0x" + "11".repeat(20),
      123n,
      stakingProxy.minStakingDeposit,
      {},
    ),
  ).toBeNull();
});
it("uses contract minimum when deposit getters are unavailable, but not for network errors", async () => {
  const contract = new StakingContract({
    id: "0x" + "11".repeat(20),
    isOlasStaking: true,
    minStakingDeposit: 100n,
    numAgentInstances: 2n,
    serviceRegistry: "0x" + "22".repeat(20),
    serviceRegistryTokenUtility: "0x" + "33".repeat(20),
  });
  const reader = new StakingReader(
    async () => "0x",
    () => {},
  );
  expect(await reader.lockedOlas(contract, 1n, 123n)).toBe(300n);
  const broken = new StakingReader(async () => {
    throw new Error("HTTP 429");
  });
  await expect(broken.lockedOlas(contract, 1n, 123n)).rejects.toThrow(
    "HTTP 429",
  );
  const unknownMinimum = new StakingContract({ ...contract, minStakingDeposit: 0n, numAgentInstances: 0n });
  await expect(reader.lockedOlas(unknownMinimum, 1n, 123n)).rejects.toThrow(
    "Cannot estimate locked OLAS",
  );
});

it("rejects a mismatch between service agent IDs and agent parameters", async () => {
  const utility = await import(
    "../src/abi/ServiceRegistryTokenUtility/functions"
  );
  const registry = await import("../src/abi/ServiceRegistryL2/functions");
  const contract = new StakingContract({
    id: "0x" + "11".repeat(20),
    isOlasStaking: true,
    minStakingDeposit: 1n,
    numAgentInstances: 1n,
    serviceRegistry: "0x" + "22".repeat(20),
    serviceRegistryTokenUtility: "0x" + "33".repeat(20),
  });
  const reader = new StakingReader(async () => "0x", () => {});
  vi.spyOn(reader, "read").mockImplementation(async (_address, _block, fn): Promise<any> => {
    if (fn === utility.mapServiceIdTokenDeposit)
      return { token: "0x" + "44".repeat(20), securityDeposit: 100n };
    if (fn === registry.getService) return { agentIds: [7, 8] };
    if (fn === registry.getAgentParams) return { agentParams: [{ slots: 2, bond: 0n }] };
    throw new Error("unexpected getter");
  });
  await expect(reader.lockedOlas(contract, 1n, 123n)).rejects.toThrow(
    "2 agent IDs, 1 agent params",
  );
});

it("reads actual deposit plus each agent bond times its slots at the stake block", async () => {
  const { vi } = await import("vitest");
  const utility = await import(
    "../src/abi/ServiceRegistryTokenUtility/functions"
  );
  const registry = await import("../src/abi/ServiceRegistryL2/functions");
  const contract = new StakingContract({
    id: "0x" + "11".repeat(20),
    isOlasStaking: true,
    minStakingDeposit: 1n,
    numAgentInstances: 1n,
    serviceRegistry: "0x" + "22".repeat(20),
    serviceRegistryTokenUtility: "0x" + "33".repeat(20),
  });
  const reader = new StakingReader(async () => {
    throw new Error("unexpected transport");
  });
  const read = vi
    .spyOn(reader, "read")
    .mockImplementation(
      async (_address, block, fn, args: any): Promise<any> => {
        expect(block).toBe(123n);
        if (fn === utility.mapServiceIdTokenDeposit)
          return { token: "0x" + "44".repeat(20), securityDeposit: 100n };
        if (fn === registry.getService) return { agentIds: [7, 8] };
        if (fn === registry.getAgentParams)
          return {
            agentParams: [
              { slots: 2, bond: 0n },
              { slots: 3, bond: 0n },
            ],
          };
        if (fn === utility.getAgentBond) return args.agentId === 7n ? 50n : 70n;
        throw new Error("unexpected getter");
      },
    );
  expect(await reader.lockedOlas(contract, 1n, 123n)).toBe(410n);
  expect(read).toHaveBeenCalledTimes(5);
});
