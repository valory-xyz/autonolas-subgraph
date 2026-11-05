import {BigDecimal} from "@subsquid/big-decimal"
import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, ManyToOne as ManyToOne_, Index as Index_, Relation as Relation_, StringColumn as StringColumn_, IntColumn as IntColumn_, BooleanColumn as BooleanColumn_, BigIntColumn as BigIntColumn_, BigDecimalColumn as BigDecimalColumn_} from "@subsquid/typeorm-store"
import {Token} from "./token.model"

@Entity_()
export class PriceSource {
    constructor(props?: Partial<PriceSource>) {
        Object.assign(this, props)
    }

    /**
     * Feed or pool address
     */
    @PrimaryColumn_()
    id!: string

    @Index_("idx_price_source_token_e928cbf6")
    @ManyToOne_(() => Token, {nullable: true})
    token!: Relation_<Token>

    @StringColumn_({nullable: false})
    sourceType!: string

    @IntColumn_({nullable: false})
    priority!: number

    @BooleanColumn_({nullable: false})
    isActive!: boolean

    @BigIntColumn_({nullable: false})
    lastUpdate!: bigint

    @BigDecimalColumn_({nullable: false})
    lastPrice!: BigDecimal

    @BigDecimalColumn_({nullable: false})
    confidence!: BigDecimal
}
