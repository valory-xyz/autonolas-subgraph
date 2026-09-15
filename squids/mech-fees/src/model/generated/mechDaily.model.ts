import {BigDecimal} from "@subsquid/big-decimal"
import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, ManyToOne as ManyToOne_, Index as Index_, Relation as Relation_, IntColumn as IntColumn_, BigDecimalColumn as BigDecimalColumn_} from "@subsquid/typeorm-store"
import {Mech} from "./mech.model"

@Entity_()
export class MechDaily {
    constructor(props?: Partial<MechDaily>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @Index_("idx_mech_daily_mech_1a85de07")
    @ManyToOne_(() => Mech, {nullable: true})
    mech!: Relation_<Mech>

    @Index_("idx_mech_daily_date_2ed95658")
    @IntColumn_({nullable: false})
    date!: number

    @BigDecimalColumn_({nullable: false})
    feesInUSD!: BigDecimal

    @BigDecimalColumn_({nullable: false})
    feesOutUSD!: BigDecimal

    @BigDecimalColumn_({nullable: false})
    feesInRaw!: BigDecimal

    @BigDecimalColumn_({nullable: false})
    feesOutRaw!: BigDecimal
}
