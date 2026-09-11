import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, ManyToOne as ManyToOne_, Index as Index_, Relation as Relation_} from "@subsquid/typeorm-store"
import {DailyActiveMultisigs} from "./dailyActiveMultisigs.model"
import {Multisig} from "./multisig.model"

@Entity_()
export class DailyActiveMultisig {
    constructor(props?: Partial<DailyActiveMultisig>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @Index_("idx_daily_active_multisig_daily_active_multisigs_f9aac03d")
    @ManyToOne_(() => DailyActiveMultisigs, {nullable: true})
    dailyActiveMultisigs!: Relation_<DailyActiveMultisigs>

    @Index_("idx_daily_active_multisig_multisig_a1f2ef0c")
    @ManyToOne_(() => Multisig, {nullable: true})
    multisig!: Relation_<Multisig>
}
