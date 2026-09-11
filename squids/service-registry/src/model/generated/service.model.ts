import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, StringColumn as StringColumn_, IntColumn as IntColumn_, BigIntColumn as BigIntColumn_, ManyToOne as ManyToOne_, Index as Index_, Relation as Relation_} from "@subsquid/typeorm-store"
import {Creator} from "./creator.model"
import {ERC8004Agent} from "./erc8004Agent.model"

@Entity_()
export class Service {
    constructor(props?: Partial<Service>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @StringColumn_({nullable: true})
    multisig!: string | undefined | null

    @IntColumn_({array: true, nullable: false})
    agentIds!: (number)[]

    @BigIntColumn_({nullable: false})
    creationTimestamp!: bigint

    @StringColumn_({nullable: true})
    configHash!: string | undefined | null

    @Index_("idx_service_creator_7465f295")
    @ManyToOne_(() => Creator, {nullable: true})
    creator!: Relation_<Creator> | undefined | null

    @Index_("idx_service_erc8004_agent_10abfe9e")
    @ManyToOne_(() => ERC8004Agent, {nullable: true})
    erc8004Agent!: Relation_<ERC8004Agent> | undefined | null
}
