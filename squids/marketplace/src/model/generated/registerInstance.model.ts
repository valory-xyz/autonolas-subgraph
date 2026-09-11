import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, StringColumn as StringColumn_, BigIntColumn as BigIntColumn_, Index as Index_} from "@subsquid/typeorm-store"

@Entity_()
export class RegisterInstance {
    constructor(props?: Partial<RegisterInstance>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @StringColumn_({nullable: false})
    operator!: string

    @Index_("idx_register_instance_service_id_543b5367")
    @BigIntColumn_({nullable: false})
    serviceId!: bigint

    @Index_("idx_register_instance_agent_instance_0a5e7d53")
    @StringColumn_({nullable: false})
    agentInstance!: string

    @BigIntColumn_({nullable: false})
    agentId!: bigint

    @BigIntColumn_({nullable: false})
    blockNumber!: bigint

    @BigIntColumn_({nullable: false})
    blockTimestamp!: bigint

    @StringColumn_({nullable: false})
    transactionHash!: string
}
