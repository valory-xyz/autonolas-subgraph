#!/usr/bin/env node
/**
 * Compare two subgraph versions to validate data integrity after upgrades
 *
 * Usage:
 *   node compare-subgraph-versions.js --network base --v1 v5_2_0 --v2 v6_0_0
 *   node compare-subgraph-versions.js --network polygon --v1 v5_2_0 --v2 v6_0_0
 *   node compare-subgraph-versions.js --network base --v1 v5_2_0 --v2 v6_0_0 --verify-onchain
 *
 * Output:
 *   - Sync status for both versions
 *   - Global stats comparison
 *   - Mech entity differences
 *   - On-chain verification (with --verify-onchain flag)
 */

const SUBGRAPH_BASE_URL = 'https://subgraph.staging.autonolas.tech/subgraphs/name';

const NETWORKS = {
  gnosis: {
    rpcs: ['https://rpc.gnosischain.com', 'https://gnosis.drpc.org', 'https://rpc.ankr.com/gnosis'],
  },
  base: {
    rpcs: ['https://mainnet.base.org', 'https://base.drpc.org', 'https://rpc.ankr.com/base'],
  },
  polygon: {
    rpcs: ['https://polygon-rpc.com', 'https://polygon.drpc.org', 'https://rpc.ankr.com/polygon'],
  },
  optimism: {
    rpcs: ['https://mainnet.optimism.io', 'https://optimism.drpc.org', 'https://rpc.ankr.com/optimism'],
  },
};

const MECH_ABI = [
  {
    name: 'maxDeliveryRate',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
];

function parseCliArgs() {
  const args = process.argv.slice(2);
  const networkIdx = args.indexOf('--network');
  const v1Idx = args.indexOf('--v1');
  const v2Idx = args.indexOf('--v2');
  const rpcIdx = args.indexOf('--rpc');
  const verifyOnchain = args.includes('--verify-onchain');

  if (networkIdx === -1 || v1Idx === -1 || v2Idx === -1) {
    console.error('Usage: node compare-subgraph-versions.js --network <network> --v1 <version> --v2 <version> [--verify-onchain] [--rpc <url>]');
    console.error('Networks: ' + Object.keys(NETWORKS).join(', '));
    console.error('Example: node compare-subgraph-versions.js --network base --v1 v5_2_0 --v2 v6_0_0 --verify-onchain');
    console.error('Example with custom RPC: node compare-subgraph-versions.js --network base --v1 v5_2_0 --v2 v6_0_0 --verify-onchain --rpc https://your-rpc.com');
    process.exit(1);
  }

  const network = args[networkIdx + 1];
  const v1 = args[v1Idx + 1];
  const v2 = args[v2Idx + 1];
  const customRpc = rpcIdx !== -1 ? args[rpcIdx + 1] : null;

  if (!NETWORKS[network]) {
    console.error(`Invalid network: ${network}. Must be one of: ${Object.keys(NETWORKS).join(', ')}`);
    process.exit(1);
  }

  return { network, v1, v2, verifyOnchain, customRpc };
}

function buildUrl(network, version) {
  return `${SUBGRAPH_BASE_URL}/marketplace-${network}-${version}`;
}

async function query(url, q) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: q }),
  });
  const data = await res.json();
  if (data.errors) throw new Error(JSON.stringify(data.errors));
  return data.data;
}

async function getMeta(url) {
  const data = await query(url, '{ _meta { block { number } hasIndexingErrors } }');
  return data._meta;
}

async function getMechs(url) {
  const data = await query(url, `{
    meches(first: 1000, orderBy: id) {
      id
      address
      maxDeliveryRate
      paymentType
      karma
      receivedRequests
      totalDeliveriesTransactions
    }
  }`);
  return data.meches || [];
}

async function getGlobal(url) {
  const data = await query(url, `{
    global(id: "global") {
      totalMechs
      totalRequests
      totalDeliveries
    }
  }`);
  return data.global;
}

async function getPendingMechData(url) {
  const data = await query(url, `{
    pendingMechDatas(first: 100) {
      id
      maxDeliveryRate
      createdAtBlock
    }
  }`);
  return data.pendingMechDatas || [];
}

// On-chain verification using native fetch for JSON-RPC
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function ethCall(rpcUrl, to, data, retries = 3, delay = 500) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'eth_call',
          params: [{ to, data }, 'latest'],
        }),
      });
      const json = await res.json();

      // Check for rate limit errors
      if (json.error) {
        const msg = json.error.message || '';
        if (msg.includes('rate limit') || msg.includes('Too Many') || res.status === 429) {
          if (attempt < retries) {
            const backoff = delay * Math.pow(2, attempt - 1);
            await sleep(backoff);
            continue;
          }
        }
        throw new Error(msg);
      }

      return json.result;
    } catch (err) {
      if (attempt < retries && (err.message?.includes('rate') || err.message?.includes('fetch'))) {
        const backoff = delay * Math.pow(2, attempt - 1);
        await sleep(backoff);
        continue;
      }
      throw err;
    }
  }
}

function encodeMaxDeliveryRate() {
  // keccak256("maxDeliveryRate()") first 4 bytes
  return '0x2cc0fcb2';
}

async function getOnChainMaxDeliveryRate(rpcUrls, mechAddress) {
  const urls = Array.isArray(rpcUrls) ? rpcUrls : [rpcUrls];
  let lastError = null;

  for (const rpcUrl of urls) {
    try {
      const result = await ethCall(rpcUrl, mechAddress, encodeMaxDeliveryRate());
      // Result is hex-encoded uint256
      return BigInt(result).toString();
    } catch (err) {
      lastError = err;
      // Try next RPC on rate limit or network errors
      if (err.message?.includes('rate') || err.message?.includes('fetch') || err.message?.includes('limit')) {
        continue;
      }
      // For other errors (like contract doesn't exist), don't retry with other RPCs
      return { error: err.message };
    }
  }

  return { error: lastError?.message || 'All RPCs failed' };
}

async function verifyMechsOnChain(rpcUrls, mechs, v1Mechs, v2Mechs, throttleMs = 200) {
  const v1Map = new Map(v1Mechs.map(m => [m.address, m]));
  const v2Map = new Map(v2Mechs.map(m => [m.address, m]));

  const results = [];
  const total = mechs.length;

  for (let i = 0; i < mechs.length; i++) {
    const mech = mechs[i];

    // Progress indicator
    process.stdout.write(`\rVerifying mech ${i + 1}/${total}...`);

    const onChainRate = await getOnChainMaxDeliveryRate(rpcUrls, mech.address);
    const v1Mech = v1Map.get(mech.address);
    const v2Mech = v2Map.get(mech.address);

    const v1Rate = v1Mech?.maxDeliveryRate || 'N/A';
    const v2Rate = v2Mech?.maxDeliveryRate || 'N/A';

    if (typeof onChainRate === 'object' && onChainRate.error) {
      results.push({
        address: mech.address,
        id: mech.id,
        onChain: 'ERROR: ' + onChainRate.error,
        v1: v1Rate,
        v2: v2Rate,
        v1Match: false,
        v2Match: false,
      });
    } else {
      results.push({
        address: mech.address,
        id: mech.id,
        onChain: onChainRate,
        v1: v1Rate,
        v2: v2Rate,
        v1Match: v1Rate === onChainRate,
        v2Match: v2Rate === onChainRate,
      });
    }

    // Throttle to avoid rate limits
    if (i < mechs.length - 1) {
      await sleep(throttleMs);
    }
  }

  process.stdout.write('\r' + ' '.repeat(30) + '\r'); // Clear progress line
  return results;
}

function printOnChainVerification(results) {
  console.log('\n--- On-Chain Verification (maxDeliveryRate) ---');
  console.log('Source of truth: on-chain contract state\n');

  const successfulResults = results.filter(r => !r.onChain.startsWith?.('ERROR'));
  const errors = results.filter(r => typeof r.onChain === 'string' && r.onChain.startsWith('ERROR'));

  const v1Correct = successfulResults.filter(r => r.v1Match);
  const v2Correct = successfulResults.filter(r => r.v2Match);
  const bothCorrect = successfulResults.filter(r => r.v1Match && r.v2Match);
  const v1Only = successfulResults.filter(r => r.v1Match && !r.v2Match);
  const v2Only = successfulResults.filter(r => !r.v1Match && r.v2Match);
  const neitherMatch = successfulResults.filter(r => !r.v1Match && !r.v2Match);

  // Always show all verified mechs with their values
  console.log(`Verified mechs (${successfulResults.length}/${results.length}):\n`);
  console.log('  ID    Address                                      On-Chain          V1                V2');
  console.log('  ' + '-'.repeat(100));

  for (const r of successfulResults) {
    const v1Status = r.v1Match ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m';
    const v2Status = r.v2Match ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m';
    const id = r.id.toString().padEnd(5);
    const addr = r.address.substring(0, 10) + '...' + r.address.substring(38);
    const onChain = r.onChain.padStart(16);
    const v1Val = (r.v1 + ' ' + v1Status).padStart(20);
    const v2Val = (r.v2 + ' ' + v2Status).padStart(20);
    console.log(`  ${id} ${addr}  ${onChain}  ${v1Val}  ${v2Val}`);
  }

  if (errors.length > 0) {
    console.log(`\n\x1b[33mRPC Errors (${errors.length}):\x1b[0m`);
    errors.forEach(r => {
      console.log(`  Mech ${r.id} (${r.address}): ${r.onChain.substring(7, 50)}...`);
    });
  }

  // Summary
  console.log('\n--- Summary ---');
  console.log(`V1 matches on-chain: ${v1Correct.length}/${successfulResults.length}`);
  console.log(`V2 matches on-chain: ${v2Correct.length}/${successfulResults.length}`);

  if (v1Only.length > 0) {
    console.log(`\x1b[33mV1 correct but V2 wrong: ${v1Only.length}\x1b[0m`);
  }
  if (v2Only.length > 0) {
    console.log(`\x1b[32mV2 correct but V1 wrong: ${v2Only.length}\x1b[0m`);
  }
  if (neitherMatch.length > 0) {
    console.log(`\x1b[31mBoth wrong: ${neitherMatch.length}\x1b[0m`);
  }

  return {
    v1Correct: v1Correct.length,
    v2Correct: v2Correct.length,
    total: successfulResults.length,
    v1Only: v1Only.length,
    v2Only: v2Only.length,
    neitherMatch: neitherMatch.length,
  };
}

function compareMechs(v1Mechs, v2Mechs) {
  const v1Map = new Map(v1Mechs.map(m => [m.id, m]));
  const v2Map = new Map(v2Mechs.map(m => [m.id, m]));

  const differences = [];
  const v2Only = [];
  const v1Only = [];

  for (const [id, v2Mech] of v2Map) {
    const v1Mech = v1Map.get(id);
    if (!v1Mech) {
      v2Only.push(v2Mech);
      continue;
    }

    const diff = {};
    const fields = ['address', 'maxDeliveryRate', 'paymentType', 'karma', 'receivedRequests', 'totalDeliveriesTransactions'];
    for (const f of fields) {
      if (String(v1Mech[f] || '') !== String(v2Mech[f] || '')) {
        diff[f] = { v1: v1Mech[f], v2: v2Mech[f] };
      }
    }
    if (Object.keys(diff).length > 0) {
      differences.push({ id, address: v2Mech.address, diff });
    }
  }

  for (const [id, v1Mech] of v1Map) {
    if (!v2Map.has(id)) {
      v1Only.push(v1Mech);
    }
  }

  return { differences, v1Only, v2Only };
}

function printSyncStatus(label, meta, url) {
  const errorStatus = meta.hasIndexingErrors ? '\x1b[31mYES\x1b[0m' : '\x1b[32mNo\x1b[0m';
  console.log(`${label}:`);
  console.log(`  URL: ${url}`);
  console.log(`  Block: ${meta.block.number.toLocaleString()}`);
  console.log(`  Indexing Errors: ${errorStatus}`);
}

function printGlobalStats(g1, g2) {
  console.log('\nGlobal Stats:');
  console.log(`  totalMechs:      V1=${g1?.totalMechs || 0}, V2=${g2?.totalMechs || 0}`);
  console.log(`  totalRequests:   V1=${g1?.totalRequests || 0}, V2=${g2?.totalRequests || 0}`);
  console.log(`  totalDeliveries: V1=${g1?.totalDeliveries || 0}, V2=${g2?.totalDeliveries || 0}`);
}

function printMechComparison(mechs1, mechs2, comparison) {
  const { differences, v1Only, v2Only } = comparison;
  const matching = mechs2.length - differences.length - v2Only.length;

  console.log(`\nMech Entities: V1=${mechs1.length}, V2=${mechs2.length}`);
  console.log(`  Matching: ${matching}`);
  console.log(`  With differences: ${differences.length}`);
  console.log(`  Only in V1: ${v1Only.length}`);
  console.log(`  Only in V2: ${v2Only.length}`);

  if (differences.length > 0) {
    console.log('\nDifferences (first 10):');
    differences.slice(0, 10).forEach(d => {
      console.log(`  Mech ${d.id} (${d.address}):`);
      Object.entries(d.diff).forEach(([field, vals]) => {
        console.log(`    ${field}: ${vals.v1} -> ${vals.v2}`);
      });
    });
  }

  if (v1Only.length > 0) {
    console.log('\nMechs only in V1 (first 5):');
    v1Only.slice(0, 5).forEach(m => {
      console.log(`  ${m.id}: ${m.address}`);
    });
  }

  if (v2Only.length > 0) {
    console.log('\nMechs only in V2 (first 5):');
    v2Only.slice(0, 5).forEach(m => {
      console.log(`  ${m.id}: ${m.address}`);
    });
  }
}

async function main() {
  const { network, v1, v2, verifyOnchain, customRpc } = parseCliArgs();

  const v1Url = buildUrl(network, v1);
  const v2Url = buildUrl(network, v2);
  const rpcUrls = customRpc ? [customRpc] : NETWORKS[network].rpcs;

  console.log('='.repeat(60));
  console.log(`COMPARING ${network.toUpperCase()} SUBGRAPHS: ${v1} vs ${v2}`);
  console.log('='.repeat(60));

  // Fetch metadata
  const [meta1, meta2] = await Promise.all([getMeta(v1Url), getMeta(v2Url)]);

  console.log('\n--- Sync Status ---');
  printSyncStatus(`V1 (${v1})`, meta1, v1Url);
  printSyncStatus(`V2 (${v2})`, meta2, v2Url);

  const blockDiff = meta1.block.number - meta2.block.number;
  const syncPercent = ((meta2.block.number / meta1.block.number) * 100).toFixed(2);

  if (blockDiff > 0) {
    console.log(`\n\x1b[33mWarning: V2 is ${blockDiff.toLocaleString()} blocks behind V1 (${syncPercent}% synced)\x1b[0m`);
    console.log('Differences may be due to sync lag, not implementation issues.');
  }

  // Fetch and compare data
  const [global1, global2] = await Promise.all([getGlobal(v1Url), getGlobal(v2Url)]);
  printGlobalStats(global1, global2);

  const [mechs1, mechs2] = await Promise.all([getMechs(v1Url), getMechs(v2Url)]);
  const comparison = compareMechs(mechs1, mechs2);
  printMechComparison(mechs1, mechs2, comparison);

  // Check PendingMechData in V2 (should be empty after sync)
  let pendingData = [];
  try {
    pendingData = await getPendingMechData(v2Url);
    if (pendingData.length > 0) {
      console.log(`\n\x1b[33mPendingMechData entities in V2: ${pendingData.length}\x1b[0m`);
      console.log('(These are consumed during mech creation - presence indicates in-flight data)');
    }
  } catch {
    // Entity may not exist in schema
  }

  // On-chain verification
  let onChainStats = null;
  if (verifyOnchain) {
    const rpcDisplay = customRpc ? customRpc : `${rpcUrls.length} RPCs with fallback`;
    console.log(`\nVerifying against on-chain data (${rpcDisplay})...`);
    // Use all unique mech addresses from both versions
    const allMechs = [...new Map([...mechs1, ...mechs2].map(m => [m.address, m])).values()];
    const onChainResults = await verifyMechsOnChain(rpcUrls, allMechs, mechs1, mechs2);
    onChainStats = printOnChainVerification(onChainResults);
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  if (meta1.hasIndexingErrors || meta2.hasIndexingErrors) {
    console.log('\x1b[31mSTATUS: INDEXING ERRORS DETECTED\x1b[0m');
  } else if (blockDiff > 1000) {
    console.log('\x1b[33mSTATUS: V2 STILL SYNCING - Re-run when sync complete\x1b[0m');
  } else if (comparison.differences.length === 0 && comparison.v1Only.length === 0) {
    console.log('\x1b[32mSTATUS: DATA MATCHES\x1b[0m');
  } else {
    console.log('\x1b[33mSTATUS: DIFFERENCES FOUND - Review above\x1b[0m');
  }

  if (onChainStats) {
    const { v1Correct, v2Correct, total, v2Only } = onChainStats;
    const v1Pct = total > 0 ? ((v1Correct/total)*100).toFixed(1) : 0;
    const v2Pct = total > 0 ? ((v2Correct/total)*100).toFixed(1) : 0;
    console.log(`\nOn-chain accuracy: V1=${v1Correct}/${total} (${v1Pct}%), V2=${v2Correct}/${total} (${v2Pct}%)`);
    if (v2Only > 0) {
      console.log(`\x1b[32mV2 fixed ${v2Only} mech(s) that V1 had wrong\x1b[0m`);
    } else if (v2Correct > v1Correct) {
      console.log('\x1b[32mV2 has better on-chain accuracy for maxDeliveryRate\x1b[0m');
    } else if (v1Correct > v2Correct) {
      console.log('\x1b[33mV1 has better on-chain accuracy for maxDeliveryRate\x1b[0m');
    } else if (v1Correct === v2Correct && v1Correct === total) {
      console.log('\x1b[32mBoth versions match on-chain data\x1b[0m');
    }
  }
  console.log('='.repeat(60));
}

main().catch(err => {
  console.error('\x1b[31mError:\x1b[0m', err.message);
  process.exit(1);
});
