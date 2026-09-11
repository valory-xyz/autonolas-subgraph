import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, BigIntColumn as BigIntColumn_, StringColumn as StringColumn_, ManyToOne as ManyToOne_, Index as Index_, Relation as Relation_} from "@subsquid/typeorm-store"
import {Service} from "./service.model"

@Entity_()
export class Metadata {
    constructor(props?: Partial<Metadata>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @BigIntColumn_({nullable: false})
    serviceIdRaw!: bigint

    @StringColumn_({nullable: true})
    mech!: string | undefined | null

    @StringColumn_({nullable: false})
    metadata!: string

    @Index_("idx_metadata_service_d020c7c9")
    @ManyToOne_(() => Service, {nullable: true})
    service!: Relation_<Service> | undefined | null
}
