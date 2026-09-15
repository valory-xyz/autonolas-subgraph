import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, ManyToOne as ManyToOne_, Index as Index_, Relation as Relation_, BigIntColumn as BigIntColumn_, IntColumn as IntColumn_} from "@subsquid/typeorm-store"
import {PoolMetrics} from "./poolMetrics.model"

@Entity_()
export class DailyFees {
    constructor(props?: Partial<DailyFees>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @Index_("idx_daily_fees_pool_8a1eb052")
    @ManyToOne_(() => PoolMetrics, {nullable: true})
    pool!: Relation_<PoolMetrics>

    @Index_("idx_daily_fees_day_timestamp_d18cf6aa")
    @BigIntColumn_({nullable: false})
    dayTimestamp!: bigint

    @BigIntColumn_({nullable: false})
    totalFeesToken0!: bigint

    @BigIntColumn_({nullable: false})
    totalFeesToken1!: bigint

    @IntColumn_({nullable: false})
    swapCount!: number
}
