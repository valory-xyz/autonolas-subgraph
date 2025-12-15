import { Bytes, BigInt } from '@graphprotocol/graph-ts';
import { mockIpfsFile } from 'matchstick-as';

function toIpfsHash(payload: Bytes): string {
  return 'f01701220' + payload.toHexString().slice(2);
}

function requestIdToDecimal(requestId: Bytes): string {
  // Convert bytes32 requestId to decimal string for IPFS path
  // bytes32 in Ethereum is big-endian, need to reverse for BigInt
  // Create a copy to avoid mutating the original
  let bytes = new Uint8Array(requestId.length);
  for (let i = 0; i < requestId.length; i++) {
    bytes[i] = requestId[i];
  }
  let reversedBytes = Bytes.fromUint8Array(bytes.reverse());
  return BigInt.fromUnsignedBytes(reversedBytes).toString();
}

export function mockMarketplaceRequestIpfs(payload: Bytes, requestId: Bytes): void {
  const baseHash = toIpfsHash(payload);
  const requestIdDecimal = requestIdToDecimal(requestId);
  // Mock the path with requestId in decimal format (as expected by runtime)
  mockIpfsFile(baseHash + '/' + requestIdDecimal + '/metadata.json', 'tests/ipfs_mocks/mech-request.json');
  // Mock both the metadata.json path and the base path as fallback
  mockIpfsFile(baseHash + '/metadata.json', 'tests/ipfs_mocks/mech-request.json');
  mockIpfsFile(baseHash, 'tests/ipfs_mocks/mech-request.json');
}

export function mockMarketplaceDeliverIpfs(
  payload: Bytes,
  requestId: Bytes
): void {
  const baseHash = toIpfsHash(payload);
  const requestIdDecimal = requestIdToDecimal(requestId);
  const route = baseHash + '/' + requestIdDecimal;
  // Mock the path with metadata.json (as expected by resolveIpfsRoute)
  mockIpfsFile(route + '/metadata.json', 'tests/ipfs_mocks/mech-response.json');
  // Mock the base route as fallback
  mockIpfsFile(route, 'tests/ipfs_mocks/mech-response.json');
}

export function mockMarketplaceIpfs(payload: Bytes, requestId: Bytes): void {
  mockMarketplaceRequestIpfs(payload, requestId);
  mockMarketplaceDeliverIpfs(payload, requestId);
}

