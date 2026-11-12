import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, BooleanColumn as BooleanColumn_, BigIntColumn as BigIntColumn_} from "@subsquid/typeorm-store"

@Entity_()
export class AddressType {
    constructor(props?: Partial<AddressType>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @BooleanColumn_({nullable: false})
    isContract!: boolean

    /**
     * A contract that answers getThreshold(): a Safe, so the user side
     */
    @BooleanColumn_({nullable: false})
    isSafe!: boolean

    @BigIntColumn_({nullable: false})
    checkedAt!: bigint
}
