import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, StringColumn as StringColumn_} from "@subsquid/typeorm-store"

@Entity_()
export class MarketMetadata {
    constructor(props?: Partial<MarketMetadata>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @StringColumn_({nullable: false})
    title!: string

    /**
     * Outcome labels, not indexed by outcomeIndex or winningIndex. V2 rules and V1 UMA ancillary data with a p1/p2 mapping list p1, p2, the reverse of outcome index order. NegRisk rows list Yes, No in index order. Other V1 rows follow their ancillary data, or Yes, No when it names none. A migrated V2 market without rules reuses its V1 row.
     */
    @StringColumn_({array: true, nullable: false})
    outcomes!: (string)[]

    @StringColumn_({nullable: false})
    rawAncillaryData!: string
}
