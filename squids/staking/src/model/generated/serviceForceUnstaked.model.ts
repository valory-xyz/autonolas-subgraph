import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, BigIntColumn as BigIntColumn_, StringColumn as StringColumn_} from "@subsquid/typeorm-store"

@Entity_()
export class ServiceForceUnstaked {
    constructor(props?: Partial<ServiceForceUnstaked>) {
        Object.assign(this, props)
    }

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
    availableRewards!: bigint

    @BigIntColumn_({nullable: false})
    blockNumber!: bigint

    @BigIntColumn_({nullable: false})
    blockTimestamp!: bigint

    @StringColumn_({nullable: false})
    transactionHash!: string
}
