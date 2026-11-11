import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, BigIntColumn as BigIntColumn_} from "@subsquid/typeorm-store"

/**
 * Principal released by DecreaseLiquidity and not yet collected
 */
@Entity_()
export class UncollectedPrincipal {
    constructor(props?: Partial<UncollectedPrincipal>) {
        Object.assign(this, props)
    }

    /**
     * utf8hex('<protocol>-<tokenId>')
     */
    @PrimaryColumn_()
    id!: string

    @BigIntColumn_({nullable: false})
    amount0!: bigint

    @BigIntColumn_({nullable: false})
    amount1!: bigint
}
