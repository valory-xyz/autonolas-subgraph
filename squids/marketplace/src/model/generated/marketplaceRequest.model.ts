import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, StringColumn as StringColumn_, Index as Index_, BigIntColumn as BigIntColumn_} from "@subsquid/typeorm-store"

@Entity_()
export class MarketplaceRequest {
    constructor(props?: Partial<MarketplaceRequest>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @StringColumn_({nullable: false})
    priorityMech!: string

    @Index_("idx_marketplace_request_requester_f175360c")
    @StringColumn_({nullable: false})
    requester!: string

    @BigIntColumn_({nullable: false})
    numRequests!: bigint

    @StringColumn_({array: true, nullable: false})
    requestIds!: (string)[]

    @BigIntColumn_({nullable: false})
    blockNumber!: bigint

    @Index_("idx_marketplace_request_block_timestamp_027fe6e3")
    @BigIntColumn_({nullable: false})
    blockTimestamp!: bigint

    @StringColumn_({nullable: false})
    transactionHash!: string
}
