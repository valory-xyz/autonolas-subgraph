import {BigDecimal} from "@subsquid/big-decimal"
import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, ManyToOne as ManyToOne_, Index as Index_, Relation as Relation_, BigDecimalColumn as BigDecimalColumn_, BigIntColumn as BigIntColumn_} from "@subsquid/typeorm-store"
import {Token} from "./token.model"
import {PriceSource} from "./priceSource.model"

@Entity_()
export class PriceUpdate {
    constructor(props?: Partial<PriceUpdate>) {
        Object.assign(this, props)
    }

    /**
     * token address ++ utf8hex(timestamp)
     */
    @PrimaryColumn_()
    id!: string

    @Index_("idx_price_update_token_01bfa0c0")
    @ManyToOne_(() => Token, {nullable: true})
    token!: Relation_<Token>

    @BigDecimalColumn_({nullable: false})
    priceUSD!: BigDecimal

    @Index_("idx_price_update_source_af84fe31")
    @ManyToOne_(() => PriceSource, {nullable: true})
    source!: Relation_<PriceSource>

    @BigDecimalColumn_({nullable: false})
    confidence!: BigDecimal

    @BigIntColumn_({nullable: false})
    timestamp!: bigint

    /**
     * Always 0, as in the subgraph
     */
    @BigIntColumn_({nullable: false})
    block!: bigint
}
