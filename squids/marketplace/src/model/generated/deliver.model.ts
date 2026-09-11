import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, StringColumn as StringColumn_, Index as Index_, ManyToOne as ManyToOne_, Relation as Relation_, BigIntColumn as BigIntColumn_, OneToOne as OneToOne_} from "@subsquid/typeorm-store"
import {Request} from "./request.model"
import {Service} from "./service.model"
import {DeliverForMarketplace} from "./deliverForMarketplace.model"

@Entity_()
export class Deliver {
    constructor(props?: Partial<Deliver>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @Index_("idx_deliver_request_id_bytes_9fbabb82")
    @StringColumn_({nullable: false})
    requestIdBytes!: string

    @StringColumn_({nullable: false})
    sender!: string

    @Index_("idx_deliver_mech_e79ac8c7")
    @StringColumn_({nullable: false})
    mech!: string

    @Index_("idx_deliver_request_cd231148")
    @ManyToOne_(() => Request, {nullable: true})
    request!: Relation_<Request> | undefined | null

    @BigIntColumn_({nullable: false})
    blockNumber!: bigint

    @Index_("idx_deliver_block_timestamp_4a213a99")
    @BigIntColumn_({nullable: false})
    blockTimestamp!: bigint

    @Index_("idx_deliver_transaction_hash_23d8ce75")
    @StringColumn_({nullable: false})
    transactionHash!: string

    @Index_("idx_deliver_service_c76695ea")
    @ManyToOne_(() => Service, {nullable: true})
    service!: Relation_<Service> | undefined | null

    @OneToOne_(() => DeliverForMarketplace, e => e.deliver)
    marketplaceDelivery!: Relation_<DeliverForMarketplace> | undefined | null
}
