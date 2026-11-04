import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, ManyToOne as ManyToOne_, Index as Index_, Relation as Relation_, BigIntColumn as BigIntColumn_} from "@subsquid/typeorm-store"
import {Service} from "./service.model"

@Entity_()
export class AgentInstance {
    constructor(props?: Partial<AgentInstance>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @Index_("idx_agent_instance_service_cfb8e2ff")
    @ManyToOne_(() => Service, {nullable: true})
    service!: Relation_<Service>

    @BigIntColumn_({nullable: false})
    updatedBlock!: bigint
}
