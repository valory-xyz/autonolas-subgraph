import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, BigIntColumn as BigIntColumn_, IntColumn as IntColumn_, OneToMany as OneToMany_, Relation as Relation_, StringColumn as StringColumn_} from "@subsquid/typeorm-store"
import {Bet} from "./bet.model"
import {DailyProfitStatistic} from "./dailyProfitStatistic.model"

@Entity_()
export class TraderAgent {
    constructor(props?: Partial<TraderAgent>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @BigIntColumn_({nullable: false})
    serviceId!: bigint

    @BigIntColumn_({nullable: true})
    firstParticipation!: bigint | undefined | null

    @BigIntColumn_({nullable: true})
    lastActive!: bigint | undefined | null

    @IntColumn_({nullable: false})
    totalBets!: number

    @BigIntColumn_({nullable: false})
    totalTraded!: bigint

    @BigIntColumn_({nullable: false})
    totalTradedSettled!: bigint

    @BigIntColumn_({nullable: false})
    totalPayout!: bigint

    @BigIntColumn_({nullable: false})
    totalExpectedPayout!: bigint

    @OneToMany_(() => Bet, e => e.bettor)
    bets!: Relation_<Bet[]>

    @OneToMany_(() => DailyProfitStatistic, e => e.traderAgent)
    dailyProfitStatistics!: Relation_<DailyProfitStatistic[]>

    @BigIntColumn_({nullable: false})
    blockNumber!: bigint

    @BigIntColumn_({nullable: false})
    blockTimestamp!: bigint

    @StringColumn_({nullable: false})
    transactionHash!: string
}
