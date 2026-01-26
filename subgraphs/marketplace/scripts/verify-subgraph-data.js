#!/usr/bin/env node
/**
 * Verify subgraph data against on-chain contract values
 *
 * Usage: node verify-subgraph-data.js --network gnosis [--subgraph-url https://...]
 */

const { ethers } = require('ethers');
const chalk = require('chalk');

const NETWORKS = {
  gnosis: {
    rpc: 'https://rpc.gnosischain.com',
    subgraphUrl: 'https://subgraph.staging.autonolas.tech/subgraphs/name/marketplace-gnosis-v4_0_0',
    karmaAddress: '0x2C602C7B590ABFc148d8c7c5e4d58c56Be1d304a',
  },
  polygon: {
    rpc: 'https://polygon-rpc.com',
    subgraphUrl: 'https://subgraph.staging.autonolas.tech/subgraphs/name/marketplace-polygon-v5_2_0',
    karmaAddress: '0x7fc0ddf4DFB61CfA5519db2A5eE7B2Eb02De0140',
  },
  base: {
    rpc: 'https://mainnet.base.org',
    subgraphUrl: 'https://subgraph.staging.autonolas.tech/subgraphs/name/marketplace-base-v5_2_0',
    karmaAddress: '0x1f84F8F70dE0651C2d51Bf8850FE9D0289Ba3B3A',
  },
  optimism: {
    rpc: 'https://mainnet.optimism.io',
    subgraphUrl: 'https://subgraph.staging.autonolas.tech/subgraphs/name/marketplace-optimism-v5_2_0',
    karmaAddress: '0xd2ff4Cf0927c3cFbF3BB27391044dBaf6f4ca7b9',
  },
};

const MECH_ABI = [
  'function maxDeliveryRate() view returns (uint256)',
  'function numTotalRequests() view returns (uint256)',
  'function numTotalDeliveries() view returns (uint256)',
];

const KARMA_ABI = [
  'function mapMechKarma(address) view returns (int256)',
];

function parseCliArgs() {
  const args = process.argv.slice(2);
  const networkIdx = args.indexOf('--network');
  const urlIdx = args.indexOf('--subgraph-url');

  if (networkIdx === -1 || !args[networkIdx + 1]) {
    console.error('Usage: node verify-subgraph-data.js --network <gnosis|polygon|base|optimism> [--subgraph-url <url>]');
    process.exit(1);
  }

  const network = args[networkIdx + 1];
  const subgraphUrl = urlIdx !== -1 ? args[urlIdx + 1] : null;

  if (!NETWORKS[network]) {
    console.error(`Invalid network: ${network}. Must be one of: ${Object.keys(NETWORKS).join(', ')}`);
    process.exit(1);
  }

  return { network, subgraphUrl };
}

async function querySubgraph(subgraphUrl, query) {
  const res = await fetch(subgraphUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });

  const data = await res.json();
  if (data.errors) throw new Error(JSON.stringify(data.errors));
  return data.data;
}

async function fetchMechs(subgraphUrl) {
  const query = `{
    meches(first: 1000) {
      id
      address
      karma
      maxDeliveryRate
      receivedRequests
      totalDeliveriesTransactions
    }
  }`;

  const data = await querySubgraph(subgraphUrl, query);
  return data.meches;
}

async function fetchSyncStatus(subgraphUrl) {
  const query = `{
    _meta {
      block { number }
      hasIndexingErrors
    }
  }`;

  const data = await querySubgraph(subgraphUrl, query);
  return data._meta;
}

async function getOnChainValues(provider, karmaContract, mechAddress) {
  try {
    const mechContract = new ethers.Contract(mechAddress, MECH_ABI, provider);

    const [karma, maxDeliveryRate, numTotalRequests, numTotalDeliveries] = await Promise.all([
      karmaContract.mapMechKarma(mechAddress),
      mechContract.maxDeliveryRate(),
      mechContract.numTotalRequests(),
      mechContract.numTotalDeliveries(),
    ]);

    return {
      karma: karma.toString(),
      maxDeliveryRate: maxDeliveryRate.toString(),
      numTotalRequests: numTotalRequests.toString(),
      numTotalDeliveries: numTotalDeliveries.toString(),
    };
  } catch (err) {
    throw new Error(`${mechAddress}: ${err.message}`);
  }
}

// String comparison handles int256 karma (can be negative)
function compareValues(subgraph, onChain) {
  const fields = ['karma', 'maxDeliveryRate', 'numTotalRequests', 'numTotalDeliveries'];
  const sgMap = {
    numTotalRequests: subgraph.receivedRequests,
    numTotalDeliveries: subgraph.totalDeliveriesTransactions,
  };

  return fields.map(field => {
    const sgVal = (sgMap[field] || subgraph[field] || '0').toString();
    const ocVal = onChain[field];
    return { field, match: sgVal === ocVal, subgraphVal: sgVal, onChainVal: ocVal };
  });
}

function printSyncStatus(meta) {
  console.log(chalk.cyan('=== Sync Status ==='));
  console.log(`Block: ${meta.block.number}`);
  console.log(`Has Indexing Errors: ${meta.hasIndexingErrors}`);
  console.log('');
}

function printMechComparison(mech, comparison) {
  const allMatch = comparison.every(c => c.match);
  const prefix = allMatch ? chalk.green('MATCH') : chalk.red('DIFF');

  console.log(`${prefix} ${mech.address}`);
  comparison.forEach(({ field, match, subgraphVal, onChainVal }) => {
    if (!match) {
      console.log(`  ${field}: ${subgraphVal} (subgraph) vs ${onChainVal} (on-chain)`);
    }
  });
}

function printSummary(results) {
  const totalMechs = results.length;
  const withDiff = results.filter(r => r.comparison.some(c => !c.match));

  console.log(chalk.cyan('\n=== Summary ==='));
  console.log(`Total mechs: ${totalMechs}`);
  console.log(`Mechs with matches: ${totalMechs - withDiff.length}`);
  console.log(`Mechs with differences: ${withDiff.length}`);
}

async function main() {
  const { network, subgraphUrl: overrideUrl } = parseCliArgs();
  const config = NETWORKS[network];
  const subgraphUrl = overrideUrl || config.subgraphUrl;

  console.log(chalk.cyan(`Verifying ${network} network`));
  console.log(`RPC: ${config.rpc}`);
  console.log(`Subgraph: ${subgraphUrl}\n`);

  try {
    const meta = await fetchSyncStatus(subgraphUrl);
    printSyncStatus(meta);
  } catch (err) {
    console.warn(chalk.yellow(`Warning: Could not fetch sync status: ${err.message}\n`));
  }

  const provider = new ethers.JsonRpcProvider(config.rpc);
  const karmaContract = new ethers.Contract(config.karmaAddress, KARMA_ABI, provider);

  const mechs = await fetchMechs(subgraphUrl);
  console.log(`Found ${mechs.length} mechs\n`);

  const results = [];
  for (const mech of mechs) {
    try {
      const onChain = await getOnChainValues(provider, karmaContract, mech.address);
      const comparison = compareValues(mech, onChain);
      results.push({ mech, comparison });
      printMechComparison(mech, comparison);
    } catch (err) {
      console.log(chalk.yellow(`ERR ${err.message}`));
    }
  }

  printSummary(results);
}

main().catch(console.error);
