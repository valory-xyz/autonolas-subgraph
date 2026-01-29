#!/usr/bin/env node
/**
 * Check sync progress for marketplace subgraphs across networks
 *
 * Usage:
 *   node check-sync-progress.js                    # Check all networks, latest version
 *   node check-sync-progress.js --version v6_0_0  # Check specific version
 *   node check-sync-progress.js --network base    # Check specific network
 *   node check-sync-progress.js --watch           # Continuous monitoring (30s interval)
 */

const SUBGRAPH_BASE_URL = 'https://subgraph.staging.autonolas.tech/subgraphs/name';

const NETWORKS = ['gnosis', 'base', 'polygon', 'optimism'];

const DEFAULT_VERSIONS = {
  gnosis: 'v5_2_0',
  base: 'v5_2_0',
  polygon: 'v5_2_0',
  optimism: 'v5_2_0',
};

function parseCliArgs() {
  const args = process.argv.slice(2);
  const networkIdx = args.indexOf('--network');
  const versionIdx = args.indexOf('--version');
  const watch = args.includes('--watch');

  const network = networkIdx !== -1 ? args[networkIdx + 1] : null;
  const version = versionIdx !== -1 ? args[versionIdx + 1] : null;

  if (network && !NETWORKS.includes(network)) {
    console.error(`Invalid network: ${network}. Must be one of: ${NETWORKS.join(', ')}`);
    process.exit(1);
  }

  return { network, version, watch };
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

async function getEntityCounts(url) {
  // Query mechs (available in all versions)
  const mechData = await query(url, `{ mechCount: meches(first: 1000) { id } }`);

  // Try to query pendingMechDatas (only in v6+ with MechFactory handlers)
  let pendingCount = 0;
  try {
    const pendingData = await query(url, `{ pendingMechDatas(first: 100) { id } }`);
    pendingCount = pendingData.pendingMechDatas?.length || 0;
  } catch {
    // Entity doesn't exist in this version - that's OK
  }

  return {
    mechs: mechData.mechCount?.length || 0,
    pendingMechData: pendingCount,
  };
}

async function checkNetwork(network, version) {
  const url = buildUrl(network, version);

  try {
    const meta = await getMeta(url);
    const counts = await getEntityCounts(url);

    return {
      network,
      version,
      url,
      block: meta.block.number,
      hasErrors: meta.hasIndexingErrors,
      mechs: counts.mechs,
      pendingMechData: counts.pendingMechData,
      status: 'ok',
    };
  } catch (err) {
    return {
      network,
      version,
      url,
      status: 'error',
      error: err.message,
    };
  }
}

function printResults(results) {
  console.log('\n' + '='.repeat(80));
  console.log('MARKETPLACE SUBGRAPH SYNC STATUS');
  console.log('='.repeat(80));
  console.log(`Timestamp: ${new Date().toISOString()}\n`);

  const maxNetLen = Math.max(...results.map(r => r.network.length));
  const maxVerLen = Math.max(...results.map(r => r.version.length));

  console.log(
    'Network'.padEnd(maxNetLen + 2) +
    'Version'.padEnd(maxVerLen + 2) +
    'Block'.padStart(12) +
    '  Mechs' +
    '  Pending' +
    '  Status'
  );
  console.log('-'.repeat(80));

  for (const r of results) {
    if (r.status === 'error') {
      console.log(
        r.network.padEnd(maxNetLen + 2) +
        r.version.padEnd(maxVerLen + 2) +
        '\x1b[31mERROR: ' + r.error.substring(0, 40) + '\x1b[0m'
      );
      continue;
    }

    const errorFlag = r.hasErrors ? '\x1b[31mERRORS\x1b[0m' : '\x1b[32mOK\x1b[0m';
    const pendingFlag = r.pendingMechData > 0 ? `\x1b[33m${r.pendingMechData}\x1b[0m` : '0';

    console.log(
      r.network.padEnd(maxNetLen + 2) +
      r.version.padEnd(maxVerLen + 2) +
      r.block.toLocaleString().padStart(12) +
      r.mechs.toString().padStart(7) +
      pendingFlag.padStart(r.pendingMechData > 0 ? 17 : 9) +
      '  ' + errorFlag
    );
  }

  console.log('-'.repeat(80));

  // Summary
  const withErrors = results.filter(r => r.hasErrors);
  const withPending = results.filter(r => r.pendingMechData > 0);

  if (withErrors.length > 0) {
    console.log(`\n\x1b[31mSubgraphs with indexing errors: ${withErrors.map(r => r.network).join(', ')}\x1b[0m`);
  }
  if (withPending.length > 0) {
    console.log(`\n\x1b[33mSubgraphs with pending mech data: ${withPending.map(r => `${r.network}(${r.pendingMechData})`).join(', ')}\x1b[0m`);
  }
  if (withErrors.length === 0 && withPending.length === 0) {
    console.log('\n\x1b[32mAll subgraphs healthy\x1b[0m');
  }
}

async function runCheck(networks, version) {
  const results = await Promise.all(
    networks.map(network => checkNetwork(network, version || DEFAULT_VERSIONS[network]))
  );
  printResults(results);
  return results;
}

async function main() {
  const { network, version, watch } = parseCliArgs();
  const networks = network ? [network] : NETWORKS;

  if (watch) {
    console.log('Watching sync progress (Ctrl+C to stop)...');
    while (true) {
      await runCheck(networks, version);
      await new Promise(resolve => setTimeout(resolve, 30000));
    }
  } else {
    await runCheck(networks, version);
  }
}

main().catch(err => {
  console.error('\x1b[31mError:\x1b[0m', err.message);
  process.exit(1);
});
