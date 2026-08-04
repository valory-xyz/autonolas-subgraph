import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, BigIntColumn as BigIntColumn_, StringColumn as StringColumn_} from "@subsquid/typeorm-store"

@Entity_()
export class TokenRegistry {
    constructor(props?: Partial<TokenRegistry>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @BigIntColumn_({nullable: false})
    tokenId!: bigint

    @StringColumn_({nullable: false})
    conditionId!: string

    @BigIntColumn_({nullable: false})
    outcomeIndex!: bigint

    @StringColumn_({nullable: false})
    transactionHash!: string
}
