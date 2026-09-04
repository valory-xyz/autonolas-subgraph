import { ContractBase } from '../abi.support.js'
import { VERSION, activityChecker, agentIds, availableRewards, balance, calculateStakingLastReward, calculateStakingReward, checkpoint, checkpointAndClaim, claim, configHash, emissionsAmount, epochCounter, getAgentIds, getNextRewardCheckpointTimestamp, getServiceIds, getServiceInfo, getStakingState, livenessPeriod, mapServiceInfo, maxInactivityDuration, maxNumInactivityPeriods, maxNumServices, metadataHash, minStakingDeposit, minStakingDuration, numAgentInstances, onERC721Received, proxyHash, rewardsPerSecond, serviceRegistry, serviceRegistryTokenUtility, setServiceIds, stakingToken, threshold, timeForEmissions, tsCheckpoint, unstake } from './functions.js'
import type { AgentIdsParams, CalculateStakingLastRewardParams, CalculateStakingRewardParams, CheckpointAndClaimParams, ClaimParams, GetServiceInfoParams, GetStakingStateParams, MapServiceInfoParams, OnERC721ReceivedParams, SetServiceIdsParams, UnstakeParams } from './functions.js'

export class Contract extends ContractBase {
    VERSION() {
        return this.eth_call(VERSION, {})
    }

    activityChecker() {
        return this.eth_call(activityChecker, {})
    }

    agentIds(_0: AgentIdsParams["_0"]) {
        return this.eth_call(agentIds, {_0})
    }

    availableRewards() {
        return this.eth_call(availableRewards, {})
    }

    balance() {
        return this.eth_call(balance, {})
    }

    calculateStakingLastReward(serviceId: CalculateStakingLastRewardParams["serviceId"]) {
        return this.eth_call(calculateStakingLastReward, {serviceId})
    }

    calculateStakingReward(serviceId: CalculateStakingRewardParams["serviceId"]) {
        return this.eth_call(calculateStakingReward, {serviceId})
    }

    checkpoint() {
        return this.eth_call(checkpoint, {})
    }

    checkpointAndClaim(serviceId: CheckpointAndClaimParams["serviceId"]) {
        return this.eth_call(checkpointAndClaim, {serviceId})
    }

    claim(serviceId: ClaimParams["serviceId"]) {
        return this.eth_call(claim, {serviceId})
    }

    configHash() {
        return this.eth_call(configHash, {})
    }

    emissionsAmount() {
        return this.eth_call(emissionsAmount, {})
    }

    epochCounter() {
        return this.eth_call(epochCounter, {})
    }

    getAgentIds() {
        return this.eth_call(getAgentIds, {})
    }

    getNextRewardCheckpointTimestamp() {
        return this.eth_call(getNextRewardCheckpointTimestamp, {})
    }

    getServiceIds() {
        return this.eth_call(getServiceIds, {})
    }

    getServiceInfo(serviceId: GetServiceInfoParams["serviceId"]) {
        return this.eth_call(getServiceInfo, {serviceId})
    }

    getStakingState(serviceId: GetStakingStateParams["serviceId"]) {
        return this.eth_call(getStakingState, {serviceId})
    }

    livenessPeriod() {
        return this.eth_call(livenessPeriod, {})
    }

    mapServiceInfo(_0: MapServiceInfoParams["_0"]) {
        return this.eth_call(mapServiceInfo, {_0})
    }

    maxInactivityDuration() {
        return this.eth_call(maxInactivityDuration, {})
    }

    maxNumInactivityPeriods() {
        return this.eth_call(maxNumInactivityPeriods, {})
    }

    maxNumServices() {
        return this.eth_call(maxNumServices, {})
    }

    metadataHash() {
        return this.eth_call(metadataHash, {})
    }

    minStakingDeposit() {
        return this.eth_call(minStakingDeposit, {})
    }

    minStakingDuration() {
        return this.eth_call(minStakingDuration, {})
    }

    numAgentInstances() {
        return this.eth_call(numAgentInstances, {})
    }

    onERC721Received(_0: OnERC721ReceivedParams["_0"], _1: OnERC721ReceivedParams["_1"], _2: OnERC721ReceivedParams["_2"], _3: OnERC721ReceivedParams["_3"]) {
        return this.eth_call(onERC721Received, {_0, _1, _2, _3})
    }

    proxyHash() {
        return this.eth_call(proxyHash, {})
    }

    rewardsPerSecond() {
        return this.eth_call(rewardsPerSecond, {})
    }

    serviceRegistry() {
        return this.eth_call(serviceRegistry, {})
    }

    serviceRegistryTokenUtility() {
        return this.eth_call(serviceRegistryTokenUtility, {})
    }

    setServiceIds(_0: SetServiceIdsParams["_0"]) {
        return this.eth_call(setServiceIds, {_0})
    }

    stakingToken() {
        return this.eth_call(stakingToken, {})
    }

    threshold() {
        return this.eth_call(threshold, {})
    }

    timeForEmissions() {
        return this.eth_call(timeForEmissions, {})
    }

    tsCheckpoint() {
        return this.eth_call(tsCheckpoint, {})
    }

    unstake(serviceId: UnstakeParams["serviceId"]) {
        return this.eth_call(unstake, {serviceId})
    }
}
