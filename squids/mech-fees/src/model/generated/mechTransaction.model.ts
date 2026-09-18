import {BigDecimal} from "@subsquid/big-decimal"
import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, ManyToOne as ManyToOne_, Index as Index_, Relation as Relation_, StringColumn as StringColumn_, BigDecimalColumn as BigDecimalColumn_, BigIntColumn as BigIntColumn_} from "@subsquid/typeorm-store"
import {Mech} from "./mech.model"

@Entity_()
export class MechTransaction {
    constructor(props?: Partial<MechTransaction>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @Index_("idx_mech_transaction_mech_c49ad933")
    @ManyToOne_(() => Mech, {nullable: true})
    mech!: Relation_<Mech>

    @Index_("idx_mech_transaction_type_fddac534")
    @StringColumn_({nullable: false})
    type!: string

    @Index_("idx_mech_transaction_model_804f6db6")
    @StringColumn_({nullable: false})
    model!: string

    @BigDecimalColumn_({nullable: false})
    amountRaw!: BigDecimal

    @BigDecimalColumn_({nullable: false})
    amountUSD!: BigDecimal

    @Index_("idx_mech_transaction_timestamp_5c9edbfb")
    @BigIntColumn_({nullable: false})
    timestamp!: bigint

    @BigIntColumn_({nullable: false})
    blockNumber!: bigint

    @StringColumn_({nullable: false})
    txHash!: string

    @BigIntColumn_({nullable: true})
    deliveryRate!: bigint | undefined | null

    @BigIntColumn_({nullable: true})
    balance!: bigint | undefined | null

    @BigIntColumn_({nullable: true})
    rateDiff!: bigint | undefined | null
}
