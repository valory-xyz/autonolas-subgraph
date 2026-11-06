import assert from "assert"
import * as marshal from "./marshal"

export class BufferedAgentInstance {
    private _signer!: string
    private _block!: bigint
    private _logIndex!: number

    constructor(props?: Partial<Omit<BufferedAgentInstance, 'toJSON'>>, json?: any) {
        Object.assign(this, props)
        if (json != null) {
            this._signer = marshal.string.fromJSON(json.signer)
            this._block = marshal.bigint.fromJSON(json.block)
            this._logIndex = marshal.int.fromJSON(json.logIndex)
        }
    }

    get signer(): string {
        assert(this._signer != null, 'uninitialized access')
        return this._signer
    }

    set signer(value: string) {
        this._signer = value
    }

    get block(): bigint {
        assert(this._block != null, 'uninitialized access')
        return this._block
    }

    set block(value: bigint) {
        this._block = value
    }

    get logIndex(): number {
        assert(this._logIndex != null, 'uninitialized access')
        return this._logIndex
    }

    set logIndex(value: number) {
        this._logIndex = value
    }

    toJSON(): object {
        return {
            signer: this.signer,
            block: marshal.bigint.toJSON(this.block),
            logIndex: this.logIndex,
        }
    }
}
