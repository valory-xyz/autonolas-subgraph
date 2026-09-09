import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, BigIntColumn as BigIntColumn_, Index as Index_, IntColumn as IntColumn_, OneToMany as OneToMany_, Relation as Relation_} from "@subsquid/typeorm-store"
import {DailyAgentMultisig} from "./dailyAgentMultisig.model"

@Entity_()
export class DailyAgentPerformance {
    constructor(props?: Partial<DailyAgentPerformance>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @Index_("idx_daily_agent_performance_day_timestamp_2b77c149")
    @BigIntColumn_({nullable: false})
    dayTimestamp!: bigint

    @Index_("idx_daily_agent_performance_agent_id_16c6814a")
    @IntColumn_({nullable: false})
    agentId!: number

    @IntColumn_({nullable: false})
    txCount!: number

    @OneToMany_(() => DailyAgentMultisig, e => e.dailyAgentPerformance)
    multisigs!: Relation_<DailyAgentMultisig[]>

    @IntColumn_({nullable: false})
    activeMultisigCount!: number
}
