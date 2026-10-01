import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, StringColumn as StringColumn_, BigIntColumn as BigIntColumn_} from "@subsquid/typeorm-store"

@Entity_()
export class ActiveServiceEpoch {
    constructor(props?: Partial<ActiveServiceEpoch>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @StringColumn_({nullable: false})
    contractAddress!: string

    @BigIntColumn_({nullable: false})
    epoch!: bigint

    @StringColumn_({array: true, nullable: false})
    activeServiceIds!: (string)[]

    @BigIntColumn_({nullable: false})
    blockNumber!: bigint

    @BigIntColumn_({nullable: false})
    blockTimestamp!: bigint
}
