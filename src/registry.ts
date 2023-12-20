import { BigInt, ipfs, json, log } from "@graphprotocol/graph-ts"
import {
  CreateUnit as CreateComponentEvent,
} from "../generated/ComponentRegistry/ComponentRegistry"
import {
  CreateUnit as CreateAgentEvent,
} from "../generated/AgentRegistry/AgentRegistry"
import {
  CreateService as CreateServiceEvent, ServiceRegistry
} from "../generated/ServiceRegistry/ServiceRegistry"
import {
  Unit
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
}

function tryGetPackageType(packageHash: string, packageName: string): string {
  let baseURI = packageHash + "/" + packageName + "/";
  if (ipfs.cat(baseURI + "protocol.yaml")) {
    return "PROTOCOL"
  } else if (ipfs.cat(baseURI + "connection.yaml")) {
    return "CONNECTION"
  } else if (ipfs.cat(baseURI + "contract.yaml")) {
    return "CONTRACT"
  } else if (ipfs.cat(baseURI + "skill.yaml")) {
    return "SKILL"
  } else {
    return "UNKNOWN"
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
      packageType = "UNKNOWN"
    }
    return { "packageHash": packageHash, "publicId": publicId, "pakageType": packageType }
  }
  return null
}

function createEntity(entity: Unit, unitHash: string, tokenId: BigInt, packageType: string | null = null): void {
  let metadata = getMetadata(unitHash)
  if (metadata) {
    entity.tokenId = tokenId
    entity.metadataHash = unitHash
    entity.packageHash = metadata.packageHash
    entity.publicId = metadata.publicId

    if (packageType) {
      entity.packageType = packageType
    } else {
      entity.packageType = metadata.pakageType
    }

    log.info(
      "Storing record\n\tTokenID: {}\n\tPublicID: {}\n\tPackageHash: {}\n\tpackageType: {}\n\tMetadataHash: {}\n",
      [entity.tokenId.toString(), entity.publicId, entity.packageHash, entity.packageType, entity.metadataHash],
    )
    entity.save()
  } else {
    log.error("Could not retrieve metadata for {}", [unitHash])
    return
  }
}

export function handleCreateComponent(event: CreateComponentEvent): void {
  let entity = new Unit(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  let unitHash = BASE16_HASH_PREFIX + event.params.unitHash.toHexString().slice(2)
  log.info(
    "Trying to create record for\n\tTokenID: {}\n\tMetadataHash: {}\n\tpackageType: {}\n\tBlockNumber: {}\n",
    [event.params.unitId.toString(), unitHash, "COMPONENT", event.block.number.toString()],
  )
  createEntity(entity, unitHash, event.params.unitId)
}

export function handleCreateAgent(event: CreateAgentEvent): void {
  let entity = new Unit(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  let unitHash = BASE16_HASH_PREFIX + event.params.unitHash.toHexString().slice(2)
  log.info(
    "Trying to create record for\n\tTokenID: {}\n\tMetadataHash: {}\n\tpackageType: {}\n\tBlockNumber: {}\n",
    [event.params.unitId.toString(), unitHash, "AGENT", event.block.number.toString()],
  )
  createEntity(entity, unitHash, event.params.unitId, "AGENT")
}

export function handleCreateService(event: CreateServiceEvent): void {
  let entity = new Unit(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  let service_metadata_uri_parts = ServiceRegistry.bind(event.address).tokenURI(event.params.serviceId).split("/")
  let unitHash = service_metadata_uri_parts.at(-1);
  log.info(
    "Trying to create record for\n\tTokenID: {}\n\tMetadataHash: {}\n\tpackageType: {}\n\tBlockNumber: {}\n",
    [event.params.serviceId.toString(), unitHash, "SERVICE", event.block.number.toString()],
  )
  createEntity(entity, unitHash, event.params.serviceId, "SERVICE")
}
