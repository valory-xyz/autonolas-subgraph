import { address, bool } from '@subsquid/evm-codec'
import { event, indexed } from '../abi.support.js'
import type { EventParams as EParams } from '../abi.support.js'

/** GaugeCreated(address,address,address,address,address,address,bool) */
export const GaugeCreated = event('0x5f80f043755ffb5732901cef69b9d5b7b1f7ec964176939d229d5f28daee9944', {
    _target: indexed(address),
    _gauge: indexed(address),
    _module: indexed(address),
    _gaugeFactory: address,
    _votingRewardsManager: address,
    _creator: address,
    _activated: bool,
})
export type GaugeCreatedEventArgs = EParams<typeof GaugeCreated>
