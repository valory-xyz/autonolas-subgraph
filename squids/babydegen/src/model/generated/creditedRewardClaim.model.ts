import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_} from "@subsquid/typeorm-store"

/**
 * Reward claim logs already credited to a position
 */
@Entity_()
export class CreditedRewardClaim {
    constructor(props?: Partial<CreditedRewardClaim>) {
        Object.assign(this, props)
    }

    /**
     * txHash ++ logIndex as 4 little-endian bytes (graph-ts concatI32)
     */
    @PrimaryColumn_()
    id!: string
}
