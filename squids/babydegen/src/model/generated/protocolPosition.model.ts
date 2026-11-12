import {BigDecimal} from "@subsquid/big-decimal"
import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, StringColumn as StringColumn_, Index as Index_, ManyToOne as ManyToOne_, Relation as Relation_, BooleanColumn as BooleanColumn_, BigDecimalColumn as BigDecimalColumn_, BigIntColumn as BigIntColumn_, IntColumn as IntColumn_} from "@subsquid/typeorm-store"
import {Service} from "./service.model"

/**
 * CL: utf8hex('<agent>-<protocol>-<tokenId>'), v2: utf8hex('<agent>-<protocol>-<pool>')
 */
@Entity_()
export class ProtocolPosition {
    constructor(props?: Partial<ProtocolPosition>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @Index_("idx_protocol_position_agent_a86c515e")
    @StringColumn_({nullable: false})
    agent!: string

    @Index_("idx_protocol_position_service_2629f791")
    @ManyToOne_(() => Service, {nullable: true})
    service!: Relation_<Service> | undefined | null

    /**
     * aerodrome-cl, aerodrome-v2, aero-cl or aero-v2
     */
    @Index_("idx_protocol_position_protocol_42576630")
    @StringColumn_({nullable: false})
    protocol!: string

    @StringColumn_({nullable: false})
    pool!: string

    @BooleanColumn_({nullable: false})
    isActive!: boolean

    @BigDecimalColumn_({nullable: false})
    usdCurrent!: BigDecimal

    @BigDecimalColumn_({nullable: false})
    usdCurrentWithRewards!: BigDecimal

    @StringColumn_({nullable: true})
    token0!: string | undefined | null

    @StringColumn_({nullable: true})
    token0Symbol!: string | undefined | null

    @BigDecimalColumn_({nullable: true})
    amount0!: BigDecimal | undefined | null

    @BigDecimalColumn_({nullable: false})
    amount0USD!: BigDecimal

    @StringColumn_({nullable: true})
    token1!: string | undefined | null

    @StringColumn_({nullable: true})
    token1Symbol!: string | undefined | null

    @BigDecimalColumn_({nullable: true})
    amount1!: BigDecimal | undefined | null

    @BigDecimalColumn_({nullable: false})
    amount1USD!: BigDecimal

    @BigIntColumn_({nullable: true})
    liquidity!: bigint | undefined | null

    @BigDecimalColumn_({nullable: true})
    claimableReward!: BigDecimal | undefined | null

    @BigDecimalColumn_({nullable: true})
    claimableRewardUSD!: BigDecimal | undefined | null

    /**
     * Fee part of Collect in token0, principal excluded
     */
    @BigDecimalColumn_({nullable: false})
    collectedFees0!: BigDecimal

    @BigDecimalColumn_({nullable: false})
    collectedFees1!: BigDecimal

    @BigDecimalColumn_({nullable: false})
    collectedFeesUSD!: BigDecimal

    /**
     * Reward token units: legacy AERO or Aero's AERO
     */
    @BigDecimalColumn_({nullable: false})
    claimedRewards!: BigDecimal

    @BigDecimalColumn_({nullable: false})
    claimedRewardsUSD!: BigDecimal

    @BigIntColumn_({nullable: false})
    tokenId!: bigint

    @StringColumn_({nullable: true})
    rewardsContract!: string | undefined | null

    @IntColumn_({nullable: false})
    tickLower!: number

    @IntColumn_({nullable: false})
    tickUpper!: number

    @IntColumn_({nullable: true})
    tickSpacing!: number | undefined | null

    @IntColumn_({nullable: true})
    fee!: number | undefined | null

    @StringColumn_({nullable: false})
    entryTxHash!: string

    @BigIntColumn_({nullable: false})
    entryTimestamp!: bigint

    @BigDecimalColumn_({nullable: false})
    entryAmount0!: BigDecimal

    @BigDecimalColumn_({nullable: false})
    entryAmount0USD!: BigDecimal

    @BigDecimalColumn_({nullable: false})
    entryAmount1!: BigDecimal

    @BigDecimalColumn_({nullable: false})
    entryAmount1USD!: BigDecimal

    @BigDecimalColumn_({nullable: false})
    entryAmountUSD!: BigDecimal

    @StringColumn_({nullable: true})
    exitTxHash!: string | undefined | null

    @BigIntColumn_({nullable: true})
    exitTimestamp!: bigint | undefined | null

    @BigDecimalColumn_({nullable: true})
    exitAmount0!: BigDecimal | undefined | null

    @BigDecimalColumn_({nullable: true})
    exitAmount0USD!: BigDecimal | undefined | null

    @BigDecimalColumn_({nullable: true})
    exitAmount1!: BigDecimal | undefined | null

    @BigDecimalColumn_({nullable: true})
    exitAmount1USD!: BigDecimal | undefined | null

    @BigDecimalColumn_({nullable: true})
    exitAmountUSD!: BigDecimal | undefined | null

    @BigDecimalColumn_({nullable: false})
    totalCostsUSD!: BigDecimal

    @BigDecimalColumn_({nullable: false})
    swapSlippageUSD!: BigDecimal

    @BigDecimalColumn_({nullable: false})
    investmentUSD!: BigDecimal

    @BigDecimalColumn_({nullable: false})
    grossGainUSD!: BigDecimal

    @BigDecimalColumn_({nullable: false})
    netGainUSD!: BigDecimal

    @BigDecimalColumn_({nullable: false})
    positionROI!: BigDecimal
}
