import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, StringColumn as StringColumn_, BooleanColumn as BooleanColumn_, OneToOne as OneToOne_, Index as Index_, JoinColumn as JoinColumn_, Relation as Relation_} from "@subsquid/typeorm-store"
import {Request} from "./request.model"

@Entity_()
export class RequestToMarketplace {
    constructor(props?: Partial<RequestToMarketplace>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @StringColumn_({nullable: false})
    requestIdBytes!: string

    @StringColumn_({nullable: true})
    ipfsHashBytes!: string | undefined | null

    @BooleanColumn_({nullable: true})
    isMarketplace!: boolean | undefined | null

    @BooleanColumn_({nullable: true})
    isOffChain!: boolean | undefined | null

    @Index_("idx_request_to_marketplace_request_00cb1917", {unique: true})
    @OneToOne_(() => Request, {nullable: true})
    @JoinColumn_()
    request!: Relation_<Request>
}
