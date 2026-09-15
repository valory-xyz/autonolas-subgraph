import {BigDecimal} from "@subsquid/big-decimal"
import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, StringColumn as StringColumn_, Index as Index_, BigDecimalColumn as BigDecimalColumn_, BigIntColumn as BigIntColumn_} from "@subsquid/typeorm-store"

@Entity_()
export class DrainEvent {
    constructor(props?: Partial<DrainEvent>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @Index_("idx_drain_event_model_a573af36")
    @StringColumn_({nullable: false})
    model!: string

    @StringColumn_({nullable: false})
    token!: string

    @BigDecimalColumn_({nullable: false})
    amountRaw!: BigDecimal

    @BigDecimalColumn_({nullable: false})
    amountUSD!: BigDecimal

    @Index_("idx_drain_event_timestamp_bbd0e582")
    @BigIntColumn_({nullable: false})
    timestamp!: bigint

    @BigIntColumn_({nullable: false})
    blockNumber!: bigint

    @StringColumn_({nullable: false})
    txHash!: string
}
