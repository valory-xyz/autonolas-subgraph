import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, BigIntColumn as BigIntColumn_} from "@subsquid/typeorm-store"

/**
 * One row per address the subgraph attached a `Safe` template to (service and
 * operator safes). The processor rebuilds its log filters from this table and
 * Service at every (re)start; see src/sources.ts.
 */
@Entity_()
export class SafeDataSource {
    constructor(props?: Partial<SafeDataSource>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @BigIntColumn_({nullable: false})
    createdAtBlock!: bigint
}
