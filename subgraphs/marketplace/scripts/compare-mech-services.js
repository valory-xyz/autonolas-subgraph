#!/usr/bin/env node
/**
 * Compare Mech and Service metrics between two subgraph versions
 *
 * Usage: node compare-mech-services.js [--old <url>] [--new <url>] [--limit <n>]
 */

const chalk = require('chalk');

const DEFAULTS = {
  old: 'https://subgraph.staging.autonolas.tech/subgraphs/name/marketplace-base-v2_0_1',
  new: 'https://subgraph.staging.autonolas.tech/subgraphs/name/marketplace-base-v5_2_0',
  limit: 100,
};

function parseArgs() {
  const args = process.argv.slice(2);
  const get = flag => {
    const idx = args.indexOf(flag);
    return idx !== -1 ? args[idx + 1] : null;
  };

  return {
    oldUrl: get('--old') || DEFAULTS.old,
    newUrl: get('--new') || DEFAULTS.new,
    limit: parseInt(get('--limit') || DEFAULTS.limit, 10),
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

async function fetchMechs(url, limit, includeNewFields = true) {
  // Core fields available in both v2.0.1 and v5.2.0
  const coreFields = `
    id
    address
    karma
    maxDeliveryRate
    receivedRequests
    selfDeliveredFromReceived
    deliveredByOthersFromReceived
    totalDeliveriesTransactions
  `;
  // v5.2.0+ fields
  const newFields = includeNewFields ? `maxDeliveryRateUSD paymentType service { id }` : '';

  const query = `{
    meches(first: ${limit}, orderBy: receivedRequests, orderDirection: desc) {
      ${coreFields}
      ${newFields}
    }
  }`;

  try {
    const data = await querySubgraph(url, query);
    return data.meches || [];
  } catch (err) {
    // Retry without new fields if schema doesn't support them
    if (includeNewFields && err.message.includes('has no field')) {
      return fetchMechs(url, limit, false);
    }
    throw err;
  }
}

async function fetchServices(url, limit) {
  const query = `{
    services(first: ${limit}, orderBy: totalRequests, orderDirection: desc) {
      id
      serviceId
      totalRequests
      totalDeliveries
      latestMultisig
    }
  }`;
  const data = await querySubgraph(url, query);
  return data.services || [];
}

async function fetchMeta(url) {
  const query = `{ _meta { block { number } hasIndexingErrors } }`;
  const data = await querySubgraph(url, query);
  return data._meta;
}

function compareMechs(oldMechs, newMechs) {
  const oldMap = new Map(oldMechs.map(m => [m.address, m]));
  const newMap = new Map(newMechs.map(m => [m.address, m]));
  const allAddresses = new Set([...oldMap.keys(), ...newMap.keys()]);

  const results = [];
  allAddresses.forEach(addr => {
    const old = oldMap.get(addr);
    const nw = newMap.get(addr);
    const fields = ['karma', 'maxDeliveryRate', 'receivedRequests', 'totalDeliveriesTransactions', 'selfDeliveredFromReceived', 'deliveredByOthersFromReceived'];
    const diffs = [];

    if (!old) {
      results.push({ address: addr, status: 'NEW', diffs: [] });
      return;
    }
    if (!nw) {
      results.push({ address: addr, status: 'REMOVED', diffs: [] });
      return;
    }

    fields.forEach(f => {
      const oldVal = (old[f] || '0').toString();
      const newVal = (nw[f] || '0').toString();
      if (oldVal !== newVal) {
        diffs.push({ field: f, oldVal, newVal });
      }
    });

    results.push({ address: addr, status: diffs.length ? 'DIFF' : 'MATCH', diffs });
  });

  return results;
}

function compareServices(oldServices, newServices) {
  const oldMap = new Map(oldServices.map(s => [s.id, s]));
  const newMap = new Map(newServices.map(s => [s.id, s]));
  const allIds = new Set([...oldMap.keys(), ...newMap.keys()]);

  const results = [];
  allIds.forEach(id => {
    const old = oldMap.get(id);
    const nw = newMap.get(id);
    const fields = ['totalRequests', 'totalDeliveries'];
    const diffs = [];

    if (!old) {
      results.push({ id, status: 'NEW', diffs: [] });
      return;
    }
    if (!nw) {
      results.push({ id, status: 'REMOVED', diffs: [] });
      return;
    }

    fields.forEach(f => {
      const oldVal = (old[f] || '0').toString();
      const newVal = (nw[f] || '0').toString();
      if (oldVal !== newVal) {
        diffs.push({ field: f, oldVal, newVal });
      }
    });

    results.push({ id, status: diffs.length ? 'DIFF' : 'MATCH', diffs });
  });

  return results;
}

function printMechResults(results) {
  console.log(chalk.cyan('\n=== Mech Comparison ===\n'));

  const byStatus = { MATCH: [], DIFF: [], NEW: [], REMOVED: [] };
  results.forEach(r => byStatus[r.status].push(r));

  console.log(chalk.green(`MATCH: ${byStatus.MATCH.length}`));
  console.log(chalk.yellow(`DIFF:  ${byStatus.DIFF.length}`));
  console.log(chalk.blue(`NEW:   ${byStatus.NEW.length}`));
  console.log(chalk.red(`REMOVED: ${byStatus.REMOVED.length}`));

  if (byStatus.DIFF.length > 0) {
    console.log(chalk.yellow('\nMechs with differences:'));
    byStatus.DIFF.slice(0, 10).forEach(({ address, diffs }) => {
      console.log(`  ${address}`);
      diffs.forEach(({ field, oldVal, newVal }) => {
        console.log(chalk.gray(`    ${field}: ${oldVal} -> ${newVal}`));
      });
    });
    if (byStatus.DIFF.length > 10) {
      console.log(chalk.gray(`  ... and ${byStatus.DIFF.length - 10} more`));
    }
  }

  if (byStatus.NEW.length > 0) {
    console.log(chalk.blue('\nNew mechs:'));
    byStatus.NEW.slice(0, 5).forEach(({ address }) => console.log(`  ${address}`));
    if (byStatus.NEW.length > 5) {
      console.log(chalk.gray(`  ... and ${byStatus.NEW.length - 5} more`));
    }
  }
}

function printServiceResults(results) {
  console.log(chalk.cyan('\n=== Service Comparison ===\n'));

  const byStatus = { MATCH: [], DIFF: [], NEW: [], REMOVED: [] };
  results.forEach(r => byStatus[r.status].push(r));

  console.log(chalk.green(`MATCH: ${byStatus.MATCH.length}`));
  console.log(chalk.yellow(`DIFF:  ${byStatus.DIFF.length}`));
  console.log(chalk.blue(`NEW:   ${byStatus.NEW.length}`));
  console.log(chalk.red(`REMOVED: ${byStatus.REMOVED.length}`));

  if (byStatus.DIFF.length > 0) {
    console.log(chalk.yellow('\nServices with differences:'));
    byStatus.DIFF.slice(0, 10).forEach(({ id, diffs }) => {
      console.log(`  Service ${id}`);
      diffs.forEach(({ field, oldVal, newVal }) => {
        console.log(chalk.gray(`    ${field}: ${oldVal} -> ${newVal}`));
      });
    });
    if (byStatus.DIFF.length > 10) {
      console.log(chalk.gray(`  ... and ${byStatus.DIFF.length - 10} more`));
    }
  }
}

async function main() {
  const { oldUrl, newUrl, limit } = parseArgs();

  console.log(chalk.cyan('Comparing Mechs and Services'));
  console.log(`Old: ${oldUrl}`);
  console.log(`New: ${newUrl}`);
  console.log(`Limit: ${limit}`);

  const [oldMeta, newMeta] = await Promise.all([
    fetchMeta(oldUrl).catch(() => null),
    fetchMeta(newUrl).catch(() => null),
  ]);

  console.log(chalk.cyan('\n=== Sync Status ==='));
  console.log(`Old: Block ${oldMeta?.block?.number || 'N/A'}, Errors: ${oldMeta?.hasIndexingErrors || 'N/A'}`);
  console.log(`New: Block ${newMeta?.block?.number || 'N/A'}, Errors: ${newMeta?.hasIndexingErrors || 'N/A'}`);

  const [oldMechs, newMechs, oldServices, newServices] = await Promise.all([
    fetchMechs(oldUrl, limit),
    fetchMechs(newUrl, limit),
    fetchServices(oldUrl, limit),
    fetchServices(newUrl, limit),
  ]);

  const mechResults = compareMechs(oldMechs, newMechs);
  const serviceResults = compareServices(oldServices, newServices);

  printMechResults(mechResults);
  printServiceResults(serviceResults);

  console.log(chalk.cyan('\n=== Summary ==='));
  const mechDiffs = mechResults.filter(r => r.status !== 'MATCH').length;
  const serviceDiffs = serviceResults.filter(r => r.status !== 'MATCH').length;

  if (mechDiffs === 0 && serviceDiffs === 0) {
    console.log(chalk.green('All entities match between versions'));
  } else {
    console.log(chalk.yellow(`Deviations: ${mechDiffs} mechs, ${serviceDiffs} services`));
    console.log(chalk.gray('(Differences may be expected if block numbers differ)'));
  }
}

main().catch(err => {
  console.error(chalk.red('Error:'), err.message);
  process.exit(1);
});
