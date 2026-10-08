#!/usr/bin/env node
/**
 * Run `yarn audit --groups dependencies` and fail on high/critical
 * advisories in the production tree — unless the advisory is listed in
 * .supply-chain/audit-allowlist.json with a reason and review date.
 *
 * Necessary because the stock Yarn 1.x `yarn audit` has no suppression
 * mechanism. Without this, a single unfixable transitive advisory
 * (e.g. an abandoned upstream package with no patch, or one whose only
 * fix requires a major framework migration) blocks every PR.
 *
 * This repo audits per-package-json (root + 11 subgraphs) because of
 * heterogeneous graph-cli versions (0.64.0 → 0.98.x). The script is
 * invoked from each tree's directory; `yarn audit` runs in cwd, but the
 * allowlist is always resolved relative to the script's own location so
 * a single allowlist at the repo root governs all 12 paths.
 *
 * `--npm` mode: the squids under squids/ are npm trees. With `--npm` the
 * script runs `npm audit --omit=dev --json` in cwd instead and applies the
 * same allowlist, matched by the same numeric advisory id (npm's `source`).
 * `npm audit` has no suppression mechanism either.
 *
 * See SUPPLY-CHAIN-SECURITY.md §5.
 */

import { readFileSync, existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseAdvisories, parseNpmAdvisories, evaluateAdvisories } from './audit.lib.mjs';

// Allowlist is anchored to this script's location, NOT cwd, so the same
// file governs every matrix entry across root + subgraphs.
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ALLOWLIST_PATH = resolve(SCRIPT_DIR, '..', '.supply-chain/audit-allowlist.json');

function loadAllowlist() {
  if (!existsSync(ALLOWLIST_PATH)) return { entries: [] };
  let data;
  try {
    data = JSON.parse(readFileSync(ALLOWLIST_PATH, 'utf8'));
  } catch (err) {
    console.error(`::error::failed to parse ${ALLOWLIST_PATH}: ${err.message}`);
    process.exit(2);
  }
  for (const entry of data.entries || []) {
    const errors = [];
    if (typeof entry.id !== 'number') errors.push('`id` must be a number');
    if (typeof entry.reason !== 'string' || !entry.reason.trim()) errors.push('`reason` is required');
    if (typeof entry.added !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(entry.added)) {
      errors.push('`added` must be YYYY-MM-DD');
    }
    if (typeof entry.review !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(entry.review)) {
      errors.push('`review` must be YYYY-MM-DD');
    }
    if (errors.length) {
      console.error(`::error::malformed entry in ${ALLOWLIST_PATH}: ${errors.join('; ')} — ${JSON.stringify(entry)}`);
      process.exit(2);
    }
  }
  return data;
}

const NPM_MODE = process.argv.includes('--npm');
const TOOL = NPM_MODE ? 'npm audit' : 'yarn audit';

function runAudit() {
  return new Promise((resolvePromise) => {
    // `shell: true` is required on Windows so the `yarn.cmd` / `npm.cmd`
    // shim in PATH resolves; harmless on Linux/macOS runners where they
    // are plain executables.
    const [cmd, args] = NPM_MODE
      ? ['npm', ['audit', '--omit=dev', '--json']]
      : ['yarn', ['audit', '--groups', 'dependencies', '--json']];
    const child = spawn(cmd, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('close', (code) => resolvePromise({ stdout, stderr, code }));
  });
}

const allowlist = loadAllowlist();
const allowed = new Map();
for (const entry of allowlist.entries || []) {
  if (typeof entry.id !== 'number') continue;
  allowed.set(entry.id, entry);
}

const { stdout, stderr, code } = await runAudit();

// Yarn 1.x (and npm) exit non-zero even on success when advisories exist; we
// don't gate on exit code — we parse the JSON and apply our own gate.
if (!stdout) {
  console.error(`::error::\`${TOOL}\` produced no output.`);
  if (stderr) console.error(stderr);
  process.exit(2);
}

const { advisories, sawAuditRow, problem } = NPM_MODE ? parseNpmAdvisories(stdout) : parseAdvisories(stdout);

// A successful `yarn audit` always emits at least an `auditSummary` row;
// a successful `npm audit` always emits a report with `vulnerabilities`.
// If we got output but couldn't recognize any audit-shaped JSON, the
// stream was likely truncated by a registry / network failure — fail loudly
// rather than silently passing.
if (!sawAuditRow) {
  console.error(`::error::\`${TOOL}\` produced output but no recognizable advisory or summary rows.`);
  console.error('This typically indicates a registry outage or truncated stream.');
  if (problem) console.error(`Parser: ${problem}.`);
  if (stderr) console.error(stderr);
  process.exit(2);
}

const today = new Date().toISOString().slice(0, 10);
const { blocking, suppressed, expired } = evaluateAdvisories(advisories, allowed, today);

// `stale` (allowlist entry no longer suppressing anything) intentionally
// NOT computed here: in a per-subgraph matrix, a transitive advisory may
// only surface in some trees. Reporting drift per-tree would produce
// false positives. Drift detection is owned by the cross-tree review at
// allowlist-update time, not per-CI-run.

if (suppressed.length > 0) {
  console.log(`Allowlisted (${suppressed.length}):`);
  for (const { advisory, paths, entry } of suppressed) {
    console.log(`  [${advisory.severity}] ${advisory.module_name} ${advisory.vulnerable_versions}`);
    console.log(`    advisory ${advisory.id} (${advisory.github_advisory_id || 'no GHSA'})`);
    console.log(`    ${paths.size} path(s). reason: ${entry.reason}`);
    console.log(`    added ${entry.added}, review by ${entry.review}`);
  }
  console.log('');
}

for (const { advisory, entry } of expired) {
  console.log(
    `::warning::Allowlist entry for advisory ${advisory.id} (${advisory.module_name}) expired on ${entry.review}. Review and either update the review date with fresh justification, or remove if a fix is available.`,
  );
}

if (blocking.length > 0) {
  console.error('');
  console.error(`::error::${blocking.length} HIGH/CRITICAL advisory/advisories in the production tree are not allowlisted:`);
  for (const { advisory, paths } of blocking) {
    console.error(`  [${advisory.severity}] ${advisory.module_name} ${advisory.vulnerable_versions} → fix in ${advisory.patched_versions}`);
    console.error(`    advisory ${advisory.id} (${advisory.github_advisory_id || 'no GHSA'})`);
    console.error(`    ${advisory.title}`);
    console.error(`    ${paths.size} path(s), e.g. ${[...paths][0]}`);
    console.error(`    fix: bump the dep, add a Yarn resolution / npm override, or allowlist in .supply-chain/audit-allowlist.json with a reason + review date.`);
    console.error('');
  }
  process.exit(1);
}

console.log(`${TOOL}: OK (${suppressed.length} allowlisted, no unlisted high/critical).`);
process.exit(0);
