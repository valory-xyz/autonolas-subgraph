import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, StringColumn as StringColumn_, Index as Index_, BigIntColumn as BigIntColumn_} from "@subsquid/typeorm-store"

@Entity_()
export class MarketplaceDeliveryWithSignatures {
    constructor(props?: Partial<MarketplaceDeliveryWithSignatures>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @Index_("idx_marketplace_delivery_with_signatures_delivery_mech_138aab18")
    @StringColumn_({nullable: false})
    deliveryMech!: string

    @Index_("idx_marketplace_delivery_with_signatures_requester_a95149a4")
    @StringColumn_({nullable: false})
    requester!: string

    @BigIntColumn_({nullable: false})
    numDeliveries!: bigint

    @StringColumn_({array: true, nullable: false})
    requestIds!: (string)[]

    @BigIntColumn_({nullable: false})
    blockNumber!: bigint

    @Index_("idx_marketplace_delivery_with_signatures_block_timesta_de894cec")
    @BigIntColumn_({nullable: false})
    blockTimestamp!: bigint

    @StringColumn_({nullable: false})
    transactionHash!: string
}
