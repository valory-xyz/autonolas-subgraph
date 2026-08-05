import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, StringColumn as StringColumn_, BooleanColumn as BooleanColumn_, ManyToOne as ManyToOne_, Index as Index_, Relation as Relation_, OneToMany as OneToMany_, BigIntColumn as BigIntColumn_} from "@subsquid/typeorm-store"
import {MarketMetadata} from "./marketMetadata.model"
import {Bet} from "./bet.model"
import {MarketParticipant} from "./marketParticipant.model"

@Entity_()
export class Question {
    constructor(props?: Partial<Question>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @StringColumn_({nullable: false})
    questionId!: string

    @BooleanColumn_({nullable: false})
    isNegRisk!: boolean

    @StringColumn_({nullable: true})
    marketId!: string | undefined | null

    @Index_("idx_question_metadata_8ddf9689")
    @ManyToOne_(() => MarketMetadata, {nullable: true})
    metadata!: Relation_<MarketMetadata>

    @OneToMany_(() => Bet, e => e.question)
    bets!: Relation_<Bet[]>

    @OneToMany_(() => MarketParticipant, e => e.question)
    participants!: Relation_<MarketParticipant[]>

    @BigIntColumn_({nullable: false})
    blockNumber!: bigint

    @BigIntColumn_({nullable: false})
    blockTimestamp!: bigint

    @StringColumn_({nullable: false})
    transactionHash!: string
}
