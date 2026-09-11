import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, StringColumn as StringColumn_, Index as Index_, BigIntColumn as BigIntColumn_, BooleanColumn as BooleanColumn_} from "@subsquid/typeorm-store"

@Entity_()
export class MarketplaceDelivery {
    constructor(props?: Partial<MarketplaceDelivery>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @Index_("idx_marketplace_delivery_delivery_mech_327af687")
    @StringColumn_({nullable: false})
    deliveryMech!: string

    @BigIntColumn_({nullable: false})
    numDeliveries!: bigint

    @StringColumn_({array: true, nullable: false})
    requestIds!: (string)[]

    @BooleanColumn_({array: true, nullable: false})
    deliveredRequests!: (boolean)[]

    @BigIntColumn_({nullable: false})
    blockNumber!: bigint

    @Index_("idx_marketplace_delivery_block_timestamp_6c04a1ae")
    @BigIntColumn_({nullable: false})
    blockTimestamp!: bigint

    @StringColumn_({nullable: false})
    transactionHash!: string
}
