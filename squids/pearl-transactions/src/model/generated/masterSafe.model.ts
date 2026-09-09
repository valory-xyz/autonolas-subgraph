import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, StringColumn as StringColumn_, BigIntColumn as BigIntColumn_, OneToMany as OneToMany_, Relation as Relation_, BooleanColumn as BooleanColumn_} from "@subsquid/typeorm-store"
import {Service} from "./service.model"
import {AgentSafe} from "./agentSafe.model"

@Entity_()
export class MasterSafe {
    constructor(props?: Partial<MasterSafe>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @StringColumn_({nullable: false})
    network!: string

    @StringColumn_({nullable: false})
    masterEoa!: string

    @StringColumn_({array: true, nullable: false})
    owners!: (string)[]

    @BigIntColumn_({nullable: false})
    threshold!: bigint

    @OneToMany_(() => Service, e => e.masterSafe)
    services!: Relation_<Service[]>

    @OneToMany_(() => AgentSafe, e => e.masterSafe)
    agentSafes!: Relation_<AgentSafe[]>

    @BigIntColumn_({nullable: false})
    firstSeenTimestamp!: bigint

    @BigIntColumn_({nullable: false})
    firstSeenBlock!: bigint

    @BigIntColumn_({nullable: false})
    historyFloorBlock!: bigint

    @BigIntColumn_({nullable: false})
    historyFloorTimestamp!: bigint

    @BigIntColumn_({nullable: false})
    lastActivityTimestamp!: bigint

    @BooleanColumn_({nullable: false})
    setupTransferSeen!: boolean
}
