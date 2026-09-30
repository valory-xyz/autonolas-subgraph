import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, ManyToOne as ManyToOne_, Index as Index_, Relation as Relation_, BigIntColumn as BigIntColumn_, StringColumn as StringColumn_} from "@subsquid/typeorm-store"
import {Service} from "./service.model"
import {Checkpoint} from "./checkpoint.model"

@Entity_()
export class ServiceRewardsHistory {
    constructor(props?: Partial<ServiceRewardsHistory>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @Index_("idx_service_rewards_history_service_3003be4e")
    @ManyToOne_(() => Service, {nullable: true})
    service!: Relation_<Service>

    @BigIntColumn_({nullable: false})
    epoch!: bigint

    @StringColumn_({nullable: false})
    contractAddress!: string

    @Index_("idx_service_rewards_history_checkpoint_4df10410")
    @ManyToOne_(() => Checkpoint, {nullable: true})
    checkpoint!: Relation_<Checkpoint> | undefined | null

    @BigIntColumn_({nullable: false})
    rewardAmount!: bigint

    @BigIntColumn_({nullable: true})
    checkpointedAt!: bigint | undefined | null

    @BigIntColumn_({nullable: false})
    blockNumber!: bigint

    @BigIntColumn_({nullable: false})
    blockTimestamp!: bigint

    @StringColumn_({nullable: false})
    transactionHash!: string
}
