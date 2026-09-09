import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, OneToMany as OneToMany_, Relation as Relation_} from "@subsquid/typeorm-store"
import {Service} from "./service.model"

@Entity_()
export class Creator {
    constructor(props?: Partial<Creator>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @OneToMany_(() => Service, e => e.creator)
    services!: Relation_<Service[]>
}
