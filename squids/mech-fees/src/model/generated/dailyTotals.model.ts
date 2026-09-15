import {BigDecimal} from "@subsquid/big-decimal"
import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, IntColumn as IntColumn_, Index as Index_, BigDecimalColumn as BigDecimalColumn_} from "@subsquid/typeorm-store"

@Entity_()
export class DailyTotals {
    constructor(props?: Partial<DailyTotals>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @Index_("idx_daily_totals_date_a54afc9a")
    @IntColumn_({nullable: false})
    date!: number

    @BigDecimalColumn_({nullable: false})
    totalFeesInUSD!: BigDecimal

    @BigDecimalColumn_({nullable: false})
    totalFeesOutUSD!: BigDecimal
}
