import { Address, Bytes } from "@graphprotocol/graph-ts"

// Common test addresses
export const TEST_MECH = Address.fromString("0x0000000000000000000000000000000000000001")
export const TEST_MECH_SERVICE_MULTISIG = Address.fromString("0x0000000000000000000000000000000000000002")
export const TEST_REQUESTER = Address.fromString("0x0000000000000000000000000000000000000003")
export const TEST_OWNER = Address.fromString("0x0000000000000000000000000000000000000004")

// Common test request IDs (20 bytes = 40 hex chars, matching test usage)
export const TEST_REQUEST_ID_1 = Bytes.fromHexString("0x1111111111111111111111111111111111111111")
export const TEST_REQUEST_ID_2 = Bytes.fromHexString("0x2222222222222222222222222222222222222222")
export const TEST_REQUEST_ID_3 = Bytes.fromHexString("0x3333333333333333333333333333333333333333")
export const TEST_REQUEST_ID_4 = Bytes.fromHexString("0x4444444444444444444444444444444444444444")
export const TEST_REQUEST_ID_6 = Bytes.fromHexString("0x6666666666666666666666666666666666666666")
export const TEST_REQUEST_ID_7 = Bytes.fromHexString("0x7777777777777777777777777777777777777777")
export const TEST_REQUEST_ID_8 = Bytes.fromHexString("0x8888888888888888888888888888888888888888")
export const TEST_REQUEST_ID_9 = Bytes.fromHexString("0x9999999999999999999999999999999999999999")
export const TEST_REQUEST_ID_A = Bytes.fromHexString("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")
export const TEST_REQUEST_ID_B = Bytes.fromHexString("0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb")
export const TEST_REQUEST_ID_C = Bytes.fromHexString("0xcccccccccccccccccccccccccccccccccccccccc")
export const TEST_REQUEST_ID_D = Bytes.fromHexString("0xdddddddddddddddddddddddddddddddddddddddd")

// Common test data (must be 32-byte payloads to emulate real IPFS digests)
export const TEST_DATA = Bytes.fromHexString("0x0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f")
export const TEST_DATA_NATIVE = Bytes.fromHexString("0x1111111111111111111111111111111111111111111111111111111111111111")
export const TEST_DATA_TOKEN = Bytes.fromHexString("0x2222222222222222222222222222222222222222222222222222222222222222")
export const TEST_DATA_NVM = Bytes.fromHexString("0x3333333333333333333333333333333333333333333333333333333333333333")
export const TEST_DATA_USDC = Bytes.fromHexString("0x4444444444444444444444444444444444444444444444444444444444444444")

// Common test values
export const TEST_DELIVERY_RATE_NATIVE = 100
export const TEST_DELIVERY_RATE_TOKEN = 100
export const TEST_DELIVERY_RATE_NVM = 200
export const TEST_DELIVERY_RATE_USDC = 300

