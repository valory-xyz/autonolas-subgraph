import {BigDecimal} from "@subsquid/big-decimal"
import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, ManyToOne as ManyToOne_, Index as Index_, Relation as Relation_, StringColumn as StringColumn_, IntColumn as IntColumn_, BigDecimalColumn as BigDecimalColumn_, BigIntColumn as BigIntColumn_} from "@subsquid/typeorm-store"
import {Service} from "./service.model"

@Entity_()
export class TokenBalance {
    constructor(props?: Partial<TokenBalance>) {
        Object.assign(this, props)
    }

    /**
     * utf8hex('<serviceSafe>-<token>')
     */
    @PrimaryColumn_()
    id!: string

    @Index_("idx_token_balance_service_eef09127")
    @ManyToOne_(() => Service, {nullable: true})
    service!: Relation_<Service>

    @StringColumn_({nullable: false})
    token!: string

    @StringColumn_({nullable: false})
    symbol!: string

    @IntColumn_({nullable: false})
    decimals!: number

    @BigDecimalColumn_({nullable: false})
    balance!: BigDecimal

    @BigDecimalColumn_({nullable: false})
    balanceUSD!: BigDecimal

    @BigIntColumn_({nullable: false})
    lastUpdated!: bigint

    @BigIntColumn_({nullable: false})
    lastBlock!: bigint
}
