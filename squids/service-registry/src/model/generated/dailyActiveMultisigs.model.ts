import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, BigIntColumn as BigIntColumn_, Index as Index_, OneToMany as OneToMany_, Relation as Relation_, IntColumn as IntColumn_} from "@subsquid/typeorm-store"
import {DailyActiveMultisig} from "./dailyActiveMultisig.model"

@Entity_()
export class DailyActiveMultisigs {
    constructor(props?: Partial<DailyActiveMultisigs>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @Index_("idx_daily_active_multisigs_day_timestamp_9a19e0be")
    @BigIntColumn_({nullable: false})
    dayTimestamp!: bigint

    @OneToMany_(() => DailyActiveMultisig, e => e.dailyActiveMultisigs)
    multisigs!: Relation_<DailyActiveMultisig[]>

    @IntColumn_({nullable: false})
    count!: number
}
