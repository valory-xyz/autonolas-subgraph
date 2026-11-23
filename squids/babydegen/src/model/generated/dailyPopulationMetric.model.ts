import {BigDecimal} from "@subsquid/big-decimal"
import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, BigDecimalColumn as BigDecimalColumn_, IntColumn as IntColumn_, BigIntColumn as BigIntColumn_, Index as Index_, StringColumn as StringColumn_} from "@subsquid/typeorm-store"

/**
 * Population metrics of the day's snapshots (globalMetrics.ts), written on the
 * first poll block that takes a snapshot on a UTC day (immutable). The ethAdjusted
 * fields are deprecated and equal the unadjusted ones. The historicalMedian*
 * lists are decimal strings: SQD cannot store BigDecimal arrays, and graph-node
 * serves [BigDecimal!] as strings too.
 */
@Entity_()
export class DailyPopulationMetric {
    constructor(props?: Partial<DailyPopulationMetric>) {
        Object.assign(this, props)
    }

    /**
     * utf8hex('<UTC midnight timestamp>')
     */
    @PrimaryColumn_()
    id!: string

    @BigDecimalColumn_({nullable: false})
    medianPopulationROI!: BigDecimal

    @BigDecimalColumn_({nullable: false})
    medianPopulationAPR!: BigDecimal

    @BigDecimalColumn_({nullable: false})
    medianUnrealisedPnL!: BigDecimal

    @BigDecimalColumn_({nullable: false})
    medianProjectedUnrealisedPnL!: BigDecimal

    @BigDecimalColumn_({nullable: true})
    medianUnrealisedPnLWithRewards!: BigDecimal | undefined | null

    @BigDecimalColumn_({nullable: true})
    medianProjectedUnrealisedPnLWithRewards!: BigDecimal | undefined | null

    @BigDecimalColumn_({nullable: false})
    medianEthAdjustedROI!: BigDecimal

    @BigDecimalColumn_({nullable: false})
    medianEthAdjustedAPR!: BigDecimal

    @BigDecimalColumn_({nullable: false})
    medianEthAdjustedUnrealisedPnL!: BigDecimal

    @BigDecimalColumn_({nullable: false})
    medianEthAdjustedProjectedUnrealisedPnL!: BigDecimal

    @BigDecimalColumn_({nullable: true})
    medianLifetimeActiveUnrealisedPnL!: BigDecimal | undefined | null

    @BigDecimalColumn_({nullable: true})
    medianLifetimeActiveProjectedUnrealisedPnL!: BigDecimal | undefined | null

    @BigDecimalColumn_({nullable: true})
    medianLifetimeActiveEthAdjustedUnrealisedPnL!: BigDecimal | undefined | null

    @BigDecimalColumn_({nullable: true})
    medianLifetimeActiveEthAdjustedProjectedUnrealisedPnL!: BigDecimal | undefined | null

    @BigDecimalColumn_({nullable: true})
    medianLifetimeActiveAUM!: BigDecimal | undefined | null

    @BigDecimalColumn_({nullable: true})
    totalLifetimeActiveFundedAUM!: BigDecimal | undefined | null

    @IntColumn_({nullable: true})
    totalLifetimeActiveAgents!: number | undefined | null

    @BigDecimalColumn_({nullable: false})
    totalFundedAUM!: BigDecimal

    @BigDecimalColumn_({nullable: false})
    medianAUM!: BigDecimal

    @BigDecimalColumn_({nullable: false})
    averageAgentDaysActive!: BigDecimal

    @BigDecimalColumn_({nullable: false})
    sma7dROI!: BigDecimal

    @BigDecimalColumn_({nullable: false})
    sma7dAPR!: BigDecimal

    @BigDecimalColumn_({nullable: false})
    sma7dUnrealisedPnL!: BigDecimal

    @BigDecimalColumn_({nullable: false})
    sma7dProjectedUnrealisedPnL!: BigDecimal

    @BigDecimalColumn_({nullable: true})
    sma7dUnrealisedPnLWithRewards!: BigDecimal | undefined | null

    @BigDecimalColumn_({nullable: true})
    sma7dProjectedUnrealisedPnLWithRewards!: BigDecimal | undefined | null

    @BigDecimalColumn_({nullable: false})
    sma7dAUM!: BigDecimal

    @BigDecimalColumn_({nullable: false})
    sma7dEthAdjustedROI!: BigDecimal

    @BigDecimalColumn_({nullable: false})
    sma7dEthAdjustedAPR!: BigDecimal

    @BigDecimalColumn_({nullable: false})
    sma7dEthAdjustedUnrealisedPnL!: BigDecimal

    @BigDecimalColumn_({nullable: false})
    sma7dEthAdjustedProjectedUnrealisedPnL!: BigDecimal

    @BigDecimalColumn_({nullable: true})
    sma7dLifetimeActiveUnrealisedPnL!: BigDecimal | undefined | null

    @BigDecimalColumn_({nullable: true})
    sma7dLifetimeActiveProjectedUnrealisedPnL!: BigDecimal | undefined | null

    @BigDecimalColumn_({nullable: true})
    sma7dLifetimeActiveEthAdjustedUnrealisedPnL!: BigDecimal | undefined | null

    @BigDecimalColumn_({nullable: true})
    sma7dLifetimeActiveEthAdjustedProjectedUnrealisedPnL!: BigDecimal | undefined | null

    @BigDecimalColumn_({nullable: true})
    sma7dLifetimeActiveAUM!: BigDecimal | undefined | null

    /**
     * UTC midnight
     */
    @Index_("idx_daily_population_metric_timestamp_5c543a75")
    @BigIntColumn_({nullable: false})
    timestamp!: bigint

    @BigIntColumn_({nullable: false})
    block!: bigint

    @IntColumn_({nullable: false})
    totalAgents!: number

    @StringColumn_({array: true, nullable: false})
    historicalMedianROI!: (string)[]

    @StringColumn_({array: true, nullable: false})
    historicalMedianAPR!: (string)[]

    @StringColumn_({array: true, nullable: false})
    historicalMedianUnrealisedPnL!: (string)[]

    @StringColumn_({array: true, nullable: false})
    historicalMedianProjectedUnrealisedPnL!: (string)[]

    @StringColumn_({array: true, nullable: false})
    historicalMedianAUM!: (string)[]

    @StringColumn_({array: true, nullable: false})
    historicalMedianEthAdjustedROI!: (string)[]

    @StringColumn_({array: true, nullable: false})
    historicalMedianEthAdjustedAPR!: (string)[]

    @StringColumn_({array: true, nullable: false})
    historicalMedianEthAdjustedUnrealisedPnL!: (string)[]

    @StringColumn_({array: true, nullable: false})
    historicalMedianEthAdjustedProjectedUnrealisedPnL!: (string)[]

    @StringColumn_({array: true, nullable: true})
    historicalMedianLifetimeActiveUnrealisedPnL!: (string)[] | undefined | null

    @StringColumn_({array: true, nullable: true})
    historicalMedianLifetimeActiveProjectedUnrealisedPnL!: (string)[] | undefined | null

    @StringColumn_({array: true, nullable: true})
    historicalMedianLifetimeActiveEthAdjustedUnrealisedPnL!: (string)[] | undefined | null

    @StringColumn_({array: true, nullable: true})
    historicalMedianLifetimeActiveEthAdjustedProjectedUnrealisedPnL!: (string)[] | undefined | null

    @StringColumn_({array: true, nullable: true})
    historicalMedianLifetimeActiveAUM!: (string)[] | undefined | null
}
