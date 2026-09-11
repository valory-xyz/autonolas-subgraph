import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, IntColumn as IntColumn_, BigIntColumn as BigIntColumn_} from "@subsquid/typeorm-store"

@Entity_()
export class AgentRegistration {
    constructor(props?: Partial<AgentRegistration>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @IntColumn_({nullable: false})
    serviceId!: number

    @IntColumn_({nullable: false})
    agentId!: number

    @BigIntColumn_({nullable: false})
    registrationTimestamp!: bigint
}
