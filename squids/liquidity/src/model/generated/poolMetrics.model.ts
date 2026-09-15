import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, StringColumn as StringColumn_, BigIntColumn as BigIntColumn_, OneToMany as OneToMany_, Relation as Relation_} from "@subsquid/typeorm-store"
import {BPTTransfer} from "./bptTransfer.model"
import {DailyFees} from "./dailyFees.model"

@Entity_()
export class PoolMetrics {
    constructor(props?: Partial<PoolMetrics>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @StringColumn_({nullable: false})
    dex!: string

    @StringColumn_({nullable: true})
    poolId!: string | undefined | null

    @StringColumn_({nullable: true})
    token0!: string | undefined | null

    @StringColumn_({nullable: true})
    token1!: string | undefined | null

    @BigIntColumn_({nullable: false})
    reserve0!: bigint

    @BigIntColumn_({nullable: false})
    reserve1!: bigint

    @BigIntColumn_({nullable: false})
    totalSupply!: bigint

    @BigIntColumn_({nullable: false})
    reservesRefreshedAtBlock!: bigint

    @BigIntColumn_({nullable: false})
    totalMinted!: bigint

    @BigIntColumn_({nullable: false})
    totalBurned!: bigint

    @BigIntColumn_({nullable: false})
    cumulativeFeesToken0!: bigint

    @BigIntColumn_({nullable: false})
    cumulativeFeesToken1!: bigint

    @BigIntColumn_({nullable: false})
    swapFeePercentage!: bigint

    @BigIntColumn_({nullable: false})
    nativeUsdPrice!: bigint

    @BigIntColumn_({nullable: false})
    lastUpdatedBlock!: bigint

    @BigIntColumn_({nullable: false})
    lastUpdatedTimestamp!: bigint

    @StringColumn_({nullable: false})
    lastUpdatedTransaction!: string

    @OneToMany_(() => BPTTransfer, e => e.pool)
    transfers!: Relation_<BPTTransfer[]>

    @OneToMany_(() => DailyFees, e => e.pool)
    dailyFees!: Relation_<DailyFees[]>
}
