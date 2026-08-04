import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, ManyToOne as ManyToOne_, Index as Index_, Relation as Relation_, StringColumn as StringColumn_, BigIntColumn as BigIntColumn_} from "@subsquid/typeorm-store"
import {TraderAgent} from "./traderAgent.model"

/**
 * Maps a Polymarket CLOB v2 DepositWallet to the Olas service safe that funds it (via WalletDeployed owner EOA).
 */
@Entity_()
export class DepositWallet {
    constructor(props?: Partial<DepositWallet>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @Index_("idx_deposit_wallet_trader_agent_3e2a8bf0")
    @ManyToOne_(() => TraderAgent, {nullable: true})
    traderAgent!: Relation_<TraderAgent>

    @StringColumn_({nullable: false})
    agentInstance!: string

    @BigIntColumn_({nullable: false})
    blockNumber!: bigint

    @BigIntColumn_({nullable: false})
    blockTimestamp!: bigint

    @StringColumn_({nullable: false})
    transactionHash!: string
}
