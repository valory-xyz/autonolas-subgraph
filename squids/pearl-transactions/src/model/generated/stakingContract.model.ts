import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, StringColumn as StringColumn_, BigIntColumn as BigIntColumn_} from "@subsquid/typeorm-store"

@Entity_()
export class StakingContract {
    constructor(props?: Partial<StakingContract>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @StringColumn_({nullable: false})
    implementation!: string

    @BigIntColumn_({nullable: false})
    minStakingDeposit!: bigint

    @BigIntColumn_({nullable: false})
    numAgentInstances!: bigint

    @BigIntColumn_({nullable: false})
    createdBlock!: bigint

    @BigIntColumn_({nullable: false})
    createdTimestamp!: bigint
}
