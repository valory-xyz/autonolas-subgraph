import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, StringColumn as StringColumn_, BigIntColumn as BigIntColumn_, BooleanColumn as BooleanColumn_, OneToOne as OneToOne_, Index as Index_, JoinColumn as JoinColumn_, Relation as Relation_} from "@subsquid/typeorm-store"
import {Deliver} from "./deliver.model"

@Entity_()
export class DeliverForMarketplace {
    constructor(props?: Partial<DeliverForMarketplace>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @StringColumn_({nullable: false})
    requestId!: string

    @StringColumn_({nullable: false})
    requestIdBytes!: string

    @StringColumn_({nullable: true})
    ipfsHashBytes!: string | undefined | null

    @StringColumn_({nullable: true})
    mechServiceMultisig!: string | undefined | null

    @BigIntColumn_({nullable: true})
    deliveryRate!: bigint | undefined | null

    @BooleanColumn_({nullable: true})
    isMarketplace!: boolean | undefined | null

    @BooleanColumn_({nullable: true})
    isOffChain!: boolean | undefined | null

    @Index_("idx_deliver_for_marketplace_deliver_c307e38d", {unique: true})
    @OneToOne_(() => Deliver, {nullable: true})
    @JoinColumn_()
    deliver!: Relation_<Deliver> | undefined | null
}
