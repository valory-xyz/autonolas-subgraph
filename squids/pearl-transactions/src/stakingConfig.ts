// StakingProxy config WITHOUT an eth_call.
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
//
// Decoding goes through the generated bindings rather than a hand-written
// copy of the struct: they are regenerated with the ABI, and — unlike a raw
// parameter decode — they verify the function selector, so a different call
// that happened to share the layout cannot be silently mis-read.

import * as factory from "./abi/StakingFactory/functions";
import * as proxy from "./abi/StakingProxy/functions";

export interface StakingConfig {
  minStakingDeposit: bigint;
  numAgentInstances: bigint;
}

/**
 * Decode a proxy's staking config from the `createStakingInstance`
 * transaction that produced it.
 *
 * Returns null when the calldata is not that call — a factory reached
 * through a router or a multisig batch, say. The caller then skips the
 * proxy, exactly as the subgraph did when its eth_calls reverted. (On
 * Polygon every real InstanceCreated tx is a direct factory call, so this
 * branch does not trigger in practice.)
 */
export function decodeStakingConfig(
  txInput: string | undefined
): StakingConfig | null {
  if (txInput == null || txInput.length < 10) return null;

  // Check the selectors explicitly rather than inferring "not our call" from
  // a thrown error. Returning null here is expensive and quiet — the caller
  // writes no StakingContract, so no TrackedAddress(STAKING), so every later
  // ServiceStaked / RewardClaimed / ServiceUnstaked / ServicesEvicted for
  // that proxy is discarded by isTrackedProxy with no logging at all. One
  // warn line would be the only trace of a whole staking contract's history
  // going missing. So null must mean exactly "this is a different call",
  // never "the bindings regressed" — those must surface.
  if (!hasSelector(txInput, factory.createStakingInstance.sighash)) return null;

  const { initPayload } = factory.createStakingInstance.decode(txInput);
  if (initPayload == null || initPayload.length < 10) return null;
  if (!hasSelector(initPayload, proxy.initialize.sighash)) return null;

  const { _stakingParams } = proxy.initialize.decode(initPayload);
  return {
    minStakingDeposit: _stakingParams.minStakingDeposit,
    numAgentInstances: _stakingParams.numAgentInstances,
  };
}

function hasSelector(data: string, sighash: string): boolean {
  return data.slice(0, 10).toLowerCase() === sighash.toLowerCase();
}
