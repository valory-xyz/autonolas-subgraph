#!/usr/bin/env node
/**
 * Compare Global entity metrics between two subgraph versions.
 * Validates that refactoring preserves data integrity.
 *
 * Usage:
 *   node compare-global-metrics.js --network base --v1 v5_2_0 --v2 v6_0_0
 *   node compare-global-metrics.js --network polygon --v1 v5_2_0 --v2 v6_0_0
 */

const STAGING_URL = 'https://subgraph.staging.autonolas.tech/subgraphs/name';

const GLOBAL_FIELDS = [
  'totalMechs',
  'totalMarketplaceRequests',
  'totalMarketplaceDeliveries',
  'totalMarketplaceDeliveriesWithSignatures',
  'totalLegacyRequests',
  'totalLegacyDeliveries',
  'totalLegacyTransactions',
  'totalLegacyAtaTransactions',
  'totalRequests',
  'totalDeliveries',
  'totalTransactions',
  'totalAtaTransactions',
  'totalFeesPaidUSD',
];

function parseArgs() {
  const args = process.argv.slice(2);
  const result = { network: null, v1: null, v2: null };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--network' && args[i + 1]) {
      result.network = args[++i];
    } else if (args[i] === '--v1' && args[i + 1]) {
      result.v1 = args[++i];
    } else if (args[i] === '--v2' && args[i + 1]) {
      result.v2 = args[++i];
    }
  }

  return result;
}

async function fetchGlobalMetrics(subgraphUrl) {
  const query = `{
    globals {
      id
      ${GLOBAL_FIELDS.join('\n      ')}
    }
    _meta {
      block { number }
      hasIndexingErrors
    }
  }`;

  const res = await fetch(subgraphUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });

  const data = await res.json();
  if (data.errors) {
    throw new Error(JSON.stringify(data.errors));
  }

  return {
    global: data.data.globals[0] || null,
    meta: data.data._meta,
  };
}

function formatNumber(value) {
  if (value === null || value === undefined) return 'N/A';
  const num = parseFloat(value);
  if (isNaN(num)) return value;
  if (Number.isInteger(num)) {
    return num.toLocaleString();
  }
  return num.toFixed(2);
}

async function main() {
  const { network, v1, v2 } = parseArgs();

  if (!network || !v1 || !v2) {
    console.error('Usage: node compare-global-metrics.js --network <network> --v1 <version1> --v2 <version2>');
    console.error('Example: node compare-global-metrics.js --network base --v1 v5_2_0 --v2 v6_0_0');
    process.exit(1);
  }

  const url1 = `${STAGING_URL}/marketplace-${network}-${v1}`;
  const url2 = `${STAGING_URL}/marketplace-${network}-${v2}`;

  console.log(`\n=== Global Metrics Comparison: ${network} ===\n`);
  console.log(`V1: ${v1} (${url1})`);
  console.log(`V2: ${v2} (${url2})\n`);

  let data1, data2;

  try {
    console.log('Fetching metrics...\n');
    [data1, data2] = await Promise.all([
      fetchGlobalMetrics(url1),
      fetchGlobalMetrics(url2),
    ]);
  } catch (err) {
    console.error('Error fetching data:', err.message);
    process.exit(1);
  }

  // Display sync status
  console.log('--- Sync Status ---');
  console.log(`${v1}: Block ${data1.meta.block.number.toLocaleString()}, Errors: ${data1.meta.hasIndexingErrors}`);
  console.log(`${v2}: Block ${data2.meta.block.number.toLocaleString()}, Errors: ${data2.meta.hasIndexingErrors}`);

  const blockDiff = data2.meta.block.number - data1.meta.block.number;
  if (Math.abs(blockDiff) > 100) {
    console.log(`\n⚠️  Warning: Block difference is ${blockDiff}. Results may differ due to sync lag.\n`);
  } else {
    console.log(`Block difference: ${blockDiff}\n`);
  }

  if (!data1.global || !data2.global) {
    console.error('Error: Global entity not found in one or both subgraphs');
    process.exit(1);
  }

  // Compare metrics
  console.log('--- Metrics Comparison ---\n');

  const colWidth = { metric: 40, v1: 15, v2: 15, status: 8 };
  const header = [
    'Metric'.padEnd(colWidth.metric),
    v1.padStart(colWidth.v1),
    v2.padStart(colWidth.v2),
    'Status'.padStart(colWidth.status),
  ].join(' | ');

  console.log(header);
  console.log('-'.repeat(header.length));

  let matchCount = 0;
  let diffCount = 0;
  const diffs = [];

  for (const field of GLOBAL_FIELDS) {
    const val1 = data1.global[field];
    const val2 = data2.global[field];

    const formatted1 = formatNumber(val1);
    const formatted2 = formatNumber(val2);

    // Compare as strings to handle BigInt and decimals
    const match = val1 === val2;

    if (match) {
      matchCount++;
    } else {
      diffCount++;
      diffs.push({ field, val1, val2 });
    }

    const status = match ? '✅' : '❌';
    const row = [
      field.padEnd(colWidth.metric),
      formatted1.padStart(colWidth.v1),
      formatted2.padStart(colWidth.v2),
      status.padStart(colWidth.status),
    ].join(' | ');

    console.log(row);
  }

  // Summary
  console.log('\n--- Summary ---');
  console.log(`Total fields: ${GLOBAL_FIELDS.length}`);
  console.log(`Matching: ${matchCount}`);
  console.log(`Different: ${diffCount}`);

  if (diffCount === 0) {
    console.log('\n✅ All global metrics match exactly!');
  } else {
    console.log('\n❌ Differences found:');
    for (const { field, val1, val2 } of diffs) {
      console.log(`  - ${field}: ${val1} → ${val2}`);
    }
  }

  // Exit code based on match
  process.exit(diffCount > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
