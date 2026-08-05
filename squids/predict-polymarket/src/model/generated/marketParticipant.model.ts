import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, ManyToOne as ManyToOne_, Index as Index_, Relation as Relation_, IntColumn as IntColumn_, BigIntColumn as BigIntColumn_, BooleanColumn as BooleanColumn_, OneToMany as OneToMany_, StringColumn as StringColumn_} from "@subsquid/typeorm-store"
import {TraderAgent} from "./traderAgent.model"
import {Question} from "./question.model"
import {Bet} from "./bet.model"

@Entity_()
export class MarketParticipant {
    constructor(props?: Partial<MarketParticipant>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @Index_("idx_market_participant_trader_agent_2b028c23")
    @ManyToOne_(() => TraderAgent, {nullable: true})
    traderAgent!: Relation_<TraderAgent>

    @Index_("idx_market_participant_question_568c5119")
    @ManyToOne_(() => Question, {nullable: true})
    question!: Relation_<Question> | undefined | null

    @IntColumn_({nullable: false})
    totalBets!: number

    @BigIntColumn_({nullable: false})
    totalTraded!: bigint

    @BigIntColumn_({nullable: false})
    totalTradedSettled!: bigint

    @BigIntColumn_({nullable: false})
    totalPayout!: bigint

    @BigIntColumn_({nullable: false})
    outcomeShares0!: bigint

    @BigIntColumn_({nullable: false})
    outcomeShares1!: bigint

    @BigIntColumn_({nullable: false})
    expectedPayout!: bigint

    /**
     * True once resolution processed this participant. false means either awaiting resolution OR permanently orphaned (question is null — the market's metadata was rejected and it can never settle; filter with question_isNull).
     */
    @BooleanColumn_({nullable: false})
    settled!: boolean

    @OneToMany_(() => Bet, e => e.marketParticipant)
    bets!: Relation_<Bet[]>

    @BigIntColumn_({nullable: false})
    createdAt!: bigint

    @BigIntColumn_({nullable: false})
    blockNumber!: bigint

    @BigIntColumn_({nullable: false})
    blockTimestamp!: bigint

    @StringColumn_({nullable: false})
    transactionHash!: string
}
