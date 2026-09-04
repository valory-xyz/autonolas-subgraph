import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, ManyToOne as ManyToOne_, Index as Index_, Relation as Relation_, BigIntColumn as BigIntColumn_, StringColumn as StringColumn_} from "@subsquid/typeorm-store"
import {Service} from "./service.model"
import {MasterSafe} from "./masterSafe.model"
import {AgentSafe} from "./agentSafe.model"
import {StakingContract} from "./stakingContract.model"
import {FundsCategory} from "./_fundsCategory"
import {FundsSource} from "./_fundsSource"
import {AgentFundingEvent} from "./agentFundingEvent.model"

@Entity_()
export class FundsMovement {
    constructor(props?: Partial<FundsMovement>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @Index_("idx_funds_movement_service_00889d75")
    @ManyToOne_(() => Service, {nullable: true})
    service!: Relation_<Service> | undefined | null

    @Index_("idx_funds_movement_master_safe_e85e0274")
    @ManyToOne_(() => MasterSafe, {nullable: true})
    masterSafe!: Relation_<MasterSafe> | undefined | null

    @Index_("idx_funds_movement_agent_safe_8baac439")
    @ManyToOne_(() => AgentSafe, {nullable: true})
    agentSafe!: Relation_<AgentSafe> | undefined | null

    @Index_("idx_funds_movement_staking_contract_5b8e460e")
    @ManyToOne_(() => StakingContract, {nullable: true})
    stakingContract!: Relation_<StakingContract> | undefined | null

    @BigIntColumn_({nullable: true})
    epoch!: bigint | undefined | null

    @Column_("varchar", {length: 20, nullable: false})
    category!: FundsCategory

    @Column_("varchar", {length: 12, nullable: false})
    source!: FundsSource

    @Index_("idx_funds_movement_agent_funding_event_e58d176e")
    @ManyToOne_(() => AgentFundingEvent, {nullable: true})
    agentFundingEvent!: Relation_<AgentFundingEvent> | undefined | null

    @StringColumn_({nullable: true})
    token!: string | undefined | null

    @BigIntColumn_({nullable: false})
    amount!: bigint

    @StringColumn_({nullable: false})
    from!: string

    @StringColumn_({nullable: false})
    to!: string

    @BigIntColumn_({nullable: false})
    blockNumber!: bigint

    @BigIntColumn_({nullable: false})
    blockTimestamp!: bigint

    @StringColumn_({nullable: false})
    transactionHash!: string
}
