import {BigDecimal} from "@subsquid/big-decimal"
import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, ManyToOne as ManyToOne_, Index as Index_, Relation as Relation_, StringColumn as StringColumn_, BigDecimalColumn as BigDecimalColumn_} from "@subsquid/typeorm-store"
import {Mech} from "./mech.model"

@Entity_()
export class MechModel {
    constructor(props?: Partial<MechModel>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @Index_("idx_mech_model_mech_1b2c8d0c")
    @ManyToOne_(() => Mech, {nullable: true})
    mech!: Relation_<Mech>

    @Index_("idx_mech_model_model_6b6a47b3")
    @StringColumn_({nullable: false})
    model!: string

    @BigDecimalColumn_({nullable: false})
    totalFeesInUSD!: BigDecimal

    @BigDecimalColumn_({nullable: false})
    totalFeesOutUSD!: BigDecimal

    @BigDecimalColumn_({nullable: false})
    totalFeesInRaw!: BigDecimal

    @BigDecimalColumn_({nullable: false})
    totalFeesOutRaw!: BigDecimal
}
