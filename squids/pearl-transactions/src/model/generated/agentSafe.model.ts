import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, ManyToOne as ManyToOne_, Index as Index_, Relation as Relation_, BigIntColumn as BigIntColumn_} from "@subsquid/typeorm-store"
import {MasterSafe} from "./masterSafe.model"
import {Service} from "./service.model"

@Entity_()
export class AgentSafe {
    constructor(props?: Partial<AgentSafe>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @Index_("idx_agent_safe_master_safe_15dfcbff")
    @ManyToOne_(() => MasterSafe, {nullable: true})
    masterSafe!: Relation_<MasterSafe> | undefined | null

    @Index_("idx_agent_safe_service_c1d14b83")
    @ManyToOne_(() => Service, {nullable: true})
    service!: Relation_<Service>

    @BigIntColumn_({nullable: false})
    createdTimestamp!: bigint
}
