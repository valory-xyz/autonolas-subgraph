import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, BigIntColumn as BigIntColumn_, BooleanColumn as BooleanColumn_, ManyToOne as ManyToOne_, Index as Index_, Relation as Relation_, StringColumn as StringColumn_, IntColumn as IntColumn_, OneToMany as OneToMany_} from "@subsquid/typeorm-store"
import {Global} from "./global.model"
import {ServiceRewardsHistory} from "./serviceRewardsHistory.model"

@Entity_()
export class Service {
    constructor(props?: Partial<Service>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @BigIntColumn_({nullable: false})
    currentOlasStaked!: bigint

    @BigIntColumn_({nullable: false})
    currentStakeAmount!: bigint

    @BooleanColumn_({nullable: false})
    hasOlasStake!: boolean

    @BigIntColumn_({nullable: false})
    olasRewardsEarned!: bigint

    @BigIntColumn_({nullable: false})
    olasRewardsClaimed!: bigint

    @BigIntColumn_({nullable: false})
    blockNumber!: bigint

    @BigIntColumn_({nullable: false})
    blockTimestamp!: bigint

    @Index_("idx_service_global_7011ef20")
    @ManyToOne_(() => Global, {nullable: true})
    global!: Relation_<Global>

    @StringColumn_({nullable: true})
    latestStakingContract!: string | undefined | null

    @IntColumn_({nullable: false})
    totalEpochsParticipated!: number

    @OneToMany_(() => ServiceRewardsHistory, e => e.service)
    rewardsHistory!: Relation_<ServiceRewardsHistory[]>
}
