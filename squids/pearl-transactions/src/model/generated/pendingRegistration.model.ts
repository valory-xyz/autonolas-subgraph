import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, IntColumn as IntColumn_, StringColumn as StringColumn_} from "@subsquid/typeorm-store"
import * as marshal from "./marshal"
import {BufferedAgentInstance} from "./_bufferedAgentInstance"

@Entity_()
export class PendingRegistration {
    constructor(props?: Partial<PendingRegistration>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @IntColumn_({array: true, nullable: false})
    agentIds!: (number)[]

    @StringColumn_({array: true, nullable: false})
    operators!: (string)[]

    @Column_("jsonb", {transformer: {to: obj => obj.map((val: any) => val.toJSON()), from: obj => obj == null ? undefined : marshal.fromList(obj, val => new BufferedAgentInstance(undefined, marshal.nonNull(val)))}, nullable: false})
    agentInstances!: (BufferedAgentInstance)[]
}
