import { ContractBase } from '../abi.support.js'
import { allowance, approve, balanceOf, decreaseAllowance, increaseAllowance, totalSupply, transfer, transferFrom } from './functions.js'
import type { AllowanceParams, ApproveParams, BalanceOfParams, DecreaseAllowanceParams, IncreaseAllowanceParams, TransferFromParams, TransferParams } from './functions.js'

export class Contract extends ContractBase {
    totalSupply() {
        return this.eth_call(totalSupply, {})
    }

    balanceOf(account: BalanceOfParams["account"]) {
        return this.eth_call(balanceOf, {account})
    }

    transfer(recipient: TransferParams["recipient"], amount: TransferParams["amount"]) {
        return this.eth_call(transfer, {recipient, amount})
    }

    allowance(owner: AllowanceParams["owner"], spender: AllowanceParams["spender"]) {
        return this.eth_call(allowance, {owner, spender})
    }

    approve(spender: ApproveParams["spender"], amount: ApproveParams["amount"]) {
        return this.eth_call(approve, {spender, amount})
    }

    transferFrom(sender: TransferFromParams["sender"], recipient: TransferFromParams["recipient"], amount: TransferFromParams["amount"]) {
        return this.eth_call(transferFrom, {sender, recipient, amount})
    }

    increaseAllowance(spender: IncreaseAllowanceParams["spender"], addedValue: IncreaseAllowanceParams["addedValue"]) {
        return this.eth_call(increaseAllowance, {spender, addedValue})
    }

    decreaseAllowance(spender: DecreaseAllowanceParams["spender"], subtractedValue: DecreaseAllowanceParams["subtractedValue"]) {
        return this.eth_call(decreaseAllowance, {spender, subtractedValue})
    }
}
