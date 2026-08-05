import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, StringColumn as StringColumn_} from "@subsquid/typeorm-store"

/**
 * Created only when a service registers agent ID 86; gates TraderAgent creation.
 */
@Entity_()
export class TraderService {
    constructor(props?: Partial<TraderService>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @StringColumn_({nullable: true})
    multisig!: string | undefined | null
}
