import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, BigIntColumn as BigIntColumn_, Index as Index_, StringColumn as StringColumn_, IntColumn as IntColumn_, OneToMany as OneToMany_, Relation as Relation_, OneToOne as OneToOne_} from "@subsquid/typeorm-store"
import {Request} from "./request.model"
import {Deliver} from "./deliver.model"
import {Metadata} from "./metadata.model"
import {Mech} from "./mech.model"

@Entity_()
export class Service {
    constructor(props?: Partial<Service>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @Index_("idx_service_service_id_b8ec8acf")
    @BigIntColumn_({nullable: false})
    serviceId!: bigint

    @StringColumn_({nullable: true})
    configHash!: string | undefined | null

    @Index_("idx_service_latest_multisig_fb126181")
    @StringColumn_({nullable: true})
    latestMultisig!: string | undefined | null

    @StringColumn_({array: true, nullable: false})
    historicalMultisigs!: (string)[]

    @BigIntColumn_({nullable: false})
    totalRequests!: bigint

    @BigIntColumn_({nullable: false})
    totalDeliveries!: bigint

    @IntColumn_({array: true, nullable: false})
    agentIds!: (number)[]

    @OneToMany_(() => Request, e => e.service)
    requests!: Relation_<Request[]>

    @OneToMany_(() => Deliver, e => e.service)
    deliveries!: Relation_<Deliver[]>

    @OneToMany_(() => Metadata, e => e.service)
    metadata!: Relation_<Metadata[]>

    @OneToOne_(() => Mech, e => e.service)
    mech!: Relation_<Mech> | undefined | null
}
