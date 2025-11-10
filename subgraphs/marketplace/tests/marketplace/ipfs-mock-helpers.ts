import { Bytes, BigInt } from '@graphprotocol/graph-ts';
import { mockIpfsFile } from 'matchstick-as';

function toIpfsHash(payload: Bytes): string {
  return 'f01701220' + payload.toHexString().slice(2);
}

function requestIdToDecimal(requestId: Bytes): string {
  return BigInt.fromUnsignedBytes(requestId).toString();
}

export function mockMarketplaceRequestIpfs(payload: Bytes): void {
  const baseHash = toIpfsHash(payload);
  mockIpfsFile(baseHash + '/metadata.json', 'tests/ipfs_mocks/mech-request.json');
}

export function mockMarketplaceDeliverIpfs(
  payload: Bytes,
  requestId: Bytes
): void {
  const baseHash = toIpfsHash(payload);
  const route = baseHash + '/' + requestIdToDecimal(requestId);
  mockIpfsFile(route, 'tests/ipfs_mocks/mech-response.json');
}

export function mockMarketplaceIpfs(payload: Bytes, requestId: Bytes): void {
  mockMarketplaceRequestIpfs(payload);
  mockMarketplaceDeliverIpfs(payload, requestId);
}

