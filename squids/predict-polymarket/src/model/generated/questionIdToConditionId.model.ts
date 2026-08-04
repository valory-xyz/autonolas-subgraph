import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, StringColumn as StringColumn_} from "@subsquid/typeorm-store"

@Entity_()
export class QuestionIdToConditionId {
    constructor(props?: Partial<QuestionIdToConditionId>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @StringColumn_({nullable: false})
    oracle!: string

    @StringColumn_({nullable: false})
    conditionId!: string

    @StringColumn_({nullable: false})
    transactionHash!: string
}
