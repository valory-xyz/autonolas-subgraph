import {
  assert,
  describe,
  test,
  clearStore,
  beforeAll,
  afterAll,
  afterEach
} from "matchstick-as/assembly/index"
import { BigInt, Address, Bytes } from "@graphprotocol/graph-ts"
import { handleCreateService } from "../src/registryL2"
import { createCreateServiceEvent } from "./service-registry-l-2-utils"

// Tests structure (matchstick-as >=0.5.0)
// https://thegraph.com/docs/en/developer/matchstick/#tests-structure-0-5-0

describe("Describe entity assertions", () => {
  beforeAll(() => {
  })

  afterEach(() => {
    clearStore()
  })

  // For more test scenarios, see:
  // https://thegraph.com/docs/en/developer/matchstick/#write-a-unit-test

  test("CreateService created and stored id=234", () => {
    // arrange
    let _serviceId = BigInt.fromI32(234)
    let serviceId = _serviceId
    let configHash = Bytes.fromHexString("0x1234567890abcdef")

    // act
    let newCreateServiceEvent = createCreateServiceEvent(serviceId, configHash)
    handleCreateService(newCreateServiceEvent)

    // assert

    let id = newCreateServiceEvent.transaction.hash.concatI32(newCreateServiceEvent.logIndex.toI32())

    let serviceIdHex = serviceId.toString()

    assert.entityCount("CreateService", 1)
    assert.fieldEquals("CreateService", id.toHexString(), "serviceId", "234")
    assert.fieldEquals("CreateService", id.toHexString(), "configHash", "0x1234567890abcdef")
    assert.fieldEquals("CreateService", id.toHexString(), "blockNumber", "1")
    assert.fieldEquals("CreateService", id.toHexString(), "blockTimestamp", "1")
    assert.fieldEquals("CreateService", id.toHexString(), "transactionHash", "0xa16081f360e3847006db660bae1c6d1b2e17ec2a")

    assert.entityCount("Service", 1)
    assert.fieldEquals("Service", serviceIdHex, "configHash", "0x1234567890abcdef")
    assert.fieldEquals("Service", serviceIdHex, "serviceId", "234")
    assert.fieldEquals("Service", serviceIdHex, "historicalMultisigs", "[]")
    assert.fieldEquals("Service", serviceIdHex, "totalRequests", "0")
    assert.fieldEquals("Service", serviceIdHex, "totalDeliveries", "0")
    assert.fieldEquals("Service", serviceIdHex, "agentIds", "[]")
  })

  // todo: figure out how to to parametrization properly
  test("CreateService created and stored id=1", () => {
    // arrange
    let _serviceId = BigInt.fromI32(1)
    let serviceId = _serviceId
    let configHash = Bytes.fromHexString("0x1234567890abcdef")

    // act
    let newCreateServiceEvent = createCreateServiceEvent(serviceId, configHash)
    handleCreateService(newCreateServiceEvent)

    // assert

    let id = newCreateServiceEvent.transaction.hash.concatI32(newCreateServiceEvent.logIndex.toI32())

    let serviceIdHex = serviceId.toString()

    assert.entityCount("CreateService", 1)
    assert.fieldEquals("CreateService", id.toHexString(), "serviceId", "1")
    assert.fieldEquals("CreateService", id.toHexString(), "configHash", "0x1234567890abcdef")
    assert.fieldEquals("CreateService", id.toHexString(), "blockNumber", "1")
    assert.fieldEquals("CreateService", id.toHexString(), "blockTimestamp", "1")
    assert.fieldEquals("CreateService", id.toHexString(), "transactionHash", "0xa16081f360e3847006db660bae1c6d1b2e17ec2a")

    assert.entityCount("Service", 1)
    assert.fieldEquals("Service", serviceIdHex, "configHash", "0x1234567890abcdef")
    assert.fieldEquals("Service", serviceIdHex, "serviceId", "1")
    assert.fieldEquals("Service", serviceIdHex, "historicalMultisigs", "[]")
    assert.fieldEquals("Service", serviceIdHex, "totalRequests", "0")
    assert.fieldEquals("Service", serviceIdHex, "totalDeliveries", "0")
    assert.fieldEquals("Service", serviceIdHex, "agentIds", "[]")
  })
})
