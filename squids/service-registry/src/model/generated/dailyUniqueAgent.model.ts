import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, ManyToOne as ManyToOne_, Index as Index_, Relation as Relation_} from "@subsquid/typeorm-store"
import {DailyUniqueAgents} from "./dailyUniqueAgents.model"
import {AgentPerformance} from "./agentPerformance.model"

@Entity_()
export class DailyUniqueAgent {
    constructor(props?: Partial<DailyUniqueAgent>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @Index_("idx_daily_unique_agent_daily_unique_agents_7066b717")
    @ManyToOne_(() => DailyUniqueAgents, {nullable: true})
    dailyUniqueAgents!: Relation_<DailyUniqueAgents>

    @Index_("idx_daily_unique_agent_agent_ba20201e")
    @ManyToOne_(() => AgentPerformance, {nullable: true})
    agent!: Relation_<AgentPerformance>
}
