import {BigDecimal} from "@subsquid/big-decimal"
import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, ManyToOne as ManyToOne_, Index as Index_, Relation as Relation_, StringColumn as StringColumn_, BigIntColumn as BigIntColumn_, OneToMany as OneToMany_, OneToOne as OneToOne_, BooleanColumn as BooleanColumn_, BigDecimalColumn as BigDecimalColumn_} from "@subsquid/typeorm-store"
import {Sender} from "./sender.model"
import {Deliver} from "./deliver.model"
import {Service} from "./service.model"
import {RequestToMarketplace} from "./requestToMarketplace.model"
import {FeeUnit} from "./_feeUnit"

@Entity_()
export class Request {
    constructor(props?: Partial<Request>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @Index_("idx_request_sender_9a823ad7")
    @ManyToOne_(() => Sender, {nullable: true})
    sender!: Relation_<Sender>

    @Index_("idx_request_mech_2f071c7a")
    @StringColumn_({nullable: false})
    mech!: string

    @BigIntColumn_({nullable: false})
    blockNumber!: bigint

    @Index_("idx_request_block_timestamp_fb797995")
    @BigIntColumn_({nullable: false})
    blockTimestamp!: bigint

    @Index_("idx_request_transaction_hash_fd580601")
    @StringColumn_({nullable: false})
    transactionHash!: string

    @OneToMany_(() => Deliver, e => e.request)
    deliveries!: Relation_<Deliver[]>

    @Index_("idx_request_service_12b44acd")
    @ManyToOne_(() => Service, {nullable: true})
    service!: Relation_<Service> | undefined | null

    @OneToOne_(() => RequestToMarketplace, e => e.request)
    marketplaceRequest!: Relation_<RequestToMarketplace> | undefined | null

    @BooleanColumn_({nullable: false})
    isDelivered!: boolean

    @StringColumn_({nullable: true})
    priorityMech!: string | undefined | null

    @StringColumn_({nullable: true})
    deliveredByMech!: string | undefined | null

    @BigDecimalColumn_({nullable: true})
    feeUSD!: BigDecimal | undefined | null

    @BigDecimalColumn_({nullable: true})
    finalFeeUSD!: BigDecimal | undefined | null

    @BigIntColumn_({nullable: true})
    feeRaw!: bigint | undefined | null

    @Column_("varchar", {length: 7, nullable: true})
    feeUnit!: FeeUnit | undefined | null
}
