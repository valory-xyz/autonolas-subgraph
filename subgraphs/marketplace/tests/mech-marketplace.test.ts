import {
  assert,
  describe,
  test,
  clearStore,
  afterEach,
  dataSourceMock,
} from "matchstick-as/assembly/index"

import { Address, BigInt, Bytes } from "@graphprotocol/graph-ts"

import { handleCreateMech as marketplaceHandleCreateMech } from "../src/marketplace/mech-marketplace"
import { handleMechFactoryCreate } from "../src/marketplace/mech-factory"
import { createCreateMechEvent } from "./mech-marketplace-utils"
import { createMechFactoryCreateEvent } from "./mech-factory-utils"
import { handleCreateService as registryL2HandleCreateService } from "../src/registryL2"
import { createCreateServiceEvent } from "./service-registry-l-2-utils"
import { PendingMechData } from "../generated/schema"
import {
  GNOSIS_MECH_FACTORY_FIXED_PRICE_NATIVE,
  PAYMENT_TYPE_FIXED_PRICE_NATIVE,
} from "../src/marketplace/constants"

// Helper to create PendingMechData entity (simulates MechFactory handler output)
function createPendingMechData(mech: Address, maxDeliveryRate: BigInt, blockNumber: BigInt): void {
  let pendingData = new PendingMechData(mech.toHexString())
  pendingData.maxDeliveryRate = maxDeliveryRate
  pendingData.createdAtBlock = blockNumber
  pendingData.save()
}

describe("Describe mech-marketplace processing", () => {
    afterEach(() => {
        clearStore()
        dataSourceMock.resetValues()
    })

    test("Handle create mech existing service", () => {
        // Set network for factory address lookup
        dataSourceMock.setNetwork("gnosis")

        // arrange
        let configHash = Bytes.fromHexString("0x1234567890abcdef")
        let serviceId = BigInt.fromI32(234)
        let newCreateServiceEvent = createCreateServiceEvent(serviceId, configHash);
        registryL2HandleCreateService(newCreateServiceEvent);

        assert.entityCount("Service", 1)
        assert.fieldEquals("Service", serviceId.toString(), "serviceId", "234")

        let mech = Address.fromString("0x0000000000000000000000000000000000000001")
        let mechFactory = Address.fromString(GNOSIS_MECH_FACTORY_FIXED_PRICE_NATIVE)
        let maxDeliveryRate = BigInt.fromI32(600)

        // Create PendingMechData (simulates MechFactory handler firing before MechMarketplace)
        createPendingMechData(mech, maxDeliveryRate, BigInt.fromI32(1000))

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

        // paymentType is derived from factory address, not RPC call
        assert.fieldEquals(
            "Mech",
            serviceId.toString(),
            "paymentType",
            PAYMENT_TYPE_FIXED_PRICE_NATIVE.toHexString()
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

        // PendingMechData should be deleted after consumption
        assert.notInStore("PendingMechData", mech.toHexString())
    })

    test("MechFactory handler creates PendingMechData entity", () => {
        let mech = Address.fromString("0x0000000000000000000000000000000000000002")
        let serviceId = BigInt.fromI32(100)
        let maxDeliveryRate = BigInt.fromI32(1000)

        let event = createMechFactoryCreateEvent(mech, serviceId, maxDeliveryRate)
        handleMechFactoryCreate(event)

        // Verify PendingMechData was created
        assert.entityCount("PendingMechData", 1)
        assert.fieldEquals("PendingMechData", mech.toHexString(), "maxDeliveryRate", maxDeliveryRate.toString())
    })

    test("Full flow: MechFactory -> MechMarketplace handlers", () => {
        // Set network for factory address lookup
        dataSourceMock.setNetwork("gnosis")

        let mech = Address.fromString("0x0000000000000000000000000000000000000003")
        let serviceId = BigInt.fromI32(300)
        let maxDeliveryRate = BigInt.fromI32(2000)
        let mechFactory = Address.fromString(GNOSIS_MECH_FACTORY_FIXED_PRICE_NATIVE)

        // Step 1: MechFactory fires CreateMech (log index N)
        let factoryEvent = createMechFactoryCreateEvent(mech, serviceId, maxDeliveryRate)
        handleMechFactoryCreate(factoryEvent)

        assert.entityCount("PendingMechData", 1)

        // Step 2: MechMarketplace fires CreateMech (log index N+1)
        let marketplaceEvent = createCreateMechEvent(mech, serviceId, mechFactory)
        marketplaceHandleCreateMech(marketplaceEvent)

        // Verify Mech was created with correct values
        assert.entityCount("Mech", 1)
        assert.fieldEquals("Mech", serviceId.toString(), "maxDeliveryRate", maxDeliveryRate.toString())
        assert.fieldEquals("Mech", serviceId.toString(), "paymentType", PAYMENT_TYPE_FIXED_PRICE_NATIVE.toHexString())

        // Verify PendingMechData was deleted after consumption
        assert.notInStore("PendingMechData", mech.toHexString())
    })
})
