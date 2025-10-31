import {
  assert,
  describe,
  test,
  clearStore,
  beforeAll,
  afterAll
} from "matchstick-as/assembly/index"
import { BigInt, Address, Bytes } from "@graphprotocol/graph-ts"
import { ActivateRegistration } from "../generated/schema"
import { ActivateRegistration as ActivateRegistrationEvent } from "../generated/ServiceRegistryL2/ServiceRegistryL2"
import { handleActivateRegistration } from "../src/service-registry-l-2"
import { createActivateRegistrationEvent, createCreateServiceEvent } from "./service-registry-l-2-utils"
import { handleCreateService } from "../src/marketplace/service-registry-l-2"

// Tests structure (matchstick-as >=0.5.0)
// https://thegraph.com/docs/en/developer/matchstick/#tests-structure-0-5-0

describe("Describe entity assertions", () => {
  beforeAll(() => {
  })

  afterAll(() => {
    clearStore()
  })

  // For more test scenarios, see:
  // https://thegraph.com/docs/en/developer/matchstick/#write-a-unit-test

  test("ActivateRegistration created and stored", () => {

    // arrange
    let serviceId = BigInt.fromI32(234)
    let configHash = Bytes.fromHexString("0x1234567890abcdef")

    // act
    let newCreateServiceEvent = createCreateServiceEvent(serviceId, configHash)
    handleCreateService(newCreateServiceEvent)

    // assert

    let id = newCreateServiceEvent.transaction.hash.concatI32(newCreateServiceEvent.logIndex.toI32())

    assert.entityCount("CreateService", 1)
    assert.fieldEquals("CreateService", id.toHexString(), "serviceId", "234")
    assert.fieldEquals("CreateService", id.toHexString(), "configHash", "0x1234567890abcdef")
    assert.fieldEquals("CreateService", id.toHexString(), "blockNumber", "1")
    assert.fieldEquals("CreateService", id.toHexString(), "blockTimestamp", "1")
    assert.fieldEquals("CreateService", id.toHexString(), "transactionHash", "0xa16081f360e3847006db660bae1c6d1b2e17ec2a")

    assert.entityCount("Service", 1)
    assert.fieldEquals("Service", Bytes.fromHexString(serviceId.toHexString()).toHexString(), "configHash", "0x1234567890abcdef")
    assert.fieldEquals("Service", Bytes.fromHexString(serviceId.toHexString()).toHexString(), "serviceId", "234")
    assert.fieldEquals("Service", Bytes.fromHexString(serviceId.toHexString()).toHexString(), "historicalMultisigs", "[]")
    assert.fieldEquals("Service", Bytes.fromHexString(serviceId.toHexString()).toHexString(), "totalRequests", "0")
    assert.fieldEquals("Service", Bytes.fromHexString(serviceId.toHexString()).toHexString(), "totalDeliveries", "0")
    assert.fieldEquals("Service", Bytes.fromHexString(serviceId.toHexString()).toHexString(), "agentIds", "[]")
  })
})
