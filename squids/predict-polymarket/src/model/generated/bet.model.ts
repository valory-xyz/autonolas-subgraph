import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, ManyToOne as ManyToOne_, Index as Index_, Relation as Relation_, BigIntColumn as BigIntColumn_, BooleanColumn as BooleanColumn_, StringColumn as StringColumn_} from "@subsquid/typeorm-store"
import {TraderAgent} from "./traderAgent.model"
import {Question} from "./question.model"
import {MarketParticipant} from "./marketParticipant.model"
import {DailyProfitStatistic} from "./dailyProfitStatistic.model"

@Entity_()
export class Bet {
    constructor(props?: Partial<Bet>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @Index_("idx_bet_bettor_e6313900")
    @ManyToOne_(() => TraderAgent, {nullable: true})
    bettor!: Relation_<TraderAgent>

    @BigIntColumn_({nullable: false})
    outcomeIndex!: bigint

    @BigIntColumn_({nullable: false})
    amount!: bigint

    @BigIntColumn_({nullable: false})
    shares!: bigint

    @BooleanColumn_({nullable: false})
    isBuy!: boolean

    @BigIntColumn_({nullable: false})
    impliedProbability!: bigint

    @BooleanColumn_({nullable: false})
    countedInTotal!: boolean

    @BooleanColumn_({nullable: false})
    countedInProfit!: boolean

    @Index_("idx_bet_question_1a1f0dde")
    @ManyToOne_(() => Question, {nullable: true})
    question!: Relation_<Question> | undefined | null

    @Index_("idx_bet_market_participant_1ec0f619")
    @ManyToOne_(() => MarketParticipant, {nullable: true})
    marketParticipant!: Relation_<MarketParticipant> | undefined | null

    @Index_("idx_bet_daily_statistic_4b4e0ba0")
    @ManyToOne_(() => DailyProfitStatistic, {nullable: true})
    dailyStatistic!: Relation_<DailyProfitStatistic> | undefined | null

    @StringColumn_({nullable: true})
    builder!: string | undefined | null

    @StringColumn_({nullable: true})
    metadata!: string | undefined | null

    @BigIntColumn_({nullable: false})
    blockTimestamp!: bigint

    @StringColumn_({nullable: false})
    transactionHash!: string
}
