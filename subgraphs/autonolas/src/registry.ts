import { Address, BigInt, ByteArray, Bytes, JSONValue, ipfs, json, log } from "@graphprotocol/graph-ts"
import {
  CreateUnit as CreateComponentEvent,
  UpdateUnitHash as UpdateComponentEvent,
  Transfer as ComponentTransferEvent,
  ComponentRegistry
} from "../generated/ComponentRegistry/ComponentRegistry"
import {
  CreateUnit as CreateAgentEvent,
  UpdateUnitHash as UpdateAgentEvent,
  Transfer as AgentTransferEvent,
  AgentRegistry
} from "../generated/AgentRegistry/AgentRegistry"
import {
  CreateService as CreateServiceEvent,
  UpdateService as UpdateServiceEvent,
  Transfer as ServiceTransferEvent,
  ActivateRegistration as ActivateRegistrationEvent,
  RegisterInstance as RegisterInstanceEvent,
  DeployService as DeployServiceEvent,
  TerminateService as TerminateServiceEvent,
  OperatorUnbond as OperatorUnbondEvent,
  ServiceRegistry
} from "../generated/ServiceRegistry/ServiceRegistry"
import {
  Unit,
  Service,
  Global,
  Builder
} from "../generated/schema"

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

const ComponentTypePrefix = Bytes.fromHexString("cm")

const AgentTypePrefix = Bytes.fromHexString("ag")

const ServiceTypePrefix = Bytes.fromHexString("sr")

const GlobalId = ""

function getGlobal(): Global {
  let global = Global.load(GlobalId)
  if (global) {
    return global
  }

  global = new Global(GlobalId)
  global.totalBuilders = BigInt.fromI32(0)
  global.totalAgents = BigInt.fromI32(0)
  global.totalComponents = BigInt.fromI32(0)
  global.totalServices = BigInt.fromI32(0)
  global.save()
  return global
}

function trackMint(builderAddress: string, mintType: string): void {
  let builder = Builder.load(builderAddress)
  let global = getGlobal()

  if (builder === null) {
    builder = new Builder(builderAddress)
    builder.save()
    global.totalBuilders = global.totalBuilders.plus(BigInt.fromI32(1))
  }

  if (mintType == "agent") {
    global.totalAgents = global.totalAgents.plus(BigInt.fromI32(1))
  } else if (mintType == "component") {
    global.totalComponents = global.totalComponents.plus(BigInt.fromI32(1))
  } else if (mintType == "service") {
    global.totalServices = global.totalServices.plus(BigInt.fromI32(1))
  }

  global.save()
}

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

export function handleCreateComponent(event: CreateComponentEvent): void {
  let unitHash = Base16HashPrefix + event.params.unitHash.toHexString().slice(2)
  let owner = ComponentRegistry.bind(event.address).ownerOf(event.params.unitId).toHexString()
  let id: Bytes = ComponentTypePrefix.concat(Bytes.fromByteArray(Bytes.fromBigInt(event.params.unitId)))

  // Create record
  createOrUpdateUnit(
    id,
    event.params.unitId,
    owner,
    unitHash,
    event.block.number,
    event.transaction.hash.toHexString()
  )
}

export function handleUpdateComponent(event: UpdateComponentEvent): void {
  let unitHash = Base16HashPrefix + event.params.unitHash.toHexString().slice(2)
  let owner = ComponentRegistry.bind(event.address).ownerOf(event.params.unitId).toHexString()
  let id: Bytes = ComponentTypePrefix.concat(Bytes.fromByteArray(Bytes.fromBigInt(event.params.unitId)))

  // Update record
  createOrUpdateUnit(
    id,
    event.params.unitId,
    owner,
    unitHash,
    event.block.number,
    event.transaction.hash.toHexString()
  )
}

export function handleCreateAgent(event: CreateAgentEvent): void {
  let unitHash = Base16HashPrefix + event.params.unitHash.toHexString().slice(2)
  let owner = AgentRegistry.bind(event.address).ownerOf(event.params.unitId).toHexString()
  let id: Bytes = AgentTypePrefix.concat(Bytes.fromByteArray(Bytes.fromBigInt(event.params.unitId)))

  // Store record
  createOrUpdateUnit(
    id,
    event.params.unitId,
    owner,
    unitHash,
    event.block.number,
    event.transaction.hash.toHexString(),
    "agent",
  )
}

export function handleUpdateAgent(event: UpdateAgentEvent): void {
  let unitHash = Base16HashPrefix + event.params.unitHash.toHexString().slice(2)
  let owner = AgentRegistry.bind(event.address).ownerOf(event.params.unitId).toHexString()
  let id: Bytes = AgentTypePrefix.concat(Bytes.fromByteArray(Bytes.fromBigInt(event.params.unitId)))

  // Update record
  createOrUpdateUnit(
    id,
    event.params.unitId,
    owner,
    unitHash,
    event.block.number,
    event.transaction.hash.toHexString(),
    "agent",
  )
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

export function handleComponentTransfer(event: ComponentTransferEvent): void {
  if (event.params.from == Address.zero()) {
    trackMint(event.params.to.toHexString(), "component")
  }

  let unit = Unit.load(ComponentTypePrefix.concat(Bytes.fromByteArray(Bytes.fromBigInt(event.params.id))))
  if (unit) {
    log.info(
      "Updating owner for component {} from {} to {}",
      [event.params.id.toString(), event.params.from.toHexString(), event.params.to.toHexString()]
    )
    unit.owner = event.params.to.toHexString()
    unit.save()
  }
}

export function handleAgentTransfer(event: AgentTransferEvent): void {
  if (event.params.from == Address.zero()) {
    trackMint(event.params.to.toHexString(), "agent")
  }

  let unit = Unit.load(AgentTypePrefix.concat(Bytes.fromByteArray(Bytes.fromBigInt(event.params.id))))
  if (unit) {
    log.info(
      "Updating owner for agent {} from {} to {}",
      [event.params.id.toString(), event.params.from.toHexString(), event.params.to.toHexString()]
    )
    unit.owner = event.params.to.toHexString()
    unit.save()
  }
}

export function handleServiceTransfer(event: ServiceTransferEvent): void {
  if (event.params.from == Address.zero()) {
    trackMint(event.params.to.toHexString(), "service")
  }

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
