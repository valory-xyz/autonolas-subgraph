import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, IntColumn as IntColumn_, Index as Index_, StringColumn as StringColumn_, BigIntColumn as BigIntColumn_} from "@subsquid/typeorm-store"

@Entity_()
export class Multisig {
    constructor(props?: Partial<Multisig>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @Index_("idx_multisig_service_id_0afa46ea")
    @IntColumn_({nullable: false})
    serviceId!: number

    @StringColumn_({nullable: false})
    creator!: string

    @BigIntColumn_({nullable: false})
    creationTimestamp!: bigint

    @StringColumn_({nullable: false})
    txHash!: string

    @IntColumn_({array: true, nullable: false})
    agentIds!: (number)[]
}
