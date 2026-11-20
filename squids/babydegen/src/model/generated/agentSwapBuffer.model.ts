import {BigDecimal} from "@subsquid/big-decimal"
import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, StringColumn as StringColumn_, BigDecimalColumn as BigDecimalColumn_, BigIntColumn as BigIntColumn_} from "@subsquid/typeorm-store"

@Entity_()
export class AgentSwapBuffer {
    constructor(props?: Partial<AgentSwapBuffer>) {
        Object.assign(this, props)
    }

    /**
     * Service safe address
     */
    @PrimaryColumn_()
    id!: string

    @StringColumn_({nullable: false})
    agent!: string

    @StringColumn_({nullable: false})
    bucket0Swaps!: string

    @StringColumn_({nullable: false})
    bucket1Swaps!: string

    @StringColumn_({nullable: false})
    bucket2Swaps!: string

    @StringColumn_({nullable: false})
    bucket3Swaps!: string

    @BigDecimalColumn_({nullable: false})
    totalSlippageUSD!: BigDecimal

    @BigIntColumn_({nullable: false})
    lastUpdated!: bigint

    @BigIntColumn_({nullable: false})
    currentBucketIndex!: bigint
}
