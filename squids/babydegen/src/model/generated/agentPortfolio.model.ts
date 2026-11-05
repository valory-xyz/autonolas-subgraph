import {BigDecimal} from "@subsquid/big-decimal"
import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, ManyToOne as ManyToOne_, Index as Index_, Relation as Relation_, BigDecimalColumn as BigDecimalColumn_, BigIntColumn as BigIntColumn_, IntColumn as IntColumn_} from "@subsquid/typeorm-store"
import {Service} from "./service.model"

@Entity_()
export class AgentPortfolio {
    constructor(props?: Partial<AgentPortfolio>) {
        Object.assign(this, props)
    }

    /**
     * Service safe address
     */
    @PrimaryColumn_()
    id!: string

    @Index_("idx_agent_portfolio_service_18f99bbf")
    @ManyToOne_(() => Service, {nullable: true})
    service!: Relation_<Service>

    @BigDecimalColumn_({nullable: false})
    finalValue!: BigDecimal

    @BigDecimalColumn_({nullable: false})
    finalValueWithoutRewards!: BigDecimal

    @BigDecimalColumn_({nullable: false})
    initialValue!: BigDecimal

    @BigDecimalColumn_({nullable: false})
    positionsValue!: BigDecimal

    @BigDecimalColumn_({nullable: false})
    uninvestedValue!: BigDecimal

    @BigDecimalColumn_({nullable: false})
    totalWithdrawnUsd!: BigDecimal

    @BigDecimalColumn_({nullable: false})
    unrealisedPnL!: BigDecimal

    @BigDecimalColumn_({nullable: false})
    roi!: BigDecimal

    @BigDecimalColumn_({nullable: false})
    apr!: BigDecimal

    @BigDecimalColumn_({nullable: false})
    projectedUnrealisedPnL!: BigDecimal

    @BigDecimalColumn_({nullable: false})
    unrealisedPnLWithRewards!: BigDecimal

    @BigDecimalColumn_({nullable: false})
    projectedUnrealisedPnLWithRewards!: BigDecimal

    @BigDecimalColumn_({nullable: false})
    ethAdjustedRoi!: BigDecimal

    @BigDecimalColumn_({nullable: false})
    ethAdjustedApr!: BigDecimal

    @BigDecimalColumn_({nullable: false})
    ethAdjustedUnrealisedPnL!: BigDecimal

    @BigDecimalColumn_({nullable: false})
    ethAdjustedProjectedUnrealisedPnL!: BigDecimal

    @BigDecimalColumn_({nullable: false})
    firstFundingEthPrice!: BigDecimal

    @BigDecimalColumn_({nullable: false})
    currentEthPrice!: BigDecimal

    @BigDecimalColumn_({nullable: false})
    totalInvestments!: BigDecimal

    @BigDecimalColumn_({nullable: false})
    totalGrossGains!: BigDecimal

    @BigDecimalColumn_({nullable: false})
    totalCosts!: BigDecimal

    @BigIntColumn_({nullable: false})
    firstTradingTimestamp!: bigint

    @BigIntColumn_({nullable: false})
    lastUpdated!: bigint

    @BigIntColumn_({nullable: false})
    lastSnapshotTimestamp!: bigint

    @BigIntColumn_({nullable: false})
    lastSnapshotBlock!: bigint

    @IntColumn_({nullable: false})
    totalPositions!: number

    @IntColumn_({nullable: false})
    totalClosedPositions!: number
}
