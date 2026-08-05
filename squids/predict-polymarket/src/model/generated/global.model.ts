import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, IntColumn as IntColumn_, BigIntColumn as BigIntColumn_} from "@subsquid/typeorm-store"

@Entity_()
export class Global {
    constructor(props?: Partial<Global>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @IntColumn_({nullable: false})
    totalTraderAgents!: number

    @IntColumn_({nullable: false})
    totalActiveTraderAgents!: number

    @IntColumn_({nullable: false})
    totalBets!: number

    @BigIntColumn_({nullable: false})
    totalPayout!: bigint

    @BigIntColumn_({nullable: false})
    totalTraded!: bigint

    @BigIntColumn_({nullable: false})
    totalTradedSettled!: bigint

    @BigIntColumn_({nullable: false})
    totalExpectedPayout!: bigint

    @IntColumn_({nullable: false})
    totalMarketsParticipated!: number
}
