import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, ManyToOne as ManyToOne_, Index as Index_, Relation as Relation_, StringColumn as StringColumn_, BigIntColumn as BigIntColumn_} from "@subsquid/typeorm-store"
import {Service} from "./service.model"
import {MasterSafe} from "./masterSafe.model"
import {AgentSafe} from "./agentSafe.model"
import {FundsCategory} from "./_fundsCategory"
import {FundsSource} from "./_fundsSource"
import {ServiceBondType} from "./_serviceBondType"

@Entity_()
export class BondMovement {
    constructor(props?: Partial<BondMovement>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @Index_("idx_bond_movement_service_09b070cf")
    @ManyToOne_(() => Service, {nullable: true})
    service!: Relation_<Service> | undefined | null

    @Index_("idx_bond_movement_master_safe_46f5ecad")
    @ManyToOne_(() => MasterSafe, {nullable: true})
    masterSafe!: Relation_<MasterSafe> | undefined | null

    @Index_("idx_bond_movement_agent_safe_6639ac6d")
    @ManyToOne_(() => AgentSafe, {nullable: true})
    agentSafe!: Relation_<AgentSafe> | undefined | null

    @Column_("varchar", {length: 20, nullable: false})
    category!: FundsCategory

    @Column_("varchar", {length: 12, nullable: false})
    source!: FundsSource

    @Column_("varchar", {length: 16, nullable: true})
    bondType!: ServiceBondType | undefined | null

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
