import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, ManyToOne as ManyToOne_, Index as Index_, Relation as Relation_, StringColumn as StringColumn_, BigIntColumn as BigIntColumn_} from "@subsquid/typeorm-store"
import {PoolMetrics} from "./poolMetrics.model"

@Entity_()
export class BPTTransfer {
    constructor(props?: Partial<BPTTransfer>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @Index_("idx_bpt_transfer_pool_09c6e9a6")
    @ManyToOne_(() => PoolMetrics, {nullable: true})
    pool!: Relation_<PoolMetrics>

    @Index_("idx_bpt_transfer_from_d424fdcf")
    @StringColumn_({nullable: false})
    from!: string

    @Index_("idx_bpt_transfer_to_02fcf1f4")
    @StringColumn_({nullable: false})
    to!: string

    @BigIntColumn_({nullable: false})
    value!: bigint

    @BigIntColumn_({nullable: false})
    blockNumber!: bigint

    @Index_("idx_bpt_transfer_block_timestamp_68f9d184")
    @BigIntColumn_({nullable: false})
    blockTimestamp!: bigint

    @StringColumn_({nullable: false})
    transactionHash!: string
}
