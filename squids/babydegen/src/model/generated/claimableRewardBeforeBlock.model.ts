import {BigDecimal} from "@subsquid/big-decimal"
import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, BigIntColumn as BigIntColumn_, BigDecimalColumn as BigDecimalColumn_} from "@subsquid/typeorm-store"

/**
 * A position's claimableReward as it stood before the first refresh in a block
 */
@Entity_()
export class ClaimableRewardBeforeBlock {
    constructor(props?: Partial<ClaimableRewardBeforeBlock>) {
        Object.assign(this, props)
    }

    /**
     * ProtocolPosition id
     */
    @PrimaryColumn_()
    id!: string

    @BigIntColumn_({nullable: false})
    block!: bigint

    @BigDecimalColumn_({nullable: false})
    claimableReward!: BigDecimal
}
