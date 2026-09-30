import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, BigIntColumn as BigIntColumn_, IntColumn as IntColumn_} from "@subsquid/typeorm-store"

@Entity_()
export class CumulativeDailyStakingGlobal {
    constructor(props?: Partial<CumulativeDailyStakingGlobal>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @BigIntColumn_({nullable: false})
    timestamp!: bigint

    @BigIntColumn_({nullable: false})
    block!: bigint

    @BigIntColumn_({nullable: false})
    totalRewards!: bigint

    @BigIntColumn_({nullable: false})
    totalRewardsClaimed!: bigint

    @IntColumn_({nullable: false})
    numServices!: number

    @BigIntColumn_({nullable: false})
    medianCumulativeRewards!: bigint
}
