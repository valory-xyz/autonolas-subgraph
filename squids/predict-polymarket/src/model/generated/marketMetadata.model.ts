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

    @StringColumn_({array: true, nullable: false})
    outcomes!: (string)[]

    @StringColumn_({nullable: false})
    rawAncillaryData!: string
}
