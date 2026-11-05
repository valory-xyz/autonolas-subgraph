import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, BigIntColumn as BigIntColumn_, StringColumn as StringColumn_, BooleanColumn as BooleanColumn_, OneToMany as OneToMany_, Relation as Relation_} from "@subsquid/typeorm-store"
import {TokenBalance} from "./tokenBalance.model"

@Entity_()
export class Service {
    constructor(props?: Partial<Service>) {
        Object.assign(this, props)
    }

    /**
     * Service safe address
     */
    @PrimaryColumn_()
    id!: string

    @BigIntColumn_({nullable: false})
    serviceId!: bigint

    @StringColumn_({nullable: false})
    operatorSafe!: string

    @StringColumn_({nullable: false})
    serviceSafe!: string

    @BigIntColumn_({nullable: false})
    latestRegistrationBlock!: bigint

    @BigIntColumn_({nullable: false})
    latestRegistrationTimestamp!: bigint

    @StringColumn_({nullable: false})
    latestRegistrationTxHash!: string

    @BigIntColumn_({nullable: false})
    latestMultisigBlock!: bigint

    @BigIntColumn_({nullable: false})
    latestMultisigTimestamp!: bigint

    @StringColumn_({nullable: false})
    latestMultisigTxHash!: string

    @BooleanColumn_({nullable: false})
    isActive!: boolean

    @BigIntColumn_({nullable: false})
    createdAt!: bigint

    @BigIntColumn_({nullable: false})
    updatedAt!: bigint

    @OneToMany_(() => TokenBalance, e => e.service)
    balances!: Relation_<TokenBalance[]>

    /**
     * Position ids for iteration (filled from slice 2)
     */
    @StringColumn_({array: true, nullable: false})
    positionIds!: (string)[]
}
