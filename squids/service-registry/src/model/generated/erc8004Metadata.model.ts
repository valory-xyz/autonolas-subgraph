import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, ManyToOne as ManyToOne_, Index as Index_, Relation as Relation_, StringColumn as StringColumn_} from "@subsquid/typeorm-store"
import {ERC8004Agent} from "./erc8004Agent.model"

@Entity_()
export class ERC8004Metadata {
    constructor(props?: Partial<ERC8004Metadata>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @Index_("idx_erc8004_metadata_agent_bdf75f67")
    @ManyToOne_(() => ERC8004Agent, {nullable: true})
    agent!: Relation_<ERC8004Agent>

    @StringColumn_({nullable: false})
    key!: string

    @StringColumn_({nullable: true})
    value!: string | undefined | null
}
