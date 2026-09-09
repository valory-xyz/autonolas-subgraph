import { address, array, bytes, bytes32, bytes4, string, struct, uint256, uint8 } from '@subsquid/evm-codec'
import { func } from '../abi.support.js'
import type { FunctionArguments, FunctionReturn } from '../abi.support.js'

/** VERSION() */
export const VERSION = func('0xffa1ad74', {}, string)
export type VERSIONParams = FunctionArguments<typeof VERSION>
export type VERSIONReturn = FunctionReturn<typeof VERSION>

/** activityChecker() */
export const activityChecker = func('0x8f9e0a62', {}, address)
export type ActivityCheckerParams = FunctionArguments<typeof activityChecker>
export type ActivityCheckerReturn = FunctionReturn<typeof activityChecker>

/** agentIds(uint256) */
export const agentIds = func('0x56e76058', {
    _0: uint256,
}, uint256)
export type AgentIdsParams = FunctionArguments<typeof agentIds>
export type AgentIdsReturn = FunctionReturn<typeof agentIds>

/** availableRewards() */
export const availableRewards = func('0x879d9090', {}, uint256)
export type AvailableRewardsParams = FunctionArguments<typeof availableRewards>
export type AvailableRewardsReturn = FunctionReturn<typeof availableRewards>

/** balance() */
export const balance = func('0xb69ef8a8', {}, uint256)
export type BalanceParams = FunctionArguments<typeof balance>
export type BalanceReturn = FunctionReturn<typeof balance>

/** calculateStakingLastReward(uint256) */
export const calculateStakingLastReward = func('0x83f9eb22', {
    serviceId: uint256,
}, uint256)
export type CalculateStakingLastRewardParams = FunctionArguments<typeof calculateStakingLastReward>
export type CalculateStakingLastRewardReturn = FunctionReturn<typeof calculateStakingLastReward>

/** calculateStakingReward(uint256) */
export const calculateStakingReward = func('0x7fbe2833', {
    serviceId: uint256,
}, uint256)
export type CalculateStakingRewardParams = FunctionArguments<typeof calculateStakingReward>
export type CalculateStakingRewardReturn = FunctionReturn<typeof calculateStakingReward>

/** checkpoint() */
export const checkpoint = func('0xc2c4c5c1', {}, struct({
    _0: array(uint256),
    _1: array(uint256),
    _2: array(uint256),
    evictServiceIds: array(uint256),
}))
export type CheckpointParams = FunctionArguments<typeof checkpoint>
export type CheckpointReturn = FunctionReturn<typeof checkpoint>

/** checkpointAndClaim(uint256) */
export const checkpointAndClaim = func('0x546af2e0', {
    serviceId: uint256,
}, uint256)
export type CheckpointAndClaimParams = FunctionArguments<typeof checkpointAndClaim>
export type CheckpointAndClaimReturn = FunctionReturn<typeof checkpointAndClaim>

/** claim(uint256) */
export const claim = func('0x379607f5', {
    serviceId: uint256,
}, uint256)
export type ClaimParams = FunctionArguments<typeof claim>
export type ClaimReturn = FunctionReturn<typeof claim>

/** configHash() */
export const configHash = func('0xe1f1176d', {}, bytes32)
export type ConfigHashParams = FunctionArguments<typeof configHash>
export type ConfigHashReturn = FunctionReturn<typeof configHash>

/** deposit(uint256) */
export const deposit = func('0xb6b55f25', {
    amount: uint256,
})
export type DepositParams = FunctionArguments<typeof deposit>
export type DepositReturn = FunctionReturn<typeof deposit>

/** emissionsAmount() */
export const emissionsAmount = func('0x95732361', {}, uint256)
export type EmissionsAmountParams = FunctionArguments<typeof emissionsAmount>
export type EmissionsAmountReturn = FunctionReturn<typeof emissionsAmount>

/** epochCounter() */
export const epochCounter = func('0x14b19c5a', {}, uint256)
export type EpochCounterParams = FunctionArguments<typeof epochCounter>
export type EpochCounterReturn = FunctionReturn<typeof epochCounter>

/** forcedUnstake(uint256) */
export const forcedUnstake = func('0x93ac752f', {
    serviceId: uint256,
})
export type ForcedUnstakeParams = FunctionArguments<typeof forcedUnstake>
export type ForcedUnstakeReturn = FunctionReturn<typeof forcedUnstake>

/** getAgentIds() */
export const getAgentIds = func('0xb1508760', {}, array(uint256))
export type GetAgentIdsParams = FunctionArguments<typeof getAgentIds>
export type GetAgentIdsReturn = FunctionReturn<typeof getAgentIds>

/** getNextRewardCheckpointTimestamp() */
export const getNextRewardCheckpointTimestamp = func('0xf4dce714', {}, uint256)
export type GetNextRewardCheckpointTimestampParams = FunctionArguments<typeof getNextRewardCheckpointTimestamp>
export type GetNextRewardCheckpointTimestampReturn = FunctionReturn<typeof getNextRewardCheckpointTimestamp>

/** getServiceIds() */
export const getServiceIds = func('0xf189e85a', {}, array(uint256))
export type GetServiceIdsParams = FunctionArguments<typeof getServiceIds>
export type GetServiceIdsReturn = FunctionReturn<typeof getServiceIds>

/** getServiceInfo(uint256) */
export const getServiceInfo = func('0x82a8ea58', {
    serviceId: uint256,
}, struct({
    multisig: address,
    owner: address,
    nonces: array(uint256),
    tsStart: uint256,
    reward: uint256,
    inactivity: uint256,
}))
export type GetServiceInfoParams = FunctionArguments<typeof getServiceInfo>
export type GetServiceInfoReturn = FunctionReturn<typeof getServiceInfo>

/** getStakingState(uint256) */
export const getStakingState = func('0xfd0bba8c', {
    serviceId: uint256,
}, uint8)
export type GetStakingStateParams = FunctionArguments<typeof getStakingState>
export type GetStakingStateReturn = FunctionReturn<typeof getStakingState>

/** initialize((bytes32,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256[],uint256,bytes32,bytes32,address,address),address,address) */
export const initialize = func('0xb267c67b', {
    _stakingParams: struct({
        metadataHash: bytes32,
        maxNumServices: uint256,
        rewardsPerSecond: uint256,
        minStakingDeposit: uint256,
        minNumStakingPeriods: uint256,
        maxNumInactivityPeriods: uint256,
        livenessPeriod: uint256,
        timeForEmissions: uint256,
        numAgentInstances: uint256,
        agentIds: array(uint256),
        threshold: uint256,
        configHash: bytes32,
        proxyHash: bytes32,
        serviceRegistry: address,
        activityChecker: address,
    }),
    _serviceRegistryTokenUtility: address,
    _stakingToken: address,
})
export type InitializeParams = FunctionArguments<typeof initialize>
export type InitializeReturn = FunctionReturn<typeof initialize>

/** livenessPeriod() */
export const livenessPeriod = func('0x52c824f5', {}, uint256)
export type LivenessPeriodParams = FunctionArguments<typeof livenessPeriod>
export type LivenessPeriodReturn = FunctionReturn<typeof livenessPeriod>

/** mapServiceInfo(uint256) */
export const mapServiceInfo = func('0xa74466ad', {
    _0: uint256,
}, struct({
    multisig: address,
    owner: address,
    tsStart: uint256,
    reward: uint256,
    inactivity: uint256,
}))
export type MapServiceInfoParams = FunctionArguments<typeof mapServiceInfo>
export type MapServiceInfoReturn = FunctionReturn<typeof mapServiceInfo>

/** maxInactivityDuration() */
export const maxInactivityDuration = func('0xf86ad2b6', {}, uint256)
export type MaxInactivityDurationParams = FunctionArguments<typeof maxInactivityDuration>
export type MaxInactivityDurationReturn = FunctionReturn<typeof maxInactivityDuration>

/** maxNumInactivityPeriods() */
export const maxNumInactivityPeriods = func('0xa0ed60e0', {}, uint256)
export type MaxNumInactivityPeriodsParams = FunctionArguments<typeof maxNumInactivityPeriods>
export type MaxNumInactivityPeriodsReturn = FunctionReturn<typeof maxNumInactivityPeriods>

/** maxNumServices() */
export const maxNumServices = func('0x16a75172', {}, uint256)
export type MaxNumServicesParams = FunctionArguments<typeof maxNumServices>
export type MaxNumServicesReturn = FunctionReturn<typeof maxNumServices>

/** metadataHash() */
export const metadataHash = func('0xc5a1d7f0', {}, bytes32)
export type MetadataHashParams = FunctionArguments<typeof metadataHash>
export type MetadataHashReturn = FunctionReturn<typeof metadataHash>

/** minStakingDeposit() */
export const minStakingDeposit = func('0xe77cdcc9', {}, uint256)
export type MinStakingDepositParams = FunctionArguments<typeof minStakingDeposit>
export type MinStakingDepositReturn = FunctionReturn<typeof minStakingDeposit>

/** minStakingDuration() */
export const minStakingDuration = func('0x08ae7e54', {}, uint256)
export type MinStakingDurationParams = FunctionArguments<typeof minStakingDuration>
export type MinStakingDurationReturn = FunctionReturn<typeof minStakingDuration>

/** numAgentInstances() */
export const numAgentInstances = func('0x5829c5ec', {}, uint256)
export type NumAgentInstancesParams = FunctionArguments<typeof numAgentInstances>
export type NumAgentInstancesReturn = FunctionReturn<typeof numAgentInstances>

/** onERC721Received(address,address,uint256,bytes) */
export const onERC721Received = func('0x150b7a02', {
    _0: address,
    _1: address,
    _2: uint256,
    _3: bytes,
}, bytes4)
export type OnERC721ReceivedParams = FunctionArguments<typeof onERC721Received>
export type OnERC721ReceivedReturn = FunctionReturn<typeof onERC721Received>

/** proxyHash() */
export const proxyHash = func('0x809cee2f', {}, bytes32)
export type ProxyHashParams = FunctionArguments<typeof proxyHash>
export type ProxyHashReturn = FunctionReturn<typeof proxyHash>

/** rewardsPerSecond() */
export const rewardsPerSecond = func('0xeacdaabc', {}, uint256)
export type RewardsPerSecondParams = FunctionArguments<typeof rewardsPerSecond>
export type RewardsPerSecondReturn = FunctionReturn<typeof rewardsPerSecond>

/** serviceRegistry() */
export const serviceRegistry = func('0xcbcf252a', {}, address)
export type ServiceRegistryParams = FunctionArguments<typeof serviceRegistry>
export type ServiceRegistryReturn = FunctionReturn<typeof serviceRegistry>

/** serviceRegistryTokenUtility() */
export const serviceRegistryTokenUtility = func('0x28714051', {}, address)
export type ServiceRegistryTokenUtilityParams = FunctionArguments<typeof serviceRegistryTokenUtility>
export type ServiceRegistryTokenUtilityReturn = FunctionReturn<typeof serviceRegistryTokenUtility>

/** setServiceIds(uint256) */
export const setServiceIds = func('0xeb338c96', {
    _0: uint256,
}, uint256)
export type SetServiceIdsParams = FunctionArguments<typeof setServiceIds>
export type SetServiceIdsReturn = FunctionReturn<typeof setServiceIds>

/** stake(uint256) */
export const stake = func('0xa694fc3a', {
    serviceId: uint256,
})
export type StakeParams = FunctionArguments<typeof stake>
export type StakeReturn = FunctionReturn<typeof stake>

/** stakingToken() */
export const stakingToken = func('0x72f702f3', {}, address)
export type StakingTokenParams = FunctionArguments<typeof stakingToken>
export type StakingTokenReturn = FunctionReturn<typeof stakingToken>

/** threshold() */
export const threshold = func('0x42cde4e8', {}, uint256)
export type ThresholdParams = FunctionArguments<typeof threshold>
export type ThresholdReturn = FunctionReturn<typeof threshold>

/** timeForEmissions() */
export const timeForEmissions = func('0x1f779408', {}, uint256)
export type TimeForEmissionsParams = FunctionArguments<typeof timeForEmissions>
export type TimeForEmissionsReturn = FunctionReturn<typeof timeForEmissions>

/** tsCheckpoint() */
export const tsCheckpoint = func('0x3e732997', {}, uint256)
export type TsCheckpointParams = FunctionArguments<typeof tsCheckpoint>
export type TsCheckpointReturn = FunctionReturn<typeof tsCheckpoint>

/** unstake(uint256) */
export const unstake = func('0x2e17de78', {
    serviceId: uint256,
}, uint256)
export type UnstakeParams = FunctionArguments<typeof unstake>
export type UnstakeReturn = FunctionReturn<typeof unstake>
