import {
  assert,
  describe,
  test,
  clearStore,
  beforeAll,
  afterAll
} from "matchstick-as/assembly/index"
import { Address, BigInt } from "@graphprotocol/graph-ts"
import { CreateMech } from "../generated/schema"
import { CreateMech as CreateMechEvent } from "../generated/AgentFactory/AgentFactory"
import { handleCreateMech } from "../src/agent-factory"
import { createCreateMechEvent } from "./agent-factory-utils"

// Tests structure (matchstick-as >=0.5.0)
// https://thegraph.com/docs/en/developer/matchstick/#tests-structure-0-5-0

describe("Describe entity assertions", () => {
  afterAll(() => {
    clearStore()
  })

  // For more test scenarios, see:
  // https://thegraph.com/docs/en/developer/matchstick/#write-a-unit-test

  test("CreateMech created and stored", () => {
    // arrange
    let mech = Address.fromString("0x0000000000000000000000000000000000000001")
    let agentId = BigInt.fromI32(234)
    let price = BigInt.fromI32(234)
    let newCreateMechEvent = createCreateMechEvent(mech, agentId, price)

    assert.entityCount("CreateMech", 0)
    assert.entityCount("MechAgent", 0)

    // act
    handleCreateMech(newCreateMechEvent)

    // assert
    assert.entityCount("CreateMech", 1)
    assert.entityCount("MechAgent", 1)

    // 0xa16081f360e3847006db660bae1c6d1b2e17ec2a is the default address used in newMockEvent() function
    assert.fieldEquals(
      "CreateMech",
      mech.toHexString(),
      "mech",
      mech.toHexString()
    )
    assert.fieldEquals(
      "CreateMech",
      mech.toHexString(),
      "agentId",
      "234"
    )
    assert.fieldEquals(
      "CreateMech",
      mech.toHexString(),
      "price",
      "234"
    )

    assert.fieldEquals(
      "MechAgent",
      agentId.toHexString(),
      "mech",
      mech.toHexString()
    )
    assert.fieldEquals(
      "MechAgent",
      agentId.toHexString(),
      "address",
      mech.toHexString()
    )

    assert.fieldEquals(
      "MechAgent",
      agentId.toHexString(),
      "totalTransactions",
      "0"
    )

    // More assert options:
    // https://thegraph.com/docs/en/developer/matchstick/#asserts
  })

  test("CreateMech created and stored with existing service", () => {
    // todo: do a proper test with existing service
  })
})
