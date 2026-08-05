import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, ManyToOne as ManyToOne_, Index as Index_, Relation as Relation_, StringColumn as StringColumn_, BigIntColumn as BigIntColumn_} from "@subsquid/typeorm-store"
import {TraderAgent} from "./traderAgent.model"
import {Question} from "./question.model"

/**
 * Immutable log entity for every PayoutRedemption/PositionsRedeemed event (debugging/auditing).
 */
@Entity_()
export class PayoutRedemptionEntity {
    constructor(props?: Partial<PayoutRedemptionEntity>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @Index_("idx_payout_redemption_entity_redeemer_da4c5e50")
    @ManyToOne_(() => TraderAgent, {nullable: true})
    redeemer!: Relation_<TraderAgent>

    @StringColumn_({nullable: false})
    conditionId!: string

    @Index_("idx_payout_redemption_entity_question_cc4f14f1")
    @ManyToOne_(() => Question, {nullable: true})
    question!: Relation_<Question> | undefined | null

    @BigIntColumn_({nullable: false})
    payoutAmount!: bigint

    @BigIntColumn_({nullable: false})
    blockNumber!: bigint

    @BigIntColumn_({nullable: false})
    blockTimestamp!: bigint

    @StringColumn_({nullable: false})
    transactionHash!: string
}
