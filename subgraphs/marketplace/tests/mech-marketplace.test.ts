import {
  assert,
  describe,
  test,
  clearStore,
  afterEach
} from "matchstick-as/assembly/index"

import { Address, BigInt, Bytes } from "@graphprotocol/graph-ts"

import { handleCreateMech as marketplaceHandleCreateMech } from "../src/marketplace/mech-marketplace"
import { createCreateMechEvent } from "./mech-marketplace-utils"
import { handleCreateService as registryL2HandleCreateService } from "../src/registryL2"
import { createCreateServiceEvent } from "./service-registry-l-2-utils"

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
        assert.fieldEquals("Service", Bytes.fromHexString(serviceId.toHexString()).toHexString(), "serviceId", "234")

        let mech = Address.fromString("0x0000000000000000000000000000000000000001")
        let mechFactory = Address.fromString("0x0000000000000000000000000000000000000001")

        // act
        let event = createCreateMechEvent(mech, serviceId, mechFactory)
        marketplaceHandleCreateMech(event)

        // assert
        assert.entityCount("Mech", 1)
        assert.fieldEquals(
            "Mech",
            serviceId.toHexString(),
            "address",
            mech.toHexString()
        )

        assert.fieldEquals(
            "Mech",
            serviceId.toHexString(),
            "mechFactory",
            mechFactory.toHexString()
        )

        assert.fieldEquals(
            "Mech",
            serviceId.toHexString(),
            "owner",
            event.transaction.from.toHexString()
        )

        assert.fieldEquals(
            "Mech",
            serviceId.toHexString(),
            "service",
            serviceId.toHexString()
        )

        assert.fieldEquals(
            "Mech",
            serviceId.toHexString(),
            "totalDeliveriesTransactions",
            "0"
        )

        assert.fieldEquals(
            "Service",
            serviceId.toHexString(),
            "configHash",
            configHash.toHexString()
        )

    })
})