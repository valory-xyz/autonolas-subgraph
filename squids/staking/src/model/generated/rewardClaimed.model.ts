import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, StringColumn as StringColumn_, BigIntColumn as BigIntColumn_} from "@subsquid/typeorm-store"

@Entity_()
export class RewardClaimed {
    constructor(props?: Partial<RewardClaimed>) {
        Object.assign(this, props)
    }

    @StringColumn_({array: true, nullable: true})
    receivers!: (string)[] | undefined | null

    @StringColumn_({array: true, nullable: true})
    rewardAmounts!: (string)[] | undefined | null

    @PrimaryColumn_()
    id!: string

    @BigIntColumn_({nullable: false})
    epoch!: bigint

    @BigIntColumn_({nullable: false})
    serviceId!: bigint

    @StringColumn_({nullable: false})
    owner!: string

    @StringColumn_({nullable: false})
    multisig!: string

    @StringColumn_({array: true, nullable: false})
    nonces!: (string)[]

    @BigIntColumn_({nullable: false})
    reward!: bigint

    @BigIntColumn_({nullable: false})
    blockNumber!: bigint

    @BigIntColumn_({nullable: false})
    blockTimestamp!: bigint

    @StringColumn_({nullable: false})
    transactionHash!: string
}
