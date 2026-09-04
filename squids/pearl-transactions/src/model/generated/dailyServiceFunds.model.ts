import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, ManyToOne as ManyToOne_, Index as Index_, Relation as Relation_, BigIntColumn as BigIntColumn_} from "@subsquid/typeorm-store"
import {Service} from "./service.model"

@Entity_()
export class DailyServiceFunds {
    constructor(props?: Partial<DailyServiceFunds>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @Index_("idx_daily_service_funds_service_7b0d296f")
    @ManyToOne_(() => Service, {nullable: true})
    service!: Relation_<Service>

    @BigIntColumn_({nullable: false})
    dayTimestamp!: bigint

    @BigIntColumn_({nullable: false})
    olasRewardsClaimed!: bigint

    @BigIntColumn_({nullable: false})
    cumulativeOlasRewardsClaimed!: bigint
}
