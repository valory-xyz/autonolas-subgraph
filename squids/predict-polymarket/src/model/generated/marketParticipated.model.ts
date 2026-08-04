import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_} from "@subsquid/typeorm-store"

/**
 * Tracks markets where at least one agent has participated
 */
@Entity_()
export class MarketParticipated {
    constructor(props?: Partial<MarketParticipated>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string
}
