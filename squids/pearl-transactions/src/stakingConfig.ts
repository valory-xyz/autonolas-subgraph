// StakingProxy config WITHOUT an RPC node.
//
// minStakingDeposit and numAgentInstances have no event, so the subgraph
// eth_call'd them on the freshly created proxy. They are, however,
// constructor parameters: StakingFactory.createStakingInstance(implementation,
// initPayload) passes initPayload straight to the proxy, and initPayload is
// an encoded StakingProxy.initialize(StakingParams, ...) call whose struct
// carries both values.
//
// The InstanceCreated log request asks for its transaction, so the calldata
// arrives in the same batch and no network call is needed.

import { decodeAbiParameters, parseAbiParameters, slice } from "viem";

export interface StakingConfig {
  minStakingDeposit: bigint;
  numAgentInstances: bigint;
}

// StakingParams, in declaration order. Only two fields are used, but the
// whole struct must be described for the decoder to find their offsets.
const STAKING_PARAMS = parseAbiParameters(
  "(bytes32 metadataHash," +
    "uint256 maxNumServices," +
    "uint256 rewardsPerSecond," +
    "uint256 minStakingDeposit," +
    "uint256 minNumStakingPeriods," +
    "uint256 maxNumInactivityPeriods," +
    "uint256 livenessPeriod," +
    "uint256 timeForEmissions," +
    "uint256 numAgentInstances," +
    "uint256[] agentIds," +
    "uint256 threshold," +
    "bytes32 configHash," +
    "bytes32 proxyHash," +
    "address serviceRegistry," +
    "address activityChecker)"
);

// createStakingInstance(address implementation, bytes initPayload)
const CREATE_INSTANCE_ARGS = parseAbiParameters("address, bytes");

/**
 * Decode a proxy's staking config from the `createStakingInstance`
 * transaction that produced it.
 *
 * Returns null when the calldata is not the expected shape — a factory
 * called through a router or multisig batch, say. The caller then skips the
 * proxy, exactly as the subgraph did when its eth_calls reverted.
 */
export function decodeStakingConfig(txInput: string | undefined): StakingConfig | null {
  if (txInput == null || txInput.length < 10) return null;
  try {
    // strip the 4-byte selector of createStakingInstance
    const [, initPayload] = decodeAbiParameters(
      CREATE_INSTANCE_ARGS,
      slice(txInput as `0x${string}`, 4)
    );
    if (initPayload.length < 10) return null;
    // initPayload is initialize(StakingParams, ...) — strip its selector too
    const [params] = decodeAbiParameters(
      STAKING_PARAMS,
      slice(initPayload as `0x${string}`, 4)
    );
    const p = params as unknown as {
      minStakingDeposit: bigint;
      numAgentInstances: bigint;
    };
    if (
      typeof p.minStakingDeposit !== "bigint" ||
      typeof p.numAgentInstances !== "bigint"
    ) {
      return null;
    }
    return {
      minStakingDeposit: p.minStakingDeposit,
      numAgentInstances: p.numAgentInstances,
    };
  } catch {
    // Any shape mismatch is "not the call we model", not a transient fault
    // — there is no network here to retry.
    return null;
  }
}
