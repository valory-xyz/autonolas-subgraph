import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, ManyToOne as ManyToOne_, Index as Index_, Relation as Relation_, BigIntColumn as BigIntColumn_, StringColumn as StringColumn_} from "@subsquid/typeorm-store"
import {Question} from "./question.model"

@Entity_()
export class QuestionResolution {
    constructor(props?: Partial<QuestionResolution>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @Index_("idx_question_resolution_question_03e9c2da")
    @ManyToOne_(() => Question, {nullable: true})
    question!: Relation_<Question>

    /**
     * Winning outcome index (0 or 1). -1 means the market resolved invalid/unresolvable — NOT an index into Question.metadata.outcomes.
     */
    @BigIntColumn_({nullable: false})
    winningIndex!: bigint

    @BigIntColumn_({nullable: false})
    settledPrice!: bigint

    @StringColumn_({array: true, nullable: false})
    payouts!: (string)[]

    @BigIntColumn_({nullable: false})
    blockNumber!: bigint

    @BigIntColumn_({nullable: false})
    blockTimestamp!: bigint

    @StringColumn_({nullable: false})
    transactionHash!: string
}
