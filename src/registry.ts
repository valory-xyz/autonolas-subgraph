import { Address, BigInt, ByteArray, Bytes, ipfs, json, log } from "@graphprotocol/graph-ts"
import {
  CreateUnit as CreateComponentEvent, ComponentRegistry
} from "../generated/ComponentRegistry/ComponentRegistry"
import {
  CreateUnit as CreateAgentEvent, AgentRegistry
} from "../generated/AgentRegistry/AgentRegistry"
import {
  CreateService as CreateServiceEvent,
  ActivateRegistration as ActivateRegistrationEvent,
  RegisterInstance as RegisterInstanceEvent,
  DeployService as DeployServiceEvent,
  TerminateService as TerminateServiceEvent,
  OperatorUnbond as OperatorUnbondEvent,
  ServiceRegistry
} from "../generated/ServiceRegistry/ServiceRegistry"
import {
  Unit,
  Service
} from "../generated/schema"

let BASE16_HASH_PREFIX = "f01701220"
interface MetadataInterface {
  packageHash: string;
  publicId: string;
}

class Metadata implements MetadataInterface {
  packageHash: string
  publicId: string
  pakageType: string
  image: string
  description: string
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

function getMetadata(unitHash: string): Metadata | null {
  let metadata_response = ipfs.cat(unitHash)
  if (metadata_response) {
    let publicId: string, packageHash: string, packageType: string
    let metadata = json.fromString(metadata_response.toString()).toObject()
    let code_uri = metadata.get("code_uri")
    let name = metadata.get("name")
    if (!code_uri || !name) {
      return null
    }
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

    let image = metadata.get("image")
    let description = metadata.get("description")
    if (!image || !description) {
      return null
    }

    return {
      "packageHash": packageHash,
      "publicId": publicId,
      "pakageType": packageType.toLowerCase(),
      "image": image.toString().replace("ipfs://", ""),
      "description": description.toString()
    }
  }
  return null
}



function createEntity(entity: Unit, unitHash: string, tokenId: BigInt, owner: string, packageType: string | null = null): void {
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

export function handleCreateComponent(event: CreateComponentEvent): void {
  let unitHash = BASE16_HASH_PREFIX + event.params.unitHash.toHexString().slice(2)
  let owner = ComponentRegistry.bind(event.address).ownerOf(event.params.unitId).toHexString()
  let entity = new Unit(event.transaction.hash.concatI32(event.logIndex.toI32()))

  log.info(
    "Trying to create record for\n\tTokenID: {}\n\tMetadataHash: {}\n\tpackageType: {}\n\tBlockNumber: {}\n",
    [event.params.unitId.toString(), unitHash, "COMPONENT", event.block.number.toString()],
  )
  createEntity(entity, unitHash, event.params.unitId, owner)
}

export function handleCreateAgent(event: CreateAgentEvent): void {
  let unitHash = BASE16_HASH_PREFIX + event.params.unitHash.toHexString().slice(2)
  let owner = AgentRegistry.bind(event.address).ownerOf(event.params.unitId).toHexString()
  let entity = new Unit(event.transaction.hash.concatI32(event.logIndex.toI32()))

  log.info(
    "Trying to create record for\n\tTokenID: {}\n\tMetadataHash: {}\n\tpackageType: {}\n\tBlockNumber: {}\n",
    [event.params.unitId.toString(), unitHash, "agent", event.block.number.toString()],
  )
  createEntity(entity, unitHash, event.params.unitId, owner, "agent")
}

export function handleCreateService(event: CreateServiceEvent): void {
  let service_metadata_uri_parts = ServiceRegistry.bind(event.address).tokenURI(event.params.serviceId).split("/")
  let owner = ServiceRegistry.bind(event.address).ownerOf(event.params.serviceId).toHexString()
  let entity = new Unit(event.transaction.hash.concatI32(event.logIndex.toI32()))

  let unitHash = service_metadata_uri_parts.at(-1);
  log.info(
    "Trying to create record for\n\tTokenID: {}\n\tMetadataHash: {}\n\tpackageType: {}\n\tBlockNumber: {}\n",
    [event.params.serviceId.toString(), unitHash, "service", event.block.number.toString()],
  )
  createEntity(entity, unitHash, event.params.serviceId, owner, "service")
  handleServiceUpdate(event.params.serviceId, event.address)
}

function updateServiceState(entity: Service, serviceId: BigInt, serviceRegistryAddress: Address): void {
  let serviceInfo = ServiceRegistry.bind(serviceRegistryAddress).getService(serviceId)
  entity.serviceId = serviceId
  entity.state = BigInt.fromI32((serviceInfo.state))
  entity.agentIds = serviceInfo.agentIds
  entity.configHash = BASE16_HASH_PREFIX + serviceInfo.configHash.toHexString().slice(2)
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
  entity.owner = ServiceRegistry.bind(serviceRegistryAddress).ownerOf(serviceId).toHexString()

  let metadata = getMetadata(ServiceRegistry.bind(serviceRegistryAddress).tokenURI(serviceId).split("/").at(-1))
  if (metadata) {
    entity.publicId = metadata.publicId
    entity.packageHash = metadata.packageHash
    entity.metadataHash = entity.configHash
  } else {
    entity.publicId = "n/a"
    entity.packageHash = "n/a"
    entity.metadataHash = entity.configHash
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