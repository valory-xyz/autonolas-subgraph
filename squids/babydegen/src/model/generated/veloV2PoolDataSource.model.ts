import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, BigIntColumn as BigIntColumn_} from "@subsquid/typeorm-store"

/**
 * One row per Aerodrome v2 pool the subgraph attached a `VeloV2Pool` template
 * to: the LpSugar bootstrap at the start block and whitelisted PoolFactory
 * PoolCreated after it. (`AeroV2Pool` templates are the V2PoolVenue rows.)
 */
@Entity_()
export class VeloV2PoolDataSource {
    constructor(props?: Partial<VeloV2PoolDataSource>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @BigIntColumn_({nullable: false})
    createdAtBlock!: bigint
}
