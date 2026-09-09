import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, BigIntColumn as BigIntColumn_, Index as Index_, IntColumn as IntColumn_, OneToMany as OneToMany_, Relation as Relation_} from "@subsquid/typeorm-store"
import {DailyUniqueAgent} from "./dailyUniqueAgent.model"

@Entity_()
export class DailyUniqueAgents {
    constructor(props?: Partial<DailyUniqueAgents>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @Index_("idx_daily_unique_agents_day_timestamp_dcfe51fa")
    @BigIntColumn_({nullable: false})
    dayTimestamp!: bigint

    @IntColumn_({nullable: false})
    count!: number

    @OneToMany_(() => DailyUniqueAgent, e => e.dailyUniqueAgents)
    agents!: Relation_<DailyUniqueAgent[]>
}
