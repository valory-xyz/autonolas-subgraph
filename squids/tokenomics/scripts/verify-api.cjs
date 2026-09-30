// Start an ephemeral API against the configured migrated database and query it.
require("dotenv/config");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const { realpathSync } = require("node:fs");
const port = process.env.VERIFY_GQL_PORT || "4355";
const child = spawn(
  process.execPath,
  [realpathSync("node_modules/.bin/squid-graphql-server")],
  {
    env: { ...process.env, GQL_PORT: port },
    stdio: ["ignore", "pipe", "pipe"],
  },
);
let output = "";
child.stdout.on("data", (d) => {
  output += d;
});
child.stderr.on("data", (d) => {
  output += d;
});
const exited = once(child, "exit");
async function main() {
  try {
    let result;
    for (let attempt = 0; attempt < 60; attempt++) {
      if (child.exitCode !== null) throw new Error(output);
      try {
        const res = await fetch(`http://localhost:${port}/graphql`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            query:
              "{ tokens { id balance holderCount } tokenHolders(limit: 5, orderBy: balance_DESC) { id token balance } transfers(limit: 1, orderBy: blockNumber_ASC) { id from to value blockNumber } }",
          }),
        });
        result = await res.json();
        break;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    }
    assert.ok(result, "GraphQL API did not become ready");
    assert.equal(result.errors, undefined, JSON.stringify(result.errors));
    assert.ok(Array.isArray(result.data.tokens));
    console.log(
      "PASS: generated GraphQL API serves tokenomics schema",
      JSON.stringify(result.data),
    );
  } finally {
    child.kill("SIGTERM");
    await exited;
  }
}
main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
