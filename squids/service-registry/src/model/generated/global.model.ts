import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, BigIntColumn as BigIntColumn_, IntColumn as IntColumn_} from "@subsquid/typeorm-store"

@Entity_()
export class Global {
    constructor(props?: Partial<Global>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @BigIntColumn_({nullable: false})
    txCount!: bigint

    @BigIntColumn_({nullable: false})
    lastUpdated!: bigint

    @IntColumn_({nullable: false})
    totalOperators!: number
}
