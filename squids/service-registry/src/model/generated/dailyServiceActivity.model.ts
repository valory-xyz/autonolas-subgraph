import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, ManyToOne as ManyToOne_, Index as Index_, Relation as Relation_, BigIntColumn as BigIntColumn_, IntColumn as IntColumn_} from "@subsquid/typeorm-store"
import {Service} from "./service.model"

@Entity_()
export class DailyServiceActivity {
    constructor(props?: Partial<DailyServiceActivity>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @Index_("idx_daily_service_activity_service_d0c83930")
    @ManyToOne_(() => Service, {nullable: true})
    service!: Relation_<Service>

    @Index_("idx_daily_service_activity_day_timestamp_e83a07ca")
    @BigIntColumn_({nullable: false})
    dayTimestamp!: bigint

    @IntColumn_({array: true, nullable: false})
    agentIds!: (number)[]
}
