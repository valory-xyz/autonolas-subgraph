import {BigDecimal} from "@subsquid/big-decimal"
import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, StringColumn as StringColumn_, BigIntColumn as BigIntColumn_, BigDecimalColumn as BigDecimalColumn_, BooleanColumn as BooleanColumn_} from "@subsquid/typeorm-store"

@Entity_()
export class SwapTransaction {
    constructor(props?: Partial<SwapTransaction>) {
        Object.assign(this, props)
    }

    /**
     * txHash ++ utf8hex('-' + logIndex)
     */
    @PrimaryColumn_()
    id!: string

    @StringColumn_({nullable: false})
    agent!: string

    @StringColumn_({nullable: false})
    transactionId!: string

    @StringColumn_({nullable: false})
    txHash!: string

    @BigIntColumn_({nullable: false})
    timestamp!: bigint

    @BigIntColumn_({nullable: false})
    block!: bigint

    @StringColumn_({nullable: false})
    fromAssetId!: string

    @StringColumn_({nullable: false})
    toAssetId!: string

    @BigIntColumn_({nullable: false})
    fromAmount!: bigint

    @BigIntColumn_({nullable: false})
    toAmount!: bigint

    @BigDecimalColumn_({nullable: false})
    fromAmountUSD!: BigDecimal

    @BigDecimalColumn_({nullable: false})
    toAmountUSD!: BigDecimal

    @BigDecimalColumn_({nullable: false})
    expectedToAmountUSD!: BigDecimal

    @BigDecimalColumn_({nullable: false})
    slippageUSD!: BigDecimal

    @BigDecimalColumn_({nullable: false})
    slippagePercentage!: BigDecimal

    @BooleanColumn_({nullable: false})
    isAssociated!: boolean

    @BigIntColumn_({nullable: false})
    expiresAt!: bigint
}
