#!/usr/bin/env node
/**
 * Fetch all mechs from subgraph, compare with on-chain values
 * 
 * Usage: node verify-mech-counters.js
 */

const { ethers } = require('ethers');

// const SUBGRAPH_URL = 'https://subgraph.staging.autonolas.tech/subgraphs/name/marketplace-gnosis-v0_6_0';
// const RPC_URL = 'https://rpc.gnosischain.com';

const SUBGRAPH_URL = 'https://subgraph.staging.autonolas.tech/subgraphs/name/marketplace-base-v0_0_4';
const RPC_URL = 'https://1rpc.io/base';

const MECH_ABI = [
  'function numTotalRequests() view returns (uint256)',
  'function numTotalDeliveries() view returns (uint256)',
];

async function fetchAllMechs() {
  const query = `{ meches(first: 1000) { id address receivedRequests totalDeliveriesTransactions } }`;

  const res = await fetch(SUBGRAPH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });

  const data = await res.json();
  if (data.errors) throw new Error(JSON.stringify(data.errors));
  return data.data.meches;
}

async function getOnChainValues(provider, address) {
  const contract = new ethers.Contract(address, MECH_ABI, provider);
  
  const [numTotalRequests, numTotalDeliveries] = await Promise.all([
    contract.numTotalRequests(),
    contract.numTotalDeliveries(),
  ]);

  return {
    numTotalRequests: numTotalRequests.toString(),
    numTotalDeliveries: numTotalDeliveries.toString(),
  };
}

async function main() {
  if (!SUBGRAPH_URL) {
    console.error('Set SUBGRAPH_URL in the script');
    process.exit(1);
  }

  const provider = new ethers.JsonRpcProvider(RPC_URL);

  console.log('Fetching mechs from subgraph...');
  const mechs = await fetchAllMechs();
  console.log(`Found ${mechs.length} mechs\n`);

  const results = [];

  for (const mech of mechs) {
    try {
      const onChain = await getOnChainValues(provider, mech.address);
      
      const reqDiff = Number(mech.receivedRequests) - Number(onChain.numTotalRequests);
      const delDiff = Number(mech.totalDeliveriesTransactions) - Number(onChain.numTotalDeliveries);

      results.push({
        address: mech.address,
        id: mech.id,
        subgraph: { requests: mech.receivedRequests, deliveries: mech.totalDeliveriesTransactions },
        onChain: { requests: onChain.numTotalRequests, deliveries: onChain.numTotalDeliveries },
        diff: { requests: reqDiff, deliveries: delDiff },
      });

      const status = (reqDiff === 0 && delDiff === 0) ? '✅' : '❌';
      console.log(`${status} ${mech.address} | req: ${mech.receivedRequests} vs ${onChain.numTotalRequests} (${reqDiff >= 0 ? '+' : ''}${reqDiff}) | del: ${mech.totalDeliveriesTransactions} vs ${onChain.numTotalDeliveries} (${delDiff >= 0 ? '+' : ''}${delDiff})`);
    } catch (err) {
      console.log(`⚠️  ${mech.address} | Error: ${err.message}`);
    }
  }

  // Summary
  const withDiff = results.filter(r => r.diff.requests !== 0 || r.diff.deliveries !== 0);
  const totalReqDiff = results.reduce((sum, r) => sum + r.diff.requests, 0);
  const totalDelDiff = results.reduce((sum, r) => sum + r.diff.deliveries, 0);

  console.log('\n--- SUMMARY ---');
  console.log(`Total mechs: ${results.length}`);
  console.log(`Mechs with differences: ${withDiff.length}`);
  console.log(`Total request divergence: ${totalReqDiff >= 0 ? '+' : ''}${totalReqDiff}`);
  console.log(`Total delivery divergence: ${totalDelDiff >= 0 ? '+' : ''}${totalDelDiff}`);
}

main().catch(console.error);
