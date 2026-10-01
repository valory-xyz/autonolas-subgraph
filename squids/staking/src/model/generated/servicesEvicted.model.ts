import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, BigIntColumn as BigIntColumn_, StringColumn as StringColumn_} from "@subsquid/typeorm-store"

@Entity_()
export class ServicesEvicted {
    constructor(props?: Partial<ServicesEvicted>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @BigIntColumn_({nullable: false})
    epoch!: bigint

    @StringColumn_({array: true, nullable: false})
    serviceIds!: (string)[]

    @StringColumn_({array: true, nullable: false})
    owners!: (string)[]

    @StringColumn_({array: true, nullable: false})
    multisigs!: (string)[]

    @StringColumn_({array: true, nullable: false})
    serviceInactivity!: (string)[]

    @BigIntColumn_({nullable: false})
    blockNumber!: bigint

    @BigIntColumn_({nullable: false})
    blockTimestamp!: bigint

    @StringColumn_({nullable: false})
    transactionHash!: string
}
