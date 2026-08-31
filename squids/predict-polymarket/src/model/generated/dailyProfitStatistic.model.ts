import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, ManyToOne as ManyToOne_, Index as Index_, Relation as Relation_, BigIntColumn as BigIntColumn_, OneToMany as OneToMany_, IntColumn as IntColumn_, StringColumn as StringColumn_} from "@subsquid/typeorm-store"
import {TraderAgent} from "./traderAgent.model"
import {Bet} from "./bet.model"

@Entity_()
export class DailyProfitStatistic {
    constructor(props?: Partial<DailyProfitStatistic>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @Index_("idx_daily_profit_statistic_trader_agent_293b2e72")
    @ManyToOne_(() => TraderAgent, {nullable: true})
    traderAgent!: Relation_<TraderAgent>

    @Index_("idx_daily_profit_statistic_date_1e7af961")
    @BigIntColumn_({nullable: false})
    date!: bigint

    @OneToMany_(() => Bet, e => e.dailyStatistic)
    bets!: Relation_<Bet[]>

    @IntColumn_({nullable: false})
    totalBets!: number

    @BigIntColumn_({nullable: false})
    totalTraded!: bigint

    @BigIntColumn_({nullable: false})
    totalPayout!: bigint

    @BigIntColumn_({nullable: false})
    dailyTradedSettled!: bigint

    @BigIntColumn_({nullable: false})
    dailyProfit!: bigint

    @StringColumn_({array: true, nullable: false})
    profitParticipants!: (string)[]

    @BigIntColumn_({nullable: false})
    brierSum!: bigint

    @IntColumn_({nullable: false})
    brierCount!: number
}
