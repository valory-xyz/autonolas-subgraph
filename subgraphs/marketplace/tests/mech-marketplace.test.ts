import {
  assert,
  describe,
  test,
  clearStore,
  afterEach,
  createMockedFunction,
} from "matchstick-as/assembly/index"

import { Address, BigInt, Bytes, ethereum } from "@graphprotocol/graph-ts"

import { handleCreateMech as marketplaceHandleCreateMech } from "../src/marketplace/mech-marketplace"
import { createCreateMechEvent } from "./mech-marketplace-utils"
import { handleCreateService as registryL2HandleCreateService } from "../src/registryL2"
import { createCreateServiceEvent } from "./service-registry-l-2-utils"

function mockMaxDeliveryRate(mech: Address, maxDeliveryRate: BigInt): void {
  createMockedFunction(mech, "maxDeliveryRate", "maxDeliveryRate():(uint256)")
    .returns([ethereum.Value.fromUnsignedBigInt(maxDeliveryRate)])
}

describe("Describe mech-marketplace processing", () => {
    afterEach(() => {
        clearStore()
    })

    test("Handle create mech existing service", () => {
        // arrange
        let configHash = Bytes.fromHexString("0x1234567890abcdef")
        let serviceId = BigInt.fromI32(234)
        let newCreateServiceEvent = createCreateServiceEvent(serviceId, configHash);
        registryL2HandleCreateService(newCreateServiceEvent);

        assert.entityCount("Service", 1)
        assert.fieldEquals("Service", serviceId.toString(), "serviceId", "234")

        let mech = Address.fromString("0x0000000000000000000000000000000000000001")
        let mechFactory = Address.fromString("0x0000000000000000000000000000000000000001")
        let paymentType = Bytes.fromHexString("0xba699a34be8fe0e7725e93dcbce1701b0211a8ca61330aaeb8a05bf2ec7abed1")
        let maxDeliveryRate = BigInt.fromI32(600)

        // Mock the paymentType() function call
        createMockedFunction(mech, "paymentType", "paymentType():(bytes32)")
          .returns([ethereum.Value.fromBytes(paymentType)])
        mockMaxDeliveryRate(mech, maxDeliveryRate)

        // act
        let event = createCreateMechEvent(mech, serviceId, mechFactory)
        marketplaceHandleCreateMech(event)

        // assert
        assert.entityCount("Mech", 1)
        assert.fieldEquals(
            "Mech",
            serviceId.toString(),
            "address",
            mech.toHexString()
        )

        assert.fieldEquals(
            "Mech",
            serviceId.toString(),
            "mechFactory",
            mechFactory.toHexString()
        )

        assert.fieldEquals(
            "Mech",
            serviceId.toString(),
            "owner",
            event.transaction.from.toHexString()
        )

        assert.fieldEquals(
            "Mech",
            serviceId.toString(),
            "service",
            serviceId.toString()
        )

        assert.fieldEquals(
            "Mech",
            serviceId.toString(),
            "totalDeliveriesTransactions",
            "0"
        )

        assert.fieldEquals(
            "Mech",
            serviceId.toString(),
            "paymentType",
            paymentType.toHexString()
        )

        assert.fieldEquals(
            "Mech",
            serviceId.toString(),
            "maxDeliveryRate",
            maxDeliveryRate.toString()
        )

        assert.fieldEquals(
            "Service",
            serviceId.toString(),
            "configHash",
            configHash.toHexString()
        )

    })
})