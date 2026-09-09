import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, ManyToOne as ManyToOne_, Index as Index_, Relation as Relation_} from "@subsquid/typeorm-store"
import {DailyAgentPerformance} from "./dailyAgentPerformance.model"
import {Multisig} from "./multisig.model"

@Entity_()
export class DailyAgentMultisig {
    constructor(props?: Partial<DailyAgentMultisig>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @Index_("idx_daily_agent_multisig_daily_agent_performance_8bbbb356")
    @ManyToOne_(() => DailyAgentPerformance, {nullable: true})
    dailyAgentPerformance!: Relation_<DailyAgentPerformance>

    @Index_("idx_daily_agent_multisig_multisig_ad83e981")
    @ManyToOne_(() => Multisig, {nullable: true})
    multisig!: Relation_<Multisig>
}
