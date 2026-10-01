import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, StringColumn as StringColumn_, BooleanColumn as BooleanColumn_, BigIntColumn as BigIntColumn_} from "@subsquid/typeorm-store"

@Entity_()
export class StakingContract {
    constructor(props?: Partial<StakingContract>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @StringColumn_({nullable: false})
    sender!: string

    @StringColumn_({nullable: false})
    instance!: string

    @StringColumn_({nullable: false})
    implementation!: string

    @StringColumn_({nullable: true})
    stakingManager!: string | undefined | null

    @StringColumn_({nullable: true})
    stakingToken!: string | undefined | null

    @StringColumn_({nullable: true})
    serviceRegistryTokenUtility!: string | undefined | null

    @StringColumn_({nullable: true})
    version!: string | undefined | null

    @BooleanColumn_({nullable: false})
    configComplete!: boolean

    @BooleanColumn_({nullable: false})
    isOlasStaking!: boolean

    @BooleanColumn_({nullable: false})
    eventsIndexed!: boolean

    @StringColumn_({nullable: false})
    metadataHash!: string

    @BigIntColumn_({nullable: false})
    maxNumServices!: bigint

    @BigIntColumn_({nullable: false})
    rewardsPerSecond!: bigint

    @BigIntColumn_({nullable: false})
    minStakingDeposit!: bigint

    @BigIntColumn_({nullable: false})
    minStakingDuration!: bigint

    @BigIntColumn_({nullable: false})
    maxNumInactivityPeriods!: bigint

    @BigIntColumn_({nullable: false})
    livenessPeriod!: bigint

    @BigIntColumn_({nullable: false})
    timeForEmissions!: bigint

    @BigIntColumn_({nullable: false})
    numAgentInstances!: bigint

    @StringColumn_({array: true, nullable: false})
    agentIds!: (string)[]

    @BigIntColumn_({nullable: false})
    threshold!: bigint

    @StringColumn_({nullable: false})
    configHash!: string

    @StringColumn_({nullable: false})
    proxyHash!: string

    @StringColumn_({nullable: false})
    serviceRegistry!: string

    @StringColumn_({nullable: false})
    activityChecker!: string
}
