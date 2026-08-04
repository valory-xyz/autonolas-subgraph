import { address, array, bytes, bytes32, int256, uint256 } from '@subsquid/evm-codec'
import { event, indexed } from '../abi.support.js'
import type { EventParams as EParams } from '../abi.support.js'

/** AncillaryDataUpdated(bytes32,address,bytes) */
export const AncillaryDataUpdated = event('0x0059e11815211969c0c4aaf3f498b52b6c2f2d14f286275d0862d70de22a836b', {
    questionID: indexed(bytes32),
    owner: indexed(address),
    update: bytes,
})
export type AncillaryDataUpdatedEventArgs = EParams<typeof AncillaryDataUpdated>

/** NewAdmin(address,address) */
export const NewAdmin = event('0xf9ffabca9c8276e99321725bcb43fb076a6c66a54b7f21c4e8146d8519b417dc', {
    admin: indexed(address),
    newAdminAddress: indexed(address),
})
export type NewAdminEventArgs = EParams<typeof NewAdmin>

/** QuestionFlagged(bytes32) */
export const QuestionFlagged = event('0x2435a0347185933b12027c6f394a5fd9c03646dba233e956f50658719dfc0b35', {
    questionID: indexed(bytes32),
})
export type QuestionFlaggedEventArgs = EParams<typeof QuestionFlagged>

/** QuestionInitialized(bytes32,uint256,address,bytes,address,uint256,uint256) */
export const QuestionInitialized = event('0xeee0897acd6893adcaf2ba5158191b3601098ab6bece35c5d57874340b64c5b7', {
    questionID: indexed(bytes32),
    requestTimestamp: indexed(uint256),
    creator: indexed(address),
    ancillaryData: bytes,
    rewardToken: address,
    reward: uint256,
    proposalBond: uint256,
})
export type QuestionInitializedEventArgs = EParams<typeof QuestionInitialized>

/** QuestionManuallyResolved(bytes32,uint256[]) */
export const QuestionManuallyResolved = event('0x5909815fe7fe0a550d5fcb95fbf33821b580521d3c97089c6ce12808d1cd0566', {
    questionID: indexed(bytes32),
    payouts: array(uint256),
})
export type QuestionManuallyResolvedEventArgs = EParams<typeof QuestionManuallyResolved>

/** QuestionPaused(bytes32) */
export const QuestionPaused = event('0x6ded7250a9d5f79aef5add44600fc20a74a0af6f4730baa4fc4ab87bf484b812', {
    questionID: indexed(bytes32),
})
export type QuestionPausedEventArgs = EParams<typeof QuestionPaused>

/** QuestionReset(bytes32) */
export const QuestionReset = event('0x7981b5832932948db4e32a4a16a0f44b2ce7ff088574afb9364b313f70f82e8f', {
    questionID: indexed(bytes32),
})
export type QuestionResetEventArgs = EParams<typeof QuestionReset>

/** QuestionResolved(bytes32,int256,uint256[]) */
export const QuestionResolved = event('0x566c3fbdd12dd86bb341787f6d531f79fd7ad4ce7e3ae2d15ac0ca1b601af9df', {
    questionID: indexed(bytes32),
    settledPrice: indexed(int256),
    payouts: array(uint256),
})
export type QuestionResolvedEventArgs = EParams<typeof QuestionResolved>

/** QuestionUnflagged(bytes32) */
export const QuestionUnflagged = event('0x052435bc04fc49113a7bfd9198a92c0852ca622a621800f6da66d4b29b786c05', {
    questionID: indexed(bytes32),
})
export type QuestionUnflaggedEventArgs = EParams<typeof QuestionUnflagged>

/** QuestionUnpaused(bytes32) */
export const QuestionUnpaused = event('0x92d28918c5574e7fc0f4f948c39502682c81cfb4089b07b83f95b3264e5e5e06', {
    questionID: indexed(bytes32),
})
export type QuestionUnpausedEventArgs = EParams<typeof QuestionUnpaused>

/** RemovedAdmin(address,address) */
export const RemovedAdmin = event('0x787a2e12f4a55b658b8f573c32432ee11a5e8b51677d1e1e937aaf6a0bb5776e', {
    admin: indexed(address),
    removedAdmin: indexed(address),
})
export type RemovedAdminEventArgs = EParams<typeof RemovedAdmin>
