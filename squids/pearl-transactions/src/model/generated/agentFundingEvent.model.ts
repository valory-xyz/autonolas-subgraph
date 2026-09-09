import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, ManyToOne as ManyToOne_, Index as Index_, Relation as Relation_, StringColumn as StringColumn_, BigIntColumn as BigIntColumn_, OneToMany as OneToMany_} from "@subsquid/typeorm-store"
import {Service} from "./service.model"
import {MasterSafe} from "./masterSafe.model"
import {FundsMovement} from "./fundsMovement.model"

@Entity_()
export class AgentFundingEvent {
    constructor(props?: Partial<AgentFundingEvent>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @Index_("idx_agent_funding_event_service_5b5efd90")
    @ManyToOne_(() => Service, {nullable: true})
    service!: Relation_<Service>

    @Index_("idx_agent_funding_event_master_safe_6d6a8407")
    @ManyToOne_(() => MasterSafe, {nullable: true})
    masterSafe!: Relation_<MasterSafe>

    @StringColumn_({nullable: false})
    txHash!: string

    @BigIntColumn_({nullable: false})
    blockTimestamp!: bigint

    @BigIntColumn_({nullable: false})
    totalNativeAmount!: bigint

    @BigIntColumn_({nullable: false})
    totalOlasAmount!: bigint

    @OneToMany_(() => FundsMovement, e => e.agentFundingEvent)
    transfers!: Relation_<FundsMovement[]>
}
