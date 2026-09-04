import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, BigIntColumn as BigIntColumn_, IntColumn as IntColumn_, StringColumn as StringColumn_, ManyToOne as ManyToOne_, Index as Index_, Relation as Relation_} from "@subsquid/typeorm-store"
import {MasterSafe} from "./masterSafe.model"
import {AgentSafe} from "./agentSafe.model"
import {StakingContract} from "./stakingContract.model"

@Entity_()
export class Service {
    constructor(props?: Partial<Service>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @BigIntColumn_({nullable: false})
    serviceId!: bigint

    @IntColumn_({array: true, nullable: false})
    agentIds!: (number)[]

    @StringColumn_({array: true, nullable: false})
    operators!: (string)[]

    @Index_("idx_service_master_safe_8b79bdf7")
    @ManyToOne_(() => MasterSafe, {nullable: true})
    masterSafe!: Relation_<MasterSafe> | undefined | null

    @Index_("idx_service_agent_safe_a2926dff")
    @ManyToOne_(() => AgentSafe, {nullable: true})
    agentSafe!: Relation_<AgentSafe> | undefined | null

    @StringColumn_({nullable: false})
    state!: string

    @StringColumn_({nullable: true})
    nftCustodian!: string | undefined | null

    @Index_("idx_service_current_staking_contract_8fef2861")
    @ManyToOne_(() => StakingContract, {nullable: true})
    currentStakingContract!: Relation_<StakingContract> | undefined | null

    @BigIntColumn_({nullable: false})
    totalOlasRewardsClaimed!: bigint

    @BigIntColumn_({nullable: false})
    registeredTimestamp!: bigint

    @BigIntColumn_({nullable: false})
    updatedTimestamp!: bigint
}
