import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, OneToOne as OneToOne_, Relation as Relation_, StringColumn as StringColumn_, OneToMany as OneToMany_} from "@subsquid/typeorm-store"
import {Service} from "./service.model"
import {ERC8004Metadata} from "./erc8004Metadata.model"

@Entity_()
export class ERC8004Agent {
    constructor(props?: Partial<ERC8004Agent>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @OneToOne_(() => Service, e => e.erc8004Agent)
    service!: Relation_<Service> | undefined | null

    @StringColumn_({nullable: true})
    agentWallet!: string | undefined | null

    @OneToMany_(() => ERC8004Metadata, e => e.agent)
    metadata!: Relation_<ERC8004Metadata[]>
}
