import {BigDecimal} from "@subsquid/big-decimal"
import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, StringColumn as StringColumn_, Index as Index_, OneToOne as OneToOne_, JoinColumn as JoinColumn_, Relation as Relation_, BigIntColumn as BigIntColumn_, BigDecimalColumn as BigDecimalColumn_} from "@subsquid/typeorm-store"
import {Service} from "./service.model"

@Entity_()
export class Mech {
    constructor(props?: Partial<Mech>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @Index_("idx_mech_address_74fa810f")
    @StringColumn_({nullable: false})
    address!: string

    @StringColumn_({nullable: false})
    mechFactory!: string

    @StringColumn_({nullable: true})
    configHash!: string | undefined | null

    @StringColumn_({nullable: false})
    owner!: string

    @Index_("idx_mech_service_4619f4c5", {unique: true})
    @OneToOne_(() => Service, {nullable: true})
    @JoinColumn_()
    service!: Relation_<Service> | undefined | null

    @BigIntColumn_({nullable: false})
    totalDeliveriesTransactions!: bigint

    @BigIntColumn_({nullable: false})
    receivedRequests!: bigint

    @BigIntColumn_({nullable: false})
    selfDeliveredFromReceived!: bigint

    @BigIntColumn_({nullable: false})
    deliveredByOthersFromReceived!: bigint

    @BigIntColumn_({nullable: true})
    maxDeliveryRate!: bigint | undefined | null

    @BigDecimalColumn_({nullable: true})
    maxDeliveryRateUSD!: BigDecimal | undefined | null

    @BigIntColumn_({nullable: false})
    karma!: bigint

    @StringColumn_({nullable: false})
    paymentType!: string
}
