import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, BigIntColumn as BigIntColumn_, OneToMany as OneToMany_, Relation as Relation_} from "@subsquid/typeorm-store"
import {Service} from "./service.model"

@Entity_()
export class Global {
    constructor(props?: Partial<Global>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @BigIntColumn_({nullable: false})
    cumulativeOlasStaked!: bigint

    @BigIntColumn_({nullable: false})
    cumulativeOlasUnstaked!: bigint

    @BigIntColumn_({nullable: false})
    currentOlasStaked!: bigint

    @BigIntColumn_({nullable: false})
    totalRewards!: bigint

    @BigIntColumn_({nullable: false})
    totalRewardsClaimed!: bigint

    @BigIntColumn_({nullable: false})
    lastActiveDayTimestamp!: bigint

    @OneToMany_(() => Service, e => e.global)
    services!: Relation_<Service[]>
}
