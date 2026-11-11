import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, StringColumn as StringColumn_, BooleanColumn as BooleanColumn_} from "@subsquid/typeorm-store"

/**
 * Venue of a v2 pool, written by the Aero factory handler that created it (and its AeroV2Pool template)
 */
@Entity_()
export class V2PoolVenue {
    constructor(props?: Partial<V2PoolVenue>) {
        Object.assign(this, props)
    }

    /**
     * pool
     */
    @PrimaryColumn_()
    id!: string

    @StringColumn_({nullable: false})
    protocol!: string

    @BooleanColumn_({nullable: false})
    stable!: boolean
}
