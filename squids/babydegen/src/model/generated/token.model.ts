import {BigDecimal} from "@subsquid/big-decimal"
import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, StringColumn as StringColumn_, BigIntColumn as BigIntColumn_, BigDecimalColumn as BigDecimalColumn_} from "@subsquid/typeorm-store"

@Entity_()
export class Token {
    constructor(props?: Partial<Token>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @StringColumn_({nullable: false})
    symbol!: string

    @StringColumn_({nullable: false})
    name!: string

    @BigIntColumn_({nullable: false})
    decimals!: bigint

    @BigDecimalColumn_({nullable: false})
    derivedUSD!: BigDecimal

    /**
     * PriceSource ids (graph-node returned the entities)
     */
    @StringColumn_({array: true, nullable: false})
    priceSources!: (string)[]

    @BigIntColumn_({nullable: false})
    lastPriceUpdate!: bigint

    @BigDecimalColumn_({nullable: false})
    priceConfidence!: BigDecimal
}
