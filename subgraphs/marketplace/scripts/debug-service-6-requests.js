const fetch = require('node-fetch');

const MARKETPLACE_SUBGRAPH = 'https://subgraph.staging.autonolas.tech/subgraphs/name/marketplace-gnosis-v0_10_0';
const MECH_MARKETPLACE_SUBGRAPH = 'https://api.studio.thegraph.com/query/1716136/olas-gnosis-mech-marketplace/version/latest';

async function query(subgraph, graphqlQuery) {
  const response = await fetch(subgraph, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: graphqlQuery })
  });
  return response.json();
}

async function main() {
  console.log('=== Debugging Service 6 totalRequests discrepancy ===\n');
  
  // 1. Get Mech entities for Service 6 from both subgraphs
  console.log('--- Mech entities for Service 6 ---\n');
  
  // Marketplace uses "Mech" entity
  const mechsMarketplace = await query(MARKETPLACE_SUBGRAPH, `{
    meches: meches(where: { service: "6" }, first: 10) {
      id
      address
      service
      configHash
    }
  }`);
  console.log('Marketplace - Mech entities:', JSON.stringify(mechsMarketplace, null, 2));
  
  // Mech-marketplace uses "Mech" entity 
  const mechsMechMarketplace = await query(MECH_MARKETPLACE_SUBGRAPH, `{
    meches: meches(where: { service: "6" }, first: 10) {
      id
      address
      service
      configHash
    }
  }`);
  console.log('Mech-marketplace - Mech entities:', JSON.stringify(mechsMechMarketplace, null, 2));
  
  // 2. Get CreateMech entities with serviceId = 6
  console.log('\n--- CreateMech entities with serviceId = 6 ---\n');
  
  const createMechsMarketplace = await query(MARKETPLACE_SUBGRAPH, `{
    createMeches(where: { serviceId: 6 }, first: 10) {
      id
      mech
      serviceId
      agentId
      source
    }
  }`);
  console.log('Marketplace - CreateMech entities:', JSON.stringify(createMechsMarketplace, null, 2));
  
  const createMechsMechMarketplace = await query(MECH_MARKETPLACE_SUBGRAPH, `{
    createMeches(where: { serviceId: 6 }, first: 10) {
      id
      mech
      serviceId
    }
  }`);
  console.log('Mech-marketplace - CreateMech entities:', JSON.stringify(createMechsMechMarketplace, null, 2));
  
  // 3. Get Global counters
  console.log('\n--- Global counters ---\n');
  
  const globalMarketplace = await query(MARKETPLACE_SUBGRAPH, `{
    globals {
      totalMarketplaceRequests
      totalRequests
      totalDeliveries
      totalMarketplaceDeliveries
    }
  }`);
  console.log('Marketplace - Global:', JSON.stringify(globalMarketplace, null, 2));
  
  const globalMechMarketplace = await query(MECH_MARKETPLACE_SUBGRAPH, `{
    globals {
      totalMarketplaceRequests
      totalRequests
      totalDeliveries
      totalMarketplaceDeliveries
    }
  }`);
  console.log('Mech-marketplace - Global:', JSON.stringify(globalMechMarketplace, null, 2));
  
  // 4. Get sample MarketplaceRequest events for Service 6's mech
  console.log('\n--- Sample MarketplaceRequest with Service 6 priority mech ---\n');
  
  // First get the mech addresses for service 6
  if (mechsMechMarketplace.data?.meches?.length > 0) {
    const mechAddress = mechsMechMarketplace.data.meches[0].address;
    console.log(`Querying MarketplaceRequest for mech: ${mechAddress}`);
    
    const requestsMarketplace = await query(MARKETPLACE_SUBGRAPH, `{
      marketplaceRequests(where: { priorityMech: "${mechAddress}" }, first: 5) {
        id
        priorityMech
        requester
        numRequests
      }
    }`);
    console.log('Marketplace - MarketplaceRequest:', JSON.stringify(requestsMarketplace, null, 2));
    
    const requestsMechMarketplace = await query(MECH_MARKETPLACE_SUBGRAPH, `{
      marketplaceRequests(where: { priorityMech: "${mechAddress}" }, first: 5) {
        id
        priorityMech
        requester
        numRequests
      }
    }`);
    console.log('Mech-marketplace - MarketplaceRequest:', JSON.stringify(requestsMechMarketplace, null, 2));
  }
  
  // 5. Get Request entities for Service 6
  console.log('\n--- Request entities for Service 6 ---\n');
  
  const requestsService6Marketplace = await query(MARKETPLACE_SUBGRAPH, `{
    requests(where: { service: "6" }, first: 5, orderBy: blockNumber, orderDirection: desc) {
      id
      mech
      service
      blockNumber
    }
  }`);
  console.log('Marketplace - Request entities for service 6:', JSON.stringify(requestsService6Marketplace, null, 2));
  
  const requestsService6MechMarketplace = await query(MECH_MARKETPLACE_SUBGRAPH, `{
    requests(where: { service: "6" }, first: 5, orderBy: blockNumber, orderDirection: desc) {
      id
      mech
      service
      blockNumber
    }
  }`);
  console.log('Mech-marketplace - Request entities for service 6:', JSON.stringify(requestsService6MechMarketplace, null, 2));
  
  // 6. Query CreateMech by mech address directly
  console.log('\n--- CreateMech by mech address ---\n');
  
  const legacyMech = '0x77af31de935740567cf4ff1986d04b2c964a786a';
  const newMech = '0xc05e7412439bd7e91730a6880e18d5d5873f632c';
  
  // Marketplace uses Bytes ID, so query by id
  const createMechLegacy = await query(MARKETPLACE_SUBGRAPH, `{
    createMech(id: "${legacyMech}") {
      id
      mech
      serviceId
      agentId
      source
    }
  }`);
  console.log('Marketplace - CreateMech for legacy mech:', JSON.stringify(createMechLegacy, null, 2));
  
  const createMechNew = await query(MARKETPLACE_SUBGRAPH, `{
    createMech(id: "${newMech}") {
      id
      mech
      serviceId
      agentId
      source
    }
  }`);
  console.log('Marketplace - CreateMech for new marketplace mech:', JSON.stringify(createMechNew, null, 2));
  
  // Mech-marketplace uses String ID (toHexString)
  const createMechNewMM = await query(MECH_MARKETPLACE_SUBGRAPH, `{
    createMech(id: "${newMech}") {
      id
      mech
      serviceId
    }
  }`);
  console.log('Mech-marketplace - CreateMech for new marketplace mech:', JSON.stringify(createMechNewMM, null, 2));
  
  // 7. Check Service 6's counter breakdown
  console.log('\n--- Service 6 details ---\n');
  
  const service6Marketplace = await query(MARKETPLACE_SUBGRAPH, `{
    service(id: "6") {
      id
      serviceId
      totalRequests
      totalDeliveries
      agentIds
    }
  }`);
  console.log('Marketplace - Service 6:', JSON.stringify(service6Marketplace, null, 2));
  
  const service6MechMarketplace = await query(MECH_MARKETPLACE_SUBGRAPH, `{
    service(id: "6") {
      id
      serviceId
      totalRequests
      totalDeliveries
    }
  }`);
  console.log('Mech-marketplace - Service 6:', JSON.stringify(service6MechMarketplace, null, 2));
}

main().catch(console.error);

