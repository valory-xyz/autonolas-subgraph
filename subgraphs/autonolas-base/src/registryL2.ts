import { Address, BigInt, Bytes, JSONValue, ipfs, json, log } from "@graphprotocol/graph-ts"
import {
  CreateService as CreateServiceEvent,
  UpdateService as UpdateServiceEvent,
  Transfer as ServiceTransferEvent,
  ActivateRegistration as ActivateRegistrationEvent,
  RegisterInstance as RegisterInstanceEvent,
  DeployService as DeployServiceEvent,
  TerminateService as TerminateServiceEvent,
  OperatorUnbond as OperatorUnbondEvent,
  CreateMultisigWithAgents as CreateMultisigWithAgentsEvent,
  ServiceRegistryL2 as ServiceRegistry
} from "../generated/ServiceRegistryL2/ServiceRegistryL2"
import {
  Unit,
  Service,
  Multisig
} from "../generated/schema"
import { GnosisSafe } from "../generated/templates"

class Metadata {
  packageHash: string
  publicId: string
  pakageType: string
  image: string
  description: string
}

const Base16HashPrefix = "f01701220"

const MetadataNotFound: Metadata = {
  packageHash: "n/a",
  publicId: "n/a",
  pakageType: "unknown",
  image: "n/a",
  description: "n/a"
}

const ServiceTypePrefix = Bytes.fromHexString("sr")

function tryGetPackageType(packageHash: string, packageName: string): string {
  let baseURI = packageHash + "/" + packageName + "/";
  if (ipfs.cat(baseURI + "protocol.yaml")) {
    return "protocol"
  } else if (ipfs.cat(baseURI + "connection.yaml")) {
    return "connection"
  } else if (ipfs.cat(baseURI + "contract.yaml")) {
    return "contract"
  } else if (ipfs.cat(baseURI + "skill.yaml")) {
    return "skill"
  } else {
    return "unknown"
  }
}

function removePackageVersion(name: string): string {
  if (name.indexOf(":") > -1) {
    let name_parts = name.split(":")
    return name_parts.at(0)
  }
  return name
}

function getMetadata(unitHash: string): Metadata {
  let metadata_response = ipfs.cat(unitHash)
  if (metadata_response) {
    let publicId: string, packageHash: string, packageType: string
    let metadata = json.fromString(metadata_response.toString()).toObject()
    let code_uri = metadata.get("code_uri") as JSONValue
    let name = metadata.get("name") as JSONValue

    packageHash = code_uri.toString().replace("ipfs://", "")
    let name_parts = name.toString().split("/")
    if (name_parts.length == 4) {
      // PACKAGE_TYPE/AUTHOR/NAME/VERSION format
      publicId = name_parts.at(1) + "/" + removePackageVersion(name_parts.at(2))
      packageType = name_parts.at(0);
    } else if (name_parts.length == 3) {
      // PACKAGE_TYPE/AUTHOR/NAME:VERSION format
      publicId = name_parts.at(1) + "/" + removePackageVersion(name_parts.at(2))
      packageType = name_parts.at(0)
    } else if (name_parts.length == 2) {
      // AUTHOR/NAME:VERSION format
      let name = removePackageVersion(name_parts.at(1))
      publicId = name_parts.at(0) + "/" + name
      packageType = tryGetPackageType(packageHash, name);
    } else {
      log.warning("Invalid package name found {}", [name.toString()])
      publicId = name.toString();
      packageType = "unknown"
    }

    let image: string, imageValue = metadata.get("image")
    if (!imageValue) {
      image = "n/a"
    } else {
      image = imageValue.toString().replace("ipfs://", "")
    }

    let description: string, descriptionValue = metadata.get("description")
    if (!descriptionValue) {
      description = "n/a"
    } else {
      description = descriptionValue.toString()
    }

    return {
      "packageHash": packageHash,
      "publicId": publicId,
      "pakageType": packageType.toLowerCase(),
      "image": image,
      "description": description
    }
  }
  return MetadataNotFound
}

function storeUnit(entity: Unit, unitHash: string, tokenId: BigInt, owner: string, packageType: string | null = null): void {
  let metadata = getMetadata(unitHash)
  if (metadata) {
    entity.tokenId = tokenId
    entity.metadataHash = unitHash
    entity.packageHash = metadata.packageHash
    entity.publicId = metadata.publicId
    entity.description = metadata.description
    entity.image = metadata.image
    entity.owner = owner

    if (packageType) {
      entity.packageType = packageType
    } else {
      entity.packageType = metadata.pakageType
    }

    log.info(
      "Storing record\n\tTokenID: {}\n\tPublicID: {}\n\tPackageHash: {}\n\tpackageType: {}\n\tMetadataHash: {}\nDescription: {}\nImage: {}\nOwner: {}\n",
      [entity.tokenId.toString(), entity.publicId, entity.packageHash, entity.packageType, entity.metadataHash, entity.description, entity.image, entity.owner],
    )
    entity.save()
  } else {
    log.error("Could not retrieve metadata for {}", [unitHash])
    return
  }
}

function createOrUpdateUnit(
  id: Bytes,
  unitId: BigInt,
  owner: string,
  unitHash: string,
  blockNumber: BigInt,
  txHash: string,
  packageType: string | null = null
): void {
  let entity = Unit.load(id)
  if (!entity) {
    log.info(
      "Trying to create record for\n\tTokenID: {}\n\tMetadataHash: {}\n\tpackageType: {}\n\tBlockNumber: {}\n",
      [unitId.toString(), unitHash, packageType ? packageType : "component", blockNumber.toString()],
    )
    entity = new Unit(id)
  } else {
    log.info(
      "Trying to update record for\n\tTokenID: {}\n\tMetadataHash: {}\n\tpackageType: {}\n\tBlockNumber: {}\n",
      [unitId.toString(), unitHash, packageType ? packageType : "component", blockNumber.toString()],
    )
  }
  entity.block = blockNumber
  entity.txHash = txHash
  storeUnit(entity, unitHash, unitId, owner, packageType)
}

export function handleCreateService(event: CreateServiceEvent): void {
  let service_metadata_uri_parts = ServiceRegistry.bind(event.address).tokenURI(event.params.serviceId).split("/")
  let unitHash = service_metadata_uri_parts.at(-1);
  let owner = ServiceRegistry.bind(event.address).ownerOf(event.params.serviceId).toHexString()
  let id: Bytes = ServiceTypePrefix.concat(Bytes.fromByteArray(Bytes.fromBigInt(event.params.serviceId)))

  // Store record
  createOrUpdateUnit(
    id,
    event.params.serviceId,
    owner,
    unitHash,
    event.block.number,
    event.transaction.hash.toHexString(),
    "service",
  )
  handleServiceUpdate(event.params.serviceId, event.address)
}

export function handleUpdateService(event: UpdateServiceEvent): void {
  let service_metadata_uri_parts = ServiceRegistry.bind(event.address).tokenURI(event.params.serviceId).split("/")
  let unitHash = service_metadata_uri_parts.at(-1);
  let owner = ServiceRegistry.bind(event.address).ownerOf(event.params.serviceId).toHexString()
  let id: Bytes = ServiceTypePrefix.concat(Bytes.fromByteArray(Bytes.fromBigInt(event.params.serviceId)))

  // Update record
  createOrUpdateUnit(
    id,
    event.params.serviceId,
    owner,
    unitHash,
    event.block.number,
    event.transaction.hash.toHexString(),
    "service",
  )
  handleServiceUpdate(event.params.serviceId, event.address)
}

export function handleServiceTransfer(event: ServiceTransferEvent): void {
  let unit = Unit.load(ServiceTypePrefix.concat(Bytes.fromByteArray(Bytes.fromBigInt(event.params.id))))
  if (unit) {
    log.info(
      "Updating owner for service {} from {} to {}",
      [event.params.id.toString(), event.params.from.toHexString(), event.params.to.toHexString()]
    )
    unit.owner = event.params.to.toHexString()
    unit.save()
  }

  let service = Service.load(Bytes.fromByteArray(Bytes.fromBigInt(event.params.id)))
  if (service) {
    log.info(
      "Updating owner for service {} from {} to {}",
      [event.params.id.toString(), event.params.from.toHexString(), event.params.to.toHexString()]
    )
    service.owner = event.params.to.toHexString()
    service.save()
  }
}

function updateServiceState(entity: Service, serviceId: BigInt, serviceRegistryAddress: Address): void {
  let serviceInfo = ServiceRegistry.bind(serviceRegistryAddress).getService(serviceId)
  entity.serviceId = serviceId
  entity.state = BigInt.fromI32((serviceInfo.state))
  entity.agentIds = serviceInfo.agentIds
  entity.metadataHash = Base16HashPrefix + serviceInfo.configHash.toHexString().slice(2)
  entity.threshold = serviceInfo.threshold
  entity.securityDeposit = serviceInfo.securityDeposit
  entity.numberOfInstances = serviceInfo.numAgentInstances
  entity.maxNumberOfInstances = serviceInfo.maxNumAgentInstances
  entity.multisig = serviceInfo.multisig.toHexString()
  entity.instances = (
    ServiceRegistry
      .bind(serviceRegistryAddress)
      .getAgentInstances(serviceId)
      .getAgentInstances()
      .map<string>(function (addr: Address): string {
        return addr.toHexString()
      })
  )

  let ownerValue = ServiceRegistry.bind(serviceRegistryAddress).try_ownerOf(serviceId)
  if (ownerValue.reverted) {
    entity.owner = "n/a"
  } else {
    entity.owner = ownerValue.value.toHexString()
  }

  let metadata = getMetadata(ServiceRegistry.bind(serviceRegistryAddress).tokenURI(serviceId).split("/").at(-1))
  if (metadata) {
    entity.publicId = metadata.publicId
    entity.packageHash = metadata.packageHash
    entity.description = metadata.description
  } else {
    entity.publicId = "n/a"
    entity.packageHash = "n/a"
    entity.description = "n/a"
  }

  log.info("Storing service \nServiceId: {}\nState: {}\nAgentIds: {}\nConfigHash: {}\nThreshold: {}\nSecurityDeposit: {}\nNumberOfInstances: {}\nMaxNumberOfInstances: {}\nMultisig: {}", [
    serviceId.toString(),
    serviceInfo.state.toString(),
    serviceInfo.agentIds.toString(),
    serviceInfo.configHash.toHexString(),
    serviceInfo.threshold.toString(),
    serviceInfo.securityDeposit.toString(),
    serviceInfo.numAgentInstances.toString(),
    serviceInfo.maxNumAgentInstances.toString(),
    serviceInfo.multisig.toHexString(),
  ])
}

function handleServiceUpdate(serviceId: BigInt, serviceRegistryAddress: Address): void {
  let id: Bytes = Bytes.fromByteArray(Bytes.fromBigInt(serviceId))
  let entity = Service.load(id)
  if (entity === null) {
    entity = new Service(id)
  }
  updateServiceState(entity, serviceId, serviceRegistryAddress)
  entity.save()
}

export function handleActivateRegistration(event: ActivateRegistrationEvent): void {
  handleServiceUpdate(event.params.serviceId, event.address)
}

export function handleDeployService(event: DeployServiceEvent): void {
  handleServiceUpdate(event.params.serviceId, event.address)
}

export function handleRegisterInstance(event: RegisterInstanceEvent): void {
  handleServiceUpdate(event.params.serviceId, event.address)
}

export function handleTerminateService(event: TerminateServiceEvent): void {
  handleServiceUpdate(event.params.serviceId, event.address)
}

export function handleOperatorUnbond(event: OperatorUnbondEvent): void {
  handleServiceUpdate(event.params.serviceId, event.address)
}

export function handleCreateMultisigWithAgents(event: CreateMultisigWithAgentsEvent): void {
  let serviceId = event.params.serviceId
  let multisigAddress = event.params.multisig

  handleServiceUpdate(serviceId, event.address)

  // Check if multisig already exists to avoid duplicate key error
  let existingMultisig = Multisig.load(multisigAddress)
  if (existingMultisig) {
    return
  }

  let serviceEntityId = Bytes.fromByteArray(Bytes.fromBigInt(serviceId))
  let serviceEntity = Service.load(serviceEntityId)
  if (!serviceEntity) {
    return
  }

  let agentIds = serviceEntity.agentIds
  if (!agentIds) {
    return
  }

  let targetAgentId = BigInt.fromI32(41)
  if (!agentIds.includes(targetAgentId)) {
    return
  }

  // Create multisig only for services with agent 41
  let multisigEntity = new Multisig(multisigAddress)
  multisigEntity.service = serviceEntityId
  multisigEntity.save()

  GnosisSafe.create(multisigAddress)
}
