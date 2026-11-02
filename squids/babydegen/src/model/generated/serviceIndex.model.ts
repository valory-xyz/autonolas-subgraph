import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, BigIntColumn as BigIntColumn_, StringColumn as StringColumn_} from "@subsquid/typeorm-store"

@Entity_()
export class ServiceIndex {
    constructor(props?: Partial<ServiceIndex>) {
        Object.assign(this, props)
    }

    /**
     * utf8hex(serviceId)
     */
    @PrimaryColumn_()
    id!: string

    @BigIntColumn_({nullable: false})
    serviceId!: bigint

    @StringColumn_({nullable: false})
    currentServiceSafe!: string
}
