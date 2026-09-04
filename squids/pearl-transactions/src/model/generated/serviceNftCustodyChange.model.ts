import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, ManyToOne as ManyToOne_, Index as Index_, Relation as Relation_, StringColumn as StringColumn_, BigIntColumn as BigIntColumn_} from "@subsquid/typeorm-store"
import {Service} from "./service.model"

@Entity_()
export class ServiceNftCustodyChange {
    constructor(props?: Partial<ServiceNftCustodyChange>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @Index_("idx_service_nft_custody_change_service_49de4177")
    @ManyToOne_(() => Service, {nullable: true})
    service!: Relation_<Service>

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
