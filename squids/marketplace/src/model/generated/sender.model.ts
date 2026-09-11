import {BigDecimal} from "@subsquid/big-decimal"
import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, OneToMany as OneToMany_, Relation as Relation_, BigIntColumn as BigIntColumn_, BigDecimalColumn as BigDecimalColumn_} from "@subsquid/typeorm-store"
import {Request} from "./request.model"

@Entity_()
export class Sender {
    constructor(props?: Partial<Sender>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @OneToMany_(() => Request, e => e.sender)
    requests!: Relation_<Request[]>

    @BigIntColumn_({nullable: false})
    totalLegacyRequests!: bigint

    @BigIntColumn_({nullable: false})
    totalLegacyTransactions!: bigint

    @BigIntColumn_({nullable: false})
    totalLegacyAtaTransactions!: bigint

    @BigIntColumn_({nullable: false})
    totalMarketplaceRequests!: bigint

    @BigIntColumn_({nullable: false})
    totalOffChainRequests!: bigint

    @BigDecimalColumn_({nullable: false})
    totalFeesPaidUSD!: BigDecimal
}
