import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, StringColumn as StringColumn_} from "@subsquid/typeorm-store"

@Entity_()
export class NFTPositionMapping {
    constructor(props?: Partial<NFTPositionMapping>) {
        Object.assign(this, props)
    }

    /**
     * utf8hex('<protocol>-<tokenId>')
     */
    @PrimaryColumn_()
    id!: string

    @StringColumn_({nullable: false})
    positionId!: string

    @StringColumn_({nullable: false})
    protocol!: string
}
