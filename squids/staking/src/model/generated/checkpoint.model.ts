import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, BigIntColumn as BigIntColumn_, StringColumn as StringColumn_} from "@subsquid/typeorm-store"

@Entity_()
export class Checkpoint {
    constructor(props?: Partial<Checkpoint>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @BigIntColumn_({nullable: false})
    epoch!: bigint

    @BigIntColumn_({nullable: false})
    availableRewards!: bigint

    @StringColumn_({array: true, nullable: false})
    serviceIds!: (string)[]

    @StringColumn_({array: true, nullable: false})
    rewards!: (string)[]

    @BigIntColumn_({nullable: false})
    epochLength!: bigint

    @BigIntColumn_({nullable: false})
    blockNumber!: bigint

    @StringColumn_({nullable: false})
    transactionHash!: string

    @BigIntColumn_({nullable: false})
    blockTimestamp!: bigint

    @StringColumn_({nullable: false})
    contractAddress!: string
}
