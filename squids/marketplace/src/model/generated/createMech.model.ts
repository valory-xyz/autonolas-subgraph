import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, StringColumn as StringColumn_, BigIntColumn as BigIntColumn_, Index as Index_} from "@subsquid/typeorm-store"
import {Source} from "./_source"

@Entity_()
export class CreateMech {
    constructor(props?: Partial<CreateMech>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @StringColumn_({nullable: false})
    mech!: string

    @Column_("varchar", {length: 11, nullable: true})
    source!: Source | undefined | null

    @Index_("idx_create_mech_service_id_a4715971")
    @BigIntColumn_({nullable: true})
    serviceId!: bigint | undefined | null

    @StringColumn_({nullable: true})
    mechFactory!: string | undefined | null

    @BigIntColumn_({nullable: false})
    blockNumber!: bigint

    @BigIntColumn_({nullable: false})
    blockTimestamp!: bigint

    @StringColumn_({nullable: false})
    transactionHash!: string
}
