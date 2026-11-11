import {BigDecimal} from "@subsquid/big-decimal"
import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, ManyToOne as ManyToOne_, Index as Index_, Relation as Relation_, BigDecimalColumn as BigDecimalColumn_, BigIntColumn as BigIntColumn_, StringColumn as StringColumn_} from "@subsquid/typeorm-store"
import {Service} from "./service.model"

@Entity_()
export class FundingBalance {
    constructor(props?: Partial<FundingBalance>) {
        Object.assign(this, props)
    }

    /**
     * Service safe address
     */
    @PrimaryColumn_()
    id!: string

    @Index_("idx_funding_balance_service_c8abeca3")
    @ManyToOne_(() => Service, {nullable: true})
    service!: Relation_<Service> | undefined | null

    @BigDecimalColumn_({nullable: false})
    totalInUsd!: BigDecimal

    /**
     * Deprecated: no longer written, stays 0
     */
    @BigDecimalColumn_({nullable: false})
    totalOutUsd!: BigDecimal

    /**
     * Tracked tokens and ETH withdrawn to the user side, or to a contract when nothing came back in the same tx
     */
    @BigDecimalColumn_({nullable: false})
    totalWithdrawnUsd!: BigDecimal

    /**
     * Equals totalInUsd
     */
    @BigDecimalColumn_({nullable: false})
    netUsd!: BigDecimal

    @BigIntColumn_({nullable: false})
    firstInTimestamp!: bigint

    @BigIntColumn_({nullable: false})
    lastChangeTs!: bigint

    @StringColumn_({array: true, nullable: false})
    fundingInTxs!: (string)[]

    /**
     * Deprecated: no longer written, stays empty
     */
    @StringColumn_({array: true, nullable: false})
    fundingOutTxs!: (string)[]
}
