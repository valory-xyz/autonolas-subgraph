import * as stakingProxy from "./abi/StakingProxy/functions";
import * as stakingFactory from "./abi/StakingFactory/functions";
import * as registry from "./abi/ServiceRegistryL2/functions";
import * as utility from "./abi/ServiceRegistryTokenUtility/functions";
import { StakingContract } from "./model";
import { CHAIN } from "./constants";

// Every configuration field must be populated before the entity is persisted.
export type StakingConfig = Omit<
  StakingContract,
  "id" | "sender" | "instance" | "implementation"
>;

export type Transport = (method: string, params: unknown[]) => Promise<string>;
export class ContractRevert extends Error {}
export function transport(url: string): Transport {
  return async (method, params) => {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`RPC HTTP ${response.status}`);
    const body = (await response.json()) as {
      result?: string;
      error?: { code: number; message: string };
    };
    if (body.error) {
      if (
        body.error.code === 3 ||
        /execution reverted/i.test(body.error.message)
      )
        throw new ContractRevert(body.error.message);
      throw new Error(`RPC ${body.error.code}: ${body.error.message}`);
    }
    if (typeof body.result !== "string")
      throw new Error("RPC response missing result");
    return body.result;
  };
}

/** Fail before indexing if RPC_HTTP cannot serve the factory's historical state. */
export async function assertArchiveRpc(
  request: Transport,
  factoryAddress: string,
  startBlock: number,
): Promise<void> {
  const blockTag = `0x${BigInt(startBlock).toString(16)}`;
  let code: string;
  try {
    code = await request("eth_getCode", [factoryAddress, blockTag]);
  } catch (err) {
    throw new Error(
      `RPC_HTTP cannot read factory code at block ${startBlock}: ${errorMessage(err)}. An archive RPC is required.`,
    );
  }
  if (code === "0x") {
    throw new Error(
      `RPC_HTTP returned no factory code at block ${startBlock}; the endpoint is not archive-capable.`,
    );
  }

  try {
    const result = await request("eth_call", [
      { to: factoryAddress, data: stakingFactory.owner.encode({}) },
      blockTag,
    ]);
    if (result === "0x") throw new Error("owner() returned empty data");
    stakingFactory.owner.decodeResult(result);
  } catch (err) {
    throw new Error(
      `RPC_HTTP cannot call the staking factory at block ${startBlock}: ${errorMessage(err)}. An archive RPC is required.`,
    );
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message.split("\n", 1)[0] : String(err);
}

export class StakingReader {
  constructor(
    private request: Transport,
    private warn: (message: string) => void = console.warn,
  ) {}
  async read<A, R>(
    address: string,
    block: bigint,
    fn: { encode(args: A): string; decodeResult(data: string): R },
    args: A,
  ): Promise<R | null> {
    let output: string;
    try {
      output = await this.request("eth_call", [
        { to: address, data: fn.encode(args) },
        `0x${block.toString(16)}`,
      ]);
    } catch (err) {
      if (err instanceof ContractRevert) return null;
      // Transport/pruned-state failures must retry the batch, never become defaults.
      throw err;
    }
    if (output === "0x") return null;
    return fn.decodeResult(output);
  }
  async config(instance: string, block: bigint): Promise<StakingConfig> {
    const read = <R>(fn: {
      encode(args: {}): string;
      decodeResult(data: string): R;
    }) => this.read(instance, block, fn, {});
    const [
      metadataHash,
      maxNumServices,
      rewardsPerSecond,
      minStakingDeposit,
      minStakingDuration,
      maxNumInactivityPeriods,
      livenessPeriod,
      timeForEmissions,
      numAgentInstances,
      agentIds,
      threshold,
      configHash,
      proxyHash,
      serviceRegistry,
      activityChecker,
      tokenUtility,
      stakingToken,
      stakingManager,
      version,
    ] = await Promise.all([
      read(stakingProxy.metadataHash),
      read(stakingProxy.maxNumServices),
      read(stakingProxy.rewardsPerSecond),
      read(stakingProxy.minStakingDeposit),
      read(stakingProxy.minStakingDuration),
      read(stakingProxy.maxNumInactivityPeriods),
      read(stakingProxy.livenessPeriod),
      read(stakingProxy.timeForEmissions),
      read(stakingProxy.numAgentInstances),
      read(stakingProxy.getAgentIds),
      read(stakingProxy.threshold),
      read(stakingProxy.configHash),
      read(stakingProxy.proxyHash),
      read(stakingProxy.serviceRegistry),
      read(stakingProxy.activityChecker),
      read(stakingProxy.serviceRegistryTokenUtility),
      read(stakingProxy.stakingToken),
      read(stakingProxy.stakingManager),
      read(stakingProxy.VERSION),
    ]);
    const eventsIndexed = supportsEvents(version, stakingManager);
    if (!eventsIndexed)
      this.warn(
        `Skipping events from ${instance}: unsupported staking version ${version}`,
      );
    if (stakingToken === null)
      this.warn(
        `stakingToken() reverted for ${instance}; excluded from OLAS totals`,
      );
    return {
      metadataHash: metadataHash ?? "0x",
      maxNumServices: maxNumServices ?? 0n,
      rewardsPerSecond: rewardsPerSecond ?? 0n,
      minStakingDeposit: minStakingDeposit ?? 0n,
      minStakingDuration: minStakingDuration ?? 0n,
      maxNumInactivityPeriods: maxNumInactivityPeriods ?? 0n,
      livenessPeriod: livenessPeriod ?? 0n,
      timeForEmissions: timeForEmissions ?? 0n,
      numAgentInstances: numAgentInstances ?? 0n,
      agentIds: agentIds?.map(String) ?? [],
      threshold: threshold ?? 0n,
      configHash: configHash ?? "0x",
      proxyHash: proxyHash ?? "0x",
      serviceRegistry: serviceRegistry?.toLowerCase() ?? "0x",
      activityChecker: activityChecker?.toLowerCase() ?? "0x",
      serviceRegistryTokenUtility: tokenUtility?.toLowerCase() ?? null,
      stakingToken: stakingToken?.toLowerCase() ?? null,
      stakingManager: stakingManager?.toLowerCase() ?? null,
      version,
      eventsIndexed,
      isOlasStaking: stakingToken?.toLowerCase() === CHAIN.olas,
      configComplete: ![
        metadataHash,
        maxNumServices,
        rewardsPerSecond,
        minStakingDeposit,
        minStakingDuration,
        maxNumInactivityPeriods,
        livenessPeriod,
        timeForEmissions,
        numAgentInstances,
        agentIds,
        threshold,
        configHash,
        proxyHash,
        serviceRegistry,
        activityChecker,
        tokenUtility,
        stakingToken,
      ].includes(null),
    };
  }
  async lockedOlas(
    contract: StakingContract,
    serviceId: bigint,
    block: bigint,
  ): Promise<bigint> {
    if (!contract.isOlasStaking) return 0n;
    const locked = await this.readLocked(contract, serviceId, block);
    if (locked !== null) return locked;
    const fallback =
      contract.minStakingDeposit * (contract.numAgentInstances + 1n);
    this.warn(
      `Locked OLAS unreadable for service ${serviceId} on ${contract.id}; using minimum ${fallback}`,
    );
    if (fallback <= 0n) {
      throw new Error(
        `Cannot estimate locked OLAS for ${contract.id}: minStakingDeposit or numAgentInstances could not be read`,
      );
    }
    return fallback;
  }
  private async readLocked(
    contract: StakingContract,
    serviceId: bigint,
    block: bigint,
  ): Promise<bigint | null> {
    const utilityAddress = contract.serviceRegistryTokenUtility;
    if (!utilityAddress || !/^0x[0-9a-f]{40}$/.test(contract.serviceRegistry))
      return null;
    const deposit = await this.read(
      utilityAddress,
      block,
      utility.mapServiceIdTokenDeposit,
      { _0: serviceId },
    );
    if (deposit === null) return null;
    const [service, params] = await Promise.all([
      this.read(contract.serviceRegistry, block, registry.getService, {
        serviceId,
      }),
      this.read(contract.serviceRegistry, block, registry.getAgentParams, {
        serviceId,
      }),
    ]);
    if (!service || !params) return null;
    if (service.agentIds.length !== params.agentParams.length) {
      throw new Error(
        `Staking bond arrays differ for service ${serviceId} on ${contract.id}: ${service.agentIds.length} agent IDs, ${params.agentParams.length} agent params`,
      );
    }
    let total = deposit.securityDeposit;
    for (let i = 0; i < service.agentIds.length; i++) {
      const bond = await this.read(
        utilityAddress,
        block,
        utility.getAgentBond,
        { serviceId, agentId: BigInt(service.agentIds[i]) },
      );
      if (bond === null) return null;
      total += BigInt(params.agentParams[i].slots) * bond;
    }
    return total;
  }
}
export function supportsEvents(
  version: string | null,
  stakingManager: string | null,
): boolean {
  return (
    version === null ||
    version === "0.1.0" ||
    version === "0.2.0" ||
    (version === "0.3.0" && stakingManager !== null)
  );
}
