#!/usr/bin/env node
/**
 * Compare Global metrics between two subgraph versions
 *
 * Usage: node compare-global-metrics.js [--old <url>] [--new <url>]
 *
 * Defaults:
 *   old: marketplace-base-v2_0_1 (existing staging)
 *   new: marketplace-base-v5_2_0 (latest with polygon/optimism changes)
 */

const chalk = require('chalk');

const DEFAULTS = {
  old: 'https://subgraph.staging.autonolas.tech/subgraphs/name/marketplace-base-v2_0_1',
  new: 'https://subgraph.staging.autonolas.tech/subgraphs/name/marketplace-base-v5_2_0',
};

function parseArgs() {
  const args = process.argv.slice(2);
  const oldIdx = args.indexOf('--old');
  const newIdx = args.indexOf('--new');

  return {
    oldUrl: oldIdx !== -1 ? args[oldIdx + 1] : DEFAULTS.old,
    newUrl: newIdx !== -1 ? args[newIdx + 1] : DEFAULTS.new,
  };
}

async function querySubgraph(url, query) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const data = await res.json();
  if (data.errors) throw new Error(JSON.stringify(data.errors));
  return data.data;
}

async function fetchGlobal(url, includeFees = true) {
  // Core fields available in all versions
  const coreFields = `
    id
    totalMechs
    totalMarketplaceRequests
    totalMarketplaceDeliveries
    totalMarketplaceDeliveriesWithSignatures
    totalLegacyRequests
    totalLegacyDeliveries
    totalLegacyTransactions
    totalLegacyAtaTransactions
    totalRequests
    totalDeliveries
    totalTransactions
    totalAtaTransactions
  `;
  const feeFields = includeFees ? 'totalFeesPaidUSD' : '';

  const query = `{ globals(first: 1) { ${coreFields} ${feeFields} } }`;

  try {
    const data = await querySubgraph(url, query);
    return data.globals?.[0] || null;
  } catch (err) {
    // Retry without fee fields if schema doesn't support them
    if (includeFees && err.message.includes('has no field')) {
      return fetchGlobal(url, false);
    }
    throw err;
  }
}

async function fetchMeta(url) {
  const query = `{
    _meta {
      block { number }
      hasIndexingErrors
    }
  }`;
  const data = await querySubgraph(url, query);
  return data._meta;
}

function compareFields(oldData, newData) {
  const fields = [
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

  return fields.map(field => {
    const oldRaw = oldData?.[field];
    const newRaw = newData?.[field];
    // Format USD fields with $ prefix and fixed decimals
    const isUSD = field.includes('USD');
    const oldVal = oldRaw == null ? (isUSD ? '$0.00' : '0') : (isUSD ? `$${parseFloat(oldRaw).toFixed(2)}` : oldRaw);
    const newVal = newRaw == null ? (isUSD ? '$0.00' : '0') : (isUSD ? `$${parseFloat(newRaw).toFixed(2)}` : newRaw);
    const diff = parseFloat(newRaw || 0) - parseFloat(oldRaw || 0);
    const diffStr = isUSD ? `$${diff.toFixed(2)}` : diff.toString();
    const pctChange = parseFloat(oldRaw || 0) !== 0 ? ((diff / parseFloat(oldRaw)) * 100).toFixed(2) : 'N/A';
    const match = oldRaw === newRaw || (oldRaw == null && newRaw == null);
    return { field, oldVal, newVal, diff: diffStr, pctChange, match, isNewField: oldRaw == null && newRaw != null };
  });
}

function printResults(comparisons, oldMeta, newMeta, oldUrl, newUrl) {
  console.log(chalk.cyan('\n=== Subgraph Sync Status ==='));
  console.log(`Old (v2.0.1): Block ${oldMeta?.block?.number || 'N/A'}, Errors: ${oldMeta?.hasIndexingErrors || 'N/A'}`);
  console.log(`New (v5.2.0): Block ${newMeta?.block?.number || 'N/A'}, Errors: ${newMeta?.hasIndexingErrors || 'N/A'}`);

  console.log(chalk.cyan('\n=== Global Metrics Comparison ==='));
  console.log(`Old: ${oldUrl}`);
  console.log(`New: ${newUrl}\n`);

  console.log(chalk.gray('Field'.padEnd(45) + 'Old'.padStart(15) + 'New'.padStart(15) + 'Diff'.padStart(15) + '%'.padStart(10)));
  console.log(chalk.gray('-'.repeat(100)));

  let hasDeviations = false;
  let newFieldsCount = 0;
  comparisons.forEach(({ field, oldVal, newVal, diff, pctChange, match, isNewField }) => {
    let color = match ? chalk.green : chalk.yellow;
    if (isNewField) {
      color = chalk.blue;
      newFieldsCount++;
    }
    const diffStr = typeof diff === 'string' ? diff : (diff > 0 ? `+${diff}` : diff.toString());
    console.log(color(
      field.padEnd(45) +
      oldVal.toString().padStart(15) +
      newVal.toString().padStart(15) +
      diffStr.padStart(15) +
      (pctChange !== 'N/A' ? `${pctChange}%` : pctChange).padStart(10)
    ));
    if (!match && !isNewField) hasDeviations = true;
  });

  console.log(chalk.gray('-'.repeat(100)));
  if (newFieldsCount > 0) {
    console.log(chalk.blue(`${newFieldsCount} new field(s) in v5.2.0 (shown in blue)`));
  }
  if (hasDeviations) {
    console.log(chalk.yellow('Deviations detected in existing fields'));
  } else {
    console.log(chalk.green('All existing metrics match'));
  }
}

async function main() {
  const { oldUrl, newUrl } = parseArgs();

  console.log(chalk.cyan('Comparing Global Metrics'));
  console.log(`Old: ${oldUrl}`);
  console.log(`New: ${newUrl}`);

  const [oldGlobal, newGlobal, oldMeta, newMeta] = await Promise.all([
    fetchGlobal(oldUrl).catch(() => null),
    fetchGlobal(newUrl).catch(() => null),
    fetchMeta(oldUrl).catch(() => null),
    fetchMeta(newUrl).catch(() => null),
  ]);

  if (!oldGlobal && !newGlobal) {
    console.error(chalk.red('Both subgraphs returned no Global entity'));
    process.exit(1);
  }

  const comparisons = compareFields(oldGlobal, newGlobal);
  printResults(comparisons, oldMeta, newMeta, oldUrl, newUrl);
}

main().catch(err => {
  console.error(chalk.red('Error:'), err.message);
  process.exit(1);
});
