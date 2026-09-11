import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, BigIntColumn as BigIntColumn_, Index as Index_, StringColumn as StringColumn_} from "@subsquid/typeorm-store"

@Entity_()
export class CreateMultisigWithAgents {
    constructor(props?: Partial<CreateMultisigWithAgents>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @Index_("idx_create_multisig_with_agents_service_id_791bb1e6")
    @BigIntColumn_({nullable: false})
    serviceId!: bigint

    @StringColumn_({nullable: false})
    multisig!: string

    @BigIntColumn_({nullable: false})
    blockNumber!: bigint

    @BigIntColumn_({nullable: false})
    blockTimestamp!: bigint

    @StringColumn_({nullable: false})
    transactionHash!: string
}
