import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, StringColumn as StringColumn_, BigIntColumn as BigIntColumn_} from "@subsquid/typeorm-store"

/**
 * Aero pool -> gauge, from GaugeManager GaugeCreated
 */
@Entity_()
export class AeroGauge {
    constructor(props?: Partial<AeroGauge>) {
        Object.assign(this, props)
    }

    /**
     * pool
     */
    @PrimaryColumn_()
    id!: string

    @StringColumn_({nullable: false})
    gauge!: string

    @BigIntColumn_({nullable: false})
    createdAtBlock!: bigint
}
