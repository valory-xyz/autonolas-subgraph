#!/usr/bin/env node
/**
 * Verify v5.2.0 fee metrics and new fields
 *
 * Usage: node verify-v5-fees.js [--url <subgraph-url>]
 */

const chalk = require('chalk');

const DEFAULT_URL = 'https://subgraph.staging.autonolas.tech/subgraphs/name/marketplace-base-v5_2_0';

function parseArgs() {
  const args = process.argv.slice(2);
  const urlIdx = args.indexOf('--url');
  return { url: urlIdx !== -1 ? args[urlIdx + 1] : DEFAULT_URL };
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

async function main() {
  const { url } = parseArgs();
  console.log(chalk.cyan('=== v5.2.0 Fee Metrics Verification ===\n'));
  console.log(`URL: ${url}\n`);

  // Sync status
  const meta = await query(url, `{ _meta { block { number } hasIndexingErrors } }`);
  console.log(chalk.gray(`Block: ${meta._meta.block.number}, Indexing Errors: ${meta._meta.hasIndexingErrors}`));

  // Global fees
  const globalData = await query(url, `{
    globals(first: 1) {
      totalMechs
      totalMarketplaceRequests
      totalMarketplaceDeliveries
      totalRequests
      totalDeliveries
      totalFeesPaidUSD
    }
  }`);
  const g = globalData.globals[0];

  console.log(chalk.cyan('\n--- Global Metrics ---'));
  console.log(`Total Mechs:                 ${g.totalMechs}`);
  console.log(`Total Marketplace Requests:  ${g.totalMarketplaceRequests}`);
  console.log(`Total Marketplace Deliveries: ${g.totalMarketplaceDeliveries}`);
  console.log(`Total Requests (all):        ${g.totalRequests}`);
  console.log(`Total Deliveries (all):      ${g.totalDeliveries}`);
  console.log(chalk.green(`Total Fees Paid (USD):       $${parseFloat(g.totalFeesPaidUSD || 0).toFixed(4)}`));

  // Mech fees by payment type
  const mechData = await query(url, `{
    meches(first: 100, orderBy: receivedRequests, orderDirection: desc) {
      id
      address
      maxDeliveryRate
      maxDeliveryRateUSD
      receivedRequests
      totalDeliveriesTransactions
      paymentType
      karma
    }
  }`);

  console.log(chalk.cyan('\n--- Mech Fee Breakdown ---'));
  console.log(`Total Mechs: ${mechData.meches.length}\n`);

  // Group by payment type
  const byPaymentType = {};
  mechData.meches.forEach(m => {
    const pt = m.paymentType || 'unknown';
    if (!byPaymentType[pt]) byPaymentType[pt] = [];
    byPaymentType[pt].push(m);
  });

  Object.entries(byPaymentType).forEach(([pt, mechs]) => {
    console.log(chalk.yellow(`Payment Type: ${pt} (${mechs.length} mechs)`));
    mechs.slice(0, 3).forEach(m => {
      const rateUSD = m.maxDeliveryRateUSD ? `$${parseFloat(m.maxDeliveryRateUSD).toFixed(6)}` : 'N/A';
      console.log(`  ${m.address.slice(0, 10)}... rate=${m.maxDeliveryRate} (${rateUSD}) reqs=${m.receivedRequests} karma=${m.karma}`);
    });
    if (mechs.length > 3) console.log(chalk.gray(`  ... and ${mechs.length - 3} more`));
  });

  // Sample requests with fees
  const reqData = await query(url, `{
    requests(first: 10, orderBy: blockNumber, orderDirection: desc, where: { feeUSD_gt: "0" }) {
      id
      feeUSD
      finalFeeUSD
      feeRaw
      feeUnit
      isDelivered
      blockNumber
    }
  }`);

  console.log(chalk.cyan('\n--- Recent Requests with Fees ---'));
  if (reqData.requests.length === 0) {
    console.log(chalk.gray('No requests with fees found'));
  } else {
    reqData.requests.forEach(r => {
      const feeUSD = parseFloat(r.feeUSD || 0).toFixed(6);
      const finalFeeUSD = r.finalFeeUSD ? parseFloat(r.finalFeeUSD).toFixed(6) : 'pending';
      console.log(`  ${r.id.slice(0, 16)}... feeUSD=$${feeUSD} final=$${finalFeeUSD} unit=${r.feeUnit} delivered=${r.isDelivered}`);
    });
  }

  // Top senders by fees
  const senderData = await query(url, `{
    senders(first: 10, orderBy: totalFeesPaidUSD, orderDirection: desc, where: { totalFeesPaidUSD_gt: "0" }) {
      id
      totalMarketplaceRequests
      totalFeesPaidUSD
    }
  }`);

  console.log(chalk.cyan('\n--- Top Senders by Fees Paid ---'));
  if (senderData.senders.length === 0) {
    console.log(chalk.gray('No senders with fees found'));
  } else {
    senderData.senders.forEach((s, i) => {
      const fees = parseFloat(s.totalFeesPaidUSD).toFixed(4);
      console.log(`  ${i + 1}. ${s.id.slice(0, 12)}... $${fees} (${s.totalMarketplaceRequests} requests)`);
    });
  }

  // Services with activity
  const serviceData = await query(url, `{
    services(first: 10, orderBy: totalDeliveries, orderDirection: desc, where: { totalDeliveries_gt: "0" }) {
      id
      serviceId
      totalRequests
      totalDeliveries
    }
  }`);

  console.log(chalk.cyan('\n--- Top Services by Deliveries ---'));
  serviceData.services.forEach((s, i) => {
    console.log(`  ${i + 1}. Service ${s.serviceId}: ${s.totalDeliveries} deliveries, ${s.totalRequests} requests`);
  });

  console.log(chalk.green('\n=== Verification Complete ==='));
}

main().catch(err => {
  console.error(chalk.red('Error:'), err.message);
  process.exit(1);
});
