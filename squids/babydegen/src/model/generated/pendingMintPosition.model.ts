import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, StringColumn as StringColumn_, BooleanColumn as BooleanColumn_} from "@subsquid/typeorm-store"

/**
 * A v2 LP mint waiting for its Mint event (a String id in the subgraph too)
 */
@Entity_()
export class PendingMintPosition {
    constructor(props?: Partial<PendingMintPosition>) {
        Object.assign(this, props)
    }

    /**
     * '<txHash>-<pool>'
     */
    @PrimaryColumn_()
    id!: string

    @StringColumn_({nullable: false})
    txHash!: string

    @StringColumn_({nullable: false})
    poolAddress!: string

    @StringColumn_({nullable: false})
    positionId!: string

    @StringColumn_({nullable: false})
    recipient!: string

    /**
     * The LP mint found the row missing or closed: its Mint replaces the entry
     */
    @BooleanColumn_({nullable: false})
    startsEntry!: boolean
}
