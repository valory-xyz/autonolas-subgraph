import {BigDecimal} from "@subsquid/big-decimal"
import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, ManyToOne as ManyToOne_, Index as Index_, Relation as Relation_, BigDecimalColumn as BigDecimalColumn_, BigIntColumn as BigIntColumn_, IntColumn as IntColumn_} from "@subsquid/typeorm-store"
import {Service} from "./service.model"
import {AgentPortfolio} from "./agentPortfolio.model"

/**
 * Daily portfolio state, written by the PortfolioScheduler on UTC-day crossings (immutable)
 */
@Entity_()
export class AgentPortfolioSnapshot {
    constructor(props?: Partial<AgentPortfolioSnapshot>) {
        Object.assign(this, props)
    }

    /**
     * utf8hex('<serviceSafe>-<timestamp>')
     */
    @PrimaryColumn_()
    id!: string

    @Index_("idx_agent_portfolio_snapshot_service_b541ed42")
    @ManyToOne_(() => Service, {nullable: true})
    service!: Relation_<Service>

    @Index_("idx_agent_portfolio_snapshot_portfolio_422af5b4")
    @ManyToOne_(() => AgentPortfolio, {nullable: true})
    portfolio!: Relation_<AgentPortfolio>

    @BigDecimalColumn_({nullable: false})
    finalValue!: BigDecimal

    @BigDecimalColumn_({nullable: false})
    initialValue!: BigDecimal

    @BigDecimalColumn_({nullable: false})
    positionsValue!: BigDecimal

    @BigDecimalColumn_({nullable: false})
    uninvestedValue!: BigDecimal

    @BigDecimalColumn_({nullable: false})
    totalWithdrawnUsd!: BigDecimal

    @BigDecimalColumn_({nullable: false})
    roi!: BigDecimal

    @BigDecimalColumn_({nullable: false})
    apr!: BigDecimal

    @BigDecimalColumn_({nullable: false})
    unrealisedPnL!: BigDecimal

    @BigDecimalColumn_({nullable: false})
    projectedUnrealisedPnL!: BigDecimal

    /**
     * Deprecated: equals the unadjusted value
     */
    @BigDecimalColumn_({nullable: false})
    ethAdjustedRoi!: BigDecimal

    /**
     * Deprecated: equals the unadjusted value
     */
    @BigDecimalColumn_({nullable: false})
    ethAdjustedApr!: BigDecimal

    /**
     * Deprecated: equals the unadjusted value
     */
    @BigDecimalColumn_({nullable: false})
    ethAdjustedUnrealisedPnL!: BigDecimal

    /**
     * Deprecated: equals the unadjusted value
     */
    @BigDecimalColumn_({nullable: false})
    ethAdjustedProjectedUnrealisedPnL!: BigDecimal

    @Index_("idx_agent_portfolio_snapshot_timestamp_bb9db4d1")
    @BigIntColumn_({nullable: false})
    timestamp!: bigint

    @BigIntColumn_({nullable: false})
    block!: bigint

    @IntColumn_({nullable: false})
    totalPositions!: number

    @IntColumn_({nullable: false})
    totalClosedPositions!: number
}
