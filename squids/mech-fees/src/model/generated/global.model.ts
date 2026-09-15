import {BigDecimal} from "@subsquid/big-decimal"
import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, BigDecimalColumn as BigDecimalColumn_} from "@subsquid/typeorm-store"

@Entity_()
export class Global {
    constructor(props?: Partial<Global>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @BigDecimalColumn_({nullable: false})
    totalFeesInUSD!: BigDecimal

    @BigDecimalColumn_({nullable: false})
    totalFeesOutUSD!: BigDecimal

    @BigDecimalColumn_({nullable: false})
    totalDrainedFeesUSD!: BigDecimal

    @BigDecimalColumn_({nullable: false})
    totalOlasBurnedRaw!: BigDecimal

    @BigDecimalColumn_({nullable: false})
    totalOlasBurnedUSD!: BigDecimal
}
