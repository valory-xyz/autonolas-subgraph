import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, StringColumn as StringColumn_, ManyToOne as ManyToOne_, Index as Index_, Relation as Relation_, BigIntColumn as BigIntColumn_} from "@subsquid/typeorm-store"
import {Token} from "./token.model"

@Entity_()
export class TokenBalance {
    constructor(props?: Partial<TokenBalance>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @StringColumn_({nullable: false})
    safe!: string

    @Index_("idx_token_balance_token_63c52d93")
    @ManyToOne_(() => Token, {nullable: true})
    token!: Relation_<Token>

    @BigIntColumn_({nullable: false})
    balance!: bigint

    @BigIntColumn_({nullable: false})
    lastUpdatedTimestamp!: bigint

    @BigIntColumn_({nullable: false})
    lastUpdatedBlock!: bigint
}
