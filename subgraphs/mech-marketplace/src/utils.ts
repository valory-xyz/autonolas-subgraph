import {
  Address,
  BigInt,
  Bytes,
  dataSource,
  log,
} from '@graphprotocol/graph-ts';
import {
  Global,
  Sender,
  Metadata,
  Deliver,
  Request,
  CreateMultisigWithAgents,
  CreateMech,
} from '../generated/schema';
import {
  MechFixedPriceNative,
  MechFixedPriceToken,
  MechNvmSubscriptionNative,
  MechNvmSubscriptionTokenUSDC,
} from '../generated/templates';
import {
  BASE_MECH_FACTORY_FIXED_PRICE_NATIVE,
  BASE_MECH_FACTORY_FIXED_PRICE_TOKEN,
  BASE_MECH_FACTORY_NVM_SUBSCRIPTION_TOKEN_USDC,
  GNOSIS_MECH_FACTORY_FIXED_PRICE_NATIVE,
  GNOSIS_MECH_FACTORY_FIXED_PRICE_TOKEN,
  GNOSIS_MECH_FACTORY_NVM_SUBSCRIPTION_NATIVE,
} from './constants';

export function getGlobal(): Global {
  let global = Global.load('');
  if (global == null) {
    global = new Global('');
    global.totalMechs = BigInt.fromI32(0);
    global.totalMarketplaceRequests = BigInt.fromI32(0);
    global.totalMarketplaceDeliveries = BigInt.fromI32(0);
    global.totalMarketplaceDeliveriesWithSignatures = BigInt.fromI32(0);
    global.totalRequests = BigInt.fromI32(0);
    global.totalDeliveries = BigInt.fromI32(0);
    global.totalTransactions = BigInt.fromI32(0);
  }
  return global;
}

export function getOrCreateSender(address: Bytes): Sender {
  let sender = Sender.load(address);
  if (sender == null) {
    sender = new Sender(address);
    sender.id = address;
    sender.totalTransactions = BigInt.fromI32(0);
    sender.totalMarketplaceRequests = BigInt.fromI32(0);
    sender.totalRequests = BigInt.fromI32(0);
    sender.totalOffChainRequests = BigInt.fromI32(0);
  }
  return sender;
}

export function getOrCreateMetadata(serviceId: BigInt): Metadata {
  let entity = Metadata.load(serviceId.toHexString());
  if (entity === null) {
    entity = new Metadata(serviceId.toHexString());
    entity.serviceId = serviceId;
    entity.service = serviceId.toHexString();
  }
  return entity;
}

export function getOrCreateDeliver(requestId: Bytes): Deliver {
  let deliver = Deliver.load(requestId.toHexString());
  if (deliver == null) {
    deliver = new Deliver(requestId.toHexString());
    deliver.requestId = requestId;
  }
  return deliver;
}

export function getOrCreateRequest(requestId: Bytes): Request {
  let request = Request.load(requestId.toHexString());
  if (request == null) {
    request = new Request(requestId.toHexString());
  }
  return request;
}

export function getServiceIdFromMultisig(
  multisigAddress: Bytes
): string | null {
  let multisigEntity = CreateMultisigWithAgents.load(
    multisigAddress.toHexString()
  );
  if (multisigEntity !== null) {
    return multisigEntity.serviceId.toHexString();
  }
  return null;
}

export function getServiceIdFromMech(mechAddress: Bytes): string | null {
  let createMechEntity = CreateMech.load(mechAddress.toHexString());
  if (createMechEntity !== null) {
    return createMechEntity.serviceId.toHexString();
  }
  return null;
}

export function getChainId(network: string): i32 {
  const cleanNetwork = network.trim().toLowerCase();

  if (cleanNetwork == 'gnosis' || cleanNetwork == 'xdai') {
    return 100;
  } else if (cleanNetwork == 'base') {
    return 8453;
  }

  log.warning("Unknown network: '{}' (cleaned: '{}'), returning 0", [
    network,
    cleanNetwork,
  ]);
  return 0; // Unknown network
}

/* Create dynamic data source for the new Mech contract based on factory address */
export function createDataSourceForMechContract(
  mech: Address,
  mechFactory: Address
): void {
  const network = dataSource.network();
  const chainId = getChainId(network);
  const mechFactoryAddress = mechFactory.toHexString().toLowerCase();

  log.info(
    'Creating data source for mech: {}, factory: {}, network: {}, chainId: {}',
    [mech.toHexString(), mechFactoryAddress, network, chainId.toString()]
  );

  // Check factory addresses based on chain ID
  if (chainId == 100) {
    if (
      GNOSIS_MECH_FACTORY_FIXED_PRICE_NATIVE.toLowerCase() == mechFactoryAddress
    ) {
      MechFixedPriceNative.create(mech);
      log.info('Created MechFixedPriceNative data source for mech: {}', [
        mech.toHexString(),
      ]);
    } else if (
      GNOSIS_MECH_FACTORY_FIXED_PRICE_TOKEN.toLowerCase() == mechFactoryAddress
    ) {
      MechFixedPriceToken.create(mech);
      log.info('Created MechFixedPriceToken data source for mech: {}', [
        mech.toHexString(),
      ]);
    } else if (
      GNOSIS_MECH_FACTORY_NVM_SUBSCRIPTION_NATIVE.toLowerCase() ==
      mechFactoryAddress
    ) {
      MechNvmSubscriptionNative.create(mech);
      log.info('Created MechNvmSubscriptionNative data source for mech: {}', [
        mech.toHexString(),
      ]);
    } else {
      log.warning('Unknown mech factory address on Gnosis: {}', [
        mechFactoryAddress,
      ]);
    }
  } else if (chainId == 8453) {
    if (
      BASE_MECH_FACTORY_FIXED_PRICE_NATIVE.toLowerCase() == mechFactoryAddress
    ) {
      MechFixedPriceNative.create(mech);
      log.info('Created MechFixedPriceNative data source for mech: {}', [
        mech.toHexString(),
      ]);
    } else if (
      BASE_MECH_FACTORY_FIXED_PRICE_TOKEN.toLowerCase() == mechFactoryAddress
    ) {
      MechFixedPriceToken.create(mech);
      log.info('Created MechFixedPriceToken data source for mech: {}', [
        mech.toHexString(),
      ]);
    } else if (
      BASE_MECH_FACTORY_NVM_SUBSCRIPTION_TOKEN_USDC.toLowerCase() ==
      mechFactoryAddress
    ) {
      MechNvmSubscriptionTokenUSDC.create(mech);
      log.info(
        'Created MechNvmSubscriptionTokenUSDC data source for mech: {}',
        [mech.toHexString()]
      );
    } else {
      log.warning('Unknown mech factory address on Base: {}', [
        mechFactoryAddress,
      ]);
    }
  } else {
    log.warning("Unsupported chain ID: {} for network: '{}'", [
      chainId.toString(),
      network,
    ]);
  }
}
