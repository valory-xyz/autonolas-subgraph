import {BigDecimal} from "@subsquid/big-decimal"
import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, BigDecimalColumn as BigDecimalColumn_} from "@subsquid/typeorm-store"

@Entity_()
export class Mech {
    constructor(props?: Partial<Mech>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @BigDecimalColumn_({nullable: false})
    totalFeesInUSD!: BigDecimal

    @BigDecimalColumn_({nullable: false})
    totalFeesOutUSD!: BigDecimal

    @BigDecimalColumn_({nullable: false})
    totalFeesInRaw!: BigDecimal

    @BigDecimalColumn_({nullable: false})
    totalFeesOutRaw!: BigDecimal
}
