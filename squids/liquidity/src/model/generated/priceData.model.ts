import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, BigIntColumn as BigIntColumn_, IntColumn as IntColumn_} from "@subsquid/typeorm-store"

@Entity_()
export class PriceData {
    constructor(props?: Partial<PriceData>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @BigIntColumn_({nullable: false})
    price!: bigint

    @IntColumn_({nullable: false})
    decimals!: number

    @BigIntColumn_({nullable: false})
    lastUpdatedBlock!: bigint

    @BigIntColumn_({nullable: false})
    lastUpdatedTimestamp!: bigint
}
