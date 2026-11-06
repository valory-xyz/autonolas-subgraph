import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, StringColumn as StringColumn_} from "@subsquid/typeorm-store"

@Entity_()
export class ServiceRegistry {
    constructor(props?: Partial<ServiceRegistry>) {
        Object.assign(this, props)
    }

    /**
     * utf8hex('registry') - singleton
     */
    @PrimaryColumn_()
    id!: string

    @StringColumn_({array: true, nullable: false})
    serviceAddresses!: (string)[]
}
