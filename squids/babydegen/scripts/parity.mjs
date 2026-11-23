#!/usr/bin/env node
// Parity check (BDMARK-2334 AC1): every AgentPortfolio, AgentPortfolioSnapshot
// and DailyPopulationMetric row of this squid against the babydegen-base
// subgraph at one pinned block, field by field, as exact strings.
//
// The squid has no time travel, so it must stop exactly at the pinned block:
// run the processor with BABYDEGEN_TO_BLOCK=<block> until it reaches it, start
// the GraphQL server, then:
//
//   node scripts/parity.mjs --subgraph <url> --block <n> [--squid http://localhost:4350/graphql]
//                           [--entity AgentPortfolio] [--max-diffs 20]
//
// The subgraph is read with `block: { number }`; its deployment must have
// indexed past the block (and be the version under test: studio #174 + #175
// + #182, i.e. olas-babydegen-base v0.0.6 or later).
//
// Exit status: 0 every entity matches, 1 a difference, 2 no difference but
// an entity with no rows on either side (an empty match verifies nothing),
// 3 a setup error (heights, endpoints).
// No dependencies; Node 18+ (global fetch).

const ENTITIES = {
  AgentPortfolio: {
    list: "agentPortfolios",
    fields: [
      "service { id }",
      "finalValue", "finalValueWithoutRewards", "initialValue", "positionsValue", "uninvestedValue", "totalWithdrawnUsd",
      "unrealisedPnL", "roi", "apr", "projectedUnrealisedPnL", "unrealisedPnLWithRewards", "projectedUnrealisedPnLWithRewards",
      "ethAdjustedRoi", "ethAdjustedApr", "ethAdjustedUnrealisedPnL", "ethAdjustedProjectedUnrealisedPnL",
      "firstFundingEthPrice", "currentEthPrice", "totalInvestments", "totalGrossGains", "totalCosts",
      "firstTradingTimestamp", "lastUpdated", "lastSnapshotTimestamp", "lastSnapshotBlock", "totalPositions", "totalClosedPositions",
    ],
  },
  AgentPortfolioSnapshot: {
    list: "agentPortfolioSnapshots",
    fields: [
      "service { id }", "portfolio { id }",
      "finalValue", "initialValue", "positionsValue", "uninvestedValue", "totalWithdrawnUsd",
      "roi", "apr", "unrealisedPnL", "projectedUnrealisedPnL",
      "ethAdjustedRoi", "ethAdjustedApr", "ethAdjustedUnrealisedPnL", "ethAdjustedProjectedUnrealisedPnL",
      "timestamp", "block", "totalPositions", "totalClosedPositions",
    ],
  },
  DailyPopulationMetric: {
    list: "dailyPopulationMetrics",
    fields: [
      "medianPopulationROI", "medianPopulationAPR", "medianUnrealisedPnL", "medianProjectedUnrealisedPnL",
      "medianUnrealisedPnLWithRewards", "medianProjectedUnrealisedPnLWithRewards",
      "medianEthAdjustedROI", "medianEthAdjustedAPR", "medianEthAdjustedUnrealisedPnL", "medianEthAdjustedProjectedUnrealisedPnL",
      "medianLifetimeActiveUnrealisedPnL", "medianLifetimeActiveProjectedUnrealisedPnL",
      "medianLifetimeActiveEthAdjustedUnrealisedPnL", "medianLifetimeActiveEthAdjustedProjectedUnrealisedPnL",
      "medianLifetimeActiveAUM", "totalLifetimeActiveFundedAUM", "totalLifetimeActiveAgents",
      "totalFundedAUM", "medianAUM", "averageAgentDaysActive",
      "sma7dROI", "sma7dAPR", "sma7dUnrealisedPnL", "sma7dProjectedUnrealisedPnL",
      "sma7dUnrealisedPnLWithRewards", "sma7dProjectedUnrealisedPnLWithRewards", "sma7dAUM",
      "sma7dEthAdjustedROI", "sma7dEthAdjustedAPR", "sma7dEthAdjustedUnrealisedPnL", "sma7dEthAdjustedProjectedUnrealisedPnL",
      "sma7dLifetimeActiveUnrealisedPnL", "sma7dLifetimeActiveProjectedUnrealisedPnL",
      "sma7dLifetimeActiveEthAdjustedUnrealisedPnL", "sma7dLifetimeActiveEthAdjustedProjectedUnrealisedPnL", "sma7dLifetimeActiveAUM",
      "timestamp", "block", "totalAgents",
      "historicalMedianROI", "historicalMedianAPR", "historicalMedianUnrealisedPnL", "historicalMedianProjectedUnrealisedPnL",
      "historicalMedianAUM", "historicalMedianEthAdjustedROI", "historicalMedianEthAdjustedAPR",
      "historicalMedianEthAdjustedUnrealisedPnL", "historicalMedianEthAdjustedProjectedUnrealisedPnL",
      "historicalMedianLifetimeActiveUnrealisedPnL", "historicalMedianLifetimeActiveProjectedUnrealisedPnL",
      "historicalMedianLifetimeActiveEthAdjustedUnrealisedPnL", "historicalMedianLifetimeActiveEthAdjustedProjectedUnrealisedPnL",
      "historicalMedianLifetimeActiveAUM",
    ],
  },
};

const PAGE = 1000;

/** A field value as one comparable string: scalars as served, a relation by its id, lists as JSON. */
export function canon(value) {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) return JSON.stringify(value.map((v) => (v === null ? null : String(v))));
  if (typeof value === "object") return "id:" + String(value.id);
  return String(value);
}

/** Row-by-row, field-by-field diff of two id → row maps. */
export function compareRows(subgraph, squid, fields) {
  const names = fields.map((f) => f.split(" ")[0]);
  const onlySubgraph = [...subgraph.keys()].filter((id) => !squid.has(id)).sort();
  const onlySquid = [...squid.keys()].filter((id) => !subgraph.has(id)).sort();
  const diffs = [];
  for (const [id, a] of subgraph) {
    const b = squid.get(id);
    if (b == null) continue;
    for (const f of names) {
      const x = canon(a[f]);
      const y = canon(b[f]);
      if (x !== y) diffs.push({ id, field: f, subgraph: x, squid: y });
    }
  }
  diffs.sort((p, q) => (p.id === q.id ? p.field.localeCompare(q.field) : p.id < q.id ? -1 : 1));
  return { onlySubgraph, onlySquid, diffs, compared: [...subgraph.keys()].filter((id) => squid.has(id)).length };
}

async function gql(url, query, variables) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const body = await res.json();
  if (body.errors) throw new Error(`${url}: ${JSON.stringify(body.errors).slice(0, 500)}`);
  return body.data;
}

export async function subgraphRows(url, entity, block) {
  const { list, fields } = ENTITIES[entity];
  const rows = new Map();
  let last = "";
  for (;;) {
    const q = `query($last: String!) { ${list}(first: ${PAGE}, orderBy: id, orderDirection: asc, where: { id_gt: $last }, block: { number: ${block} }) { id ${fields.join(" ")} } }`;
    const page = (await gql(url, q, { last }))[list];
    for (const r of page) rows.set(r.id, r);
    if (page.length < PAGE) return rows;
    last = page[page.length - 1].id;
  }
}

export async function squidRows(url, entity) {
  const { list, fields } = ENTITIES[entity];
  const rows = new Map();
  for (let offset = 0; ; offset += PAGE) {
    const q = `{ ${list}(limit: ${PAGE}, offset: ${offset}, orderBy: id_ASC) { id ${fields.join(" ")} } }`;
    const page = (await gql(url, q))[list];
    for (const r of page) rows.set(r.id, r);
    if (page.length < PAGE) return rows;
  }
}

function parseArgs(argv) {
  const out = { squid: "http://localhost:4350/graphql", maxDiffs: 20, entities: Object.keys(ENTITIES) };
  for (let i = 0; i < argv.length; i++) {
    const [k, v] = [argv[i], argv[i + 1]];
    if (k === "--subgraph") out.subgraph = v;
    else if (k === "--squid") out.squid = v;
    else if (k === "--block") out.block = Number(v);
    else if (k === "--max-diffs") out.maxDiffs = Number(v);
    else if (k === "--entity") out.entities = v.split(",");
    else continue;
    i++;
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.subgraph || !Number.isSafeInteger(args.block)) {
    console.error("usage: node scripts/parity.mjs --subgraph <url> --block <n> [--squid <url>] [--entity A,B] [--max-diffs n]");
    return 3;
  }
  for (const e of args.entities) {
    if (!ENTITIES[e]) {
      console.error(`unknown entity ${e}; one of ${Object.keys(ENTITIES).join(", ")}`);
      return 3;
    }
  }
  const squidHeight = (await gql(args.squid, "{ squidStatus { height } }")).squidStatus.height;
  if (squidHeight !== args.block) {
    console.error(`squid is at block ${squidHeight}, not ${args.block}: run the processor with BABYDEGEN_TO_BLOCK=${args.block} until it gets there`);
    return 3;
  }
  const meta = (await gql(args.subgraph, "{ _meta { block { number } deployment hasIndexingErrors } }"))._meta;
  if (meta.block.number < args.block) {
    console.error(`subgraph is at block ${meta.block.number}, behind ${args.block}`);
    return 3;
  }
  console.log(`block ${args.block} · subgraph ${meta.deployment}${meta.hasIndexingErrors ? " (HAS INDEXING ERRORS)" : ""} · squid ${args.squid}`);

  let status = 0;
  for (const entity of args.entities) {
    const [a, b] = await Promise.all([subgraphRows(args.subgraph, entity, args.block), squidRows(args.squid, entity)]);
    const r = compareRows(a, b, ENTITIES[entity].fields);
    const bad = r.onlySubgraph.length + r.onlySquid.length + r.diffs.length;
    const tag = bad > 0 ? "DIFF" : a.size === 0 && b.size === 0 ? "EMPTY" : "OK";
    console.log(`[${tag}] ${entity}: subgraph ${a.size}, squid ${b.size}, compared ${r.compared}, field diffs ${r.diffs.length}, only in subgraph ${r.onlySubgraph.length}, only in squid ${r.onlySquid.length}`);
    for (const id of r.onlySubgraph.slice(0, args.maxDiffs)) console.log(`  only in subgraph: ${id}`);
    for (const id of r.onlySquid.slice(0, args.maxDiffs)) console.log(`  only in squid:    ${id}`);
    for (const d of r.diffs.slice(0, args.maxDiffs)) console.log(`  ${d.id} ${d.field}: subgraph ${d.subgraph} | squid ${d.squid}`);
    if (r.diffs.length > args.maxDiffs) console.log(`  … ${r.diffs.length - args.maxDiffs} more field diffs`);
    if (tag === "DIFF") status = 1;
    else if (tag === "EMPTY" && status === 0) status = 2;
  }
  return status;
}

// Run as a script, not when a test imports compareRows.
if (process.argv[1]?.endsWith("parity.mjs")) {
  main().then(
    (code) => process.exit(code),
    (err) => {
      console.error(err.message ?? err);
      process.exit(3);
    },
  );
}
