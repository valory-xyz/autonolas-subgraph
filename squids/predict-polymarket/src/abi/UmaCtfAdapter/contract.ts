import { ContractBase } from '../abi.support.js'
import { EMERGENCY_SAFETY_PERIOD, MAX_ANCILLARY_DATA, YES_OR_NO_IDENTIFIER, admins, collateralWhitelist, ctf, getExpectedPayouts, getLatestUpdate, getQuestion, getUpdates, initialize, isAdmin, isFlagged, isInitialized, optimisticOracle, questions, ready, updates } from './functions.js'
import type { AdminsParams, GetExpectedPayoutsParams, GetLatestUpdateParams, GetQuestionParams, GetUpdatesParams, InitializeParams, IsAdminParams, IsFlaggedParams, IsInitializedParams, QuestionsParams, ReadyParams, UpdatesParams } from './functions.js'

export class Contract extends ContractBase {
    EMERGENCY_SAFETY_PERIOD() {
        return this.eth_call(EMERGENCY_SAFETY_PERIOD, {})
    }

    MAX_ANCILLARY_DATA() {
        return this.eth_call(MAX_ANCILLARY_DATA, {})
    }

    YES_OR_NO_IDENTIFIER() {
        return this.eth_call(YES_OR_NO_IDENTIFIER, {})
    }

    admins(_0: AdminsParams["_0"]) {
        return this.eth_call(admins, {_0})
    }

    collateralWhitelist() {
        return this.eth_call(collateralWhitelist, {})
    }

    ctf() {
        return this.eth_call(ctf, {})
    }

    getExpectedPayouts(questionID: GetExpectedPayoutsParams["questionID"]) {
        return this.eth_call(getExpectedPayouts, {questionID})
    }

    getLatestUpdate(questionID: GetLatestUpdateParams["questionID"], owner: GetLatestUpdateParams["owner"]) {
        return this.eth_call(getLatestUpdate, {questionID, owner})
    }

    getQuestion(questionID: GetQuestionParams["questionID"]) {
        return this.eth_call(getQuestion, {questionID})
    }

    getUpdates(questionID: GetUpdatesParams["questionID"], owner: GetUpdatesParams["owner"]) {
        return this.eth_call(getUpdates, {questionID, owner})
    }

    initialize(ancillaryData: InitializeParams["ancillaryData"], rewardToken: InitializeParams["rewardToken"], reward: InitializeParams["reward"], proposalBond: InitializeParams["proposalBond"], liveness: InitializeParams["liveness"]) {
        return this.eth_call(initialize, {ancillaryData, rewardToken, reward, proposalBond, liveness})
    }

    isAdmin(addr: IsAdminParams["addr"]) {
        return this.eth_call(isAdmin, {addr})
    }

    isFlagged(questionID: IsFlaggedParams["questionID"]) {
        return this.eth_call(isFlagged, {questionID})
    }

    isInitialized(questionID: IsInitializedParams["questionID"]) {
        return this.eth_call(isInitialized, {questionID})
    }

    optimisticOracle() {
        return this.eth_call(optimisticOracle, {})
    }

    questions(_0: QuestionsParams["_0"]) {
        return this.eth_call(questions, {_0})
    }

    ready(questionID: ReadyParams["questionID"]) {
        return this.eth_call(ready, {questionID})
    }

    updates(_0: UpdatesParams["_0"], _1: UpdatesParams["_1"]) {
        return this.eth_call(updates, {_0, _1})
    }
}
