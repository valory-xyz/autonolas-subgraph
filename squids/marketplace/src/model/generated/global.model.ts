import {BigDecimal} from "@subsquid/big-decimal"
import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, BigIntColumn as BigIntColumn_, BigDecimalColumn as BigDecimalColumn_} from "@subsquid/typeorm-store"

@Entity_()
export class Global {
    constructor(props?: Partial<Global>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @BigIntColumn_({nullable: false})
    totalMechs!: bigint

    @BigIntColumn_({nullable: false})
    totalMarketplaceRequests!: bigint

    @BigIntColumn_({nullable: false})
    totalMarketplaceDeliveries!: bigint

    @BigIntColumn_({nullable: false})
    totalMarketplaceDeliveriesWithSignatures!: bigint

    @BigIntColumn_({nullable: false})
    totalRequests!: bigint

    @BigIntColumn_({nullable: false})
    totalDeliveries!: bigint

    @BigIntColumn_({nullable: false})
    totalTransactions!: bigint

    @BigIntColumn_({nullable: false})
    totalAtaTransactions!: bigint

    @BigDecimalColumn_({nullable: false})
    totalFeesPaidUSD!: BigDecimal
}
