import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, IntColumn as IntColumn_, StringColumn as StringColumn_} from "@subsquid/typeorm-store"

@Entity_()
export class PendingRegistration {
    constructor(props?: Partial<PendingRegistration>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @IntColumn_({array: true, nullable: false})
    agentIds!: (number)[]

    @StringColumn_({array: true, nullable: false})
    operators!: (string)[]
}
