import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, BigIntColumn as BigIntColumn_, StringColumn as StringColumn_, BooleanColumn as BooleanColumn_} from "@subsquid/typeorm-store"

@Entity_()
export class ServiceBaselineState {
    constructor(props?: Partial<ServiceBaselineState>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @BigIntColumn_({nullable: false})
    serviceId!: bigint

    @StringColumn_({nullable: false})
    contractAddress!: string

    @BooleanColumn_({nullable: false})
    baselineMissing!: boolean

    @BigIntColumn_({nullable: false})
    epoch!: bigint
}
