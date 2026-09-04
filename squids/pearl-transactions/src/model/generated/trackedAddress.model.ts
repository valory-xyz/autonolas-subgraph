import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, StringColumn as StringColumn_, ManyToOne as ManyToOne_, Index as Index_, Relation as Relation_, BigIntColumn as BigIntColumn_} from "@subsquid/typeorm-store"
import {MasterSafe} from "./masterSafe.model"
import {Service} from "./service.model"

@Entity_()
export class TrackedAddress {
    constructor(props?: Partial<TrackedAddress>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @StringColumn_({nullable: false})
    role!: string

    @Index_("idx_tracked_address_master_safe_c7f7f136")
    @ManyToOne_(() => MasterSafe, {nullable: true})
    masterSafe!: Relation_<MasterSafe> | undefined | null

    @Index_("idx_tracked_address_service_b9ff2a20")
    @ManyToOne_(() => Service, {nullable: true})
    service!: Relation_<Service> | undefined | null

    @BigIntColumn_({nullable: false})
    firstTrackedBlock!: bigint
}
