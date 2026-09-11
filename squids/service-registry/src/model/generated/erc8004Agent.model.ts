import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, OneToMany as OneToMany_, Relation as Relation_, StringColumn as StringColumn_} from "@subsquid/typeorm-store"
import {Service} from "./service.model"
import {ERC8004Metadata} from "./erc8004Metadata.model"

@Entity_()
export class ERC8004Agent {
    constructor(props?: Partial<ERC8004Agent>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @OneToMany_(() => Service, e => e.erc8004Agent)
    services!: Relation_<Service[]>

    @StringColumn_({nullable: true})
    agentWallet!: string | undefined | null

    @OneToMany_(() => ERC8004Metadata, e => e.agent)
    metadata!: Relation_<ERC8004Metadata[]>
}
