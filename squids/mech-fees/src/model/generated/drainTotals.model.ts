import {BigDecimal} from "@subsquid/big-decimal"
import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, StringColumn as StringColumn_, BigDecimalColumn as BigDecimalColumn_} from "@subsquid/typeorm-store"

@Entity_()
export class DrainTotals {
    constructor(props?: Partial<DrainTotals>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @StringColumn_({nullable: false})
    model!: string

    @BigDecimalColumn_({nullable: false})
    totalDrainedRaw!: BigDecimal

    @BigDecimalColumn_({nullable: false})
    totalDrainedUSD!: BigDecimal
}
