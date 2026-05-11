#!/usr/bin/env node
/**
 * Enumerate every package in node_modules that declares a non-trivial
 * preinstall / install / postinstall script, and diff the list against
 * a checked-in allowlist at .supply-chain/install-hooks.allowlist.
 *
 * New names in the tree but not in the allowlist = fail.
 *
 * Use `--update` to regenerate the allowlist from the current tree.
 * `--update` aggregates across the root tree + every `subgraphs/*` tree
 * that has a populated `node_modules`, so a single allowlist at the repo
 * root captures the union of hooks across all 11 trees. Run after any
 * dependency change:
 *   yarn install            (at root + any affected subgraph)
 *   node scripts/audit-install-hooks.mjs --update
 *   git add .supply-chain/install-hooks.allowlist
 *
 * The allowlist path is anchored to the script's own location so a
 * single allowlist at the repo root governs every node_modules tree
 * (root + per-subgraph). The script audits whatever node_modules
 * exists in the current working directory; CI runs it across all 11
 * paths in a matrix after `yarn install --frozen-lockfile
 * --ignore-scripts` per tree.
 *
 * Stale-entry detection (allowlist entry not present in current tree)
 * is intentionally NOT enforced — in a per-tree matrix, a hook-bearing
 * package may only surface in some trees. Drift cleanup happens at
 * `--update` time, not per-CI-run.
 *
 * See SUPPLY-CHAIN-SECURITY.md §7.
 */

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Allowlist resolves relative to the script location, NOT cwd.
// Single allowlist at repo root governs all callers.
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ALLOWLIST_PATH = resolve(SCRIPT_DIR, '..', '.supply-chain/install-hooks.allowlist');

// node_modules audit target IS cwd-relative — every caller audits
// their own tree. Only `--update` is taken from CLI, never as a path.
const ROOT = resolve('.');
const NODE_MODULES = resolve(ROOT, 'node_modules');
const UPDATE = process.argv.includes('--update');

const HOOK_KEYS = ['preinstall', 'install', 'postinstall'];

// Defence-in-depth: bound recursion into nested node_modules in case
// a pathological tree (symlink loop, malicious self-containment) exists.
// Real hoisted trees never exceed single-digit depth.
const MAX_DEPTH = 20;

// Hook commands we treat as trivial (no-op / log only). Everything else
// counts as "carries an install hook".
//
// The echo pattern uses a negative lookahead to reject any shell metachar
// that could chain a real command (e.g. `echo "ok" && node install.js`,
// `echo $(curl …)`). Without this, an attacker prefixing `echo ` would slip
// past the trivial filter. \n and \r are included because package.json
// `scripts` strings can contain literal newlines after JSON decoding, and
// `echo ok\nrm -rf /` would otherwise be classified as trivial.
const TRIVIAL = [
  /^(?!.*[&|;`$()<>\n\r])echo(\s|$)/,
  /^true$/,
  /^:$/,
  /^exit\s+0$/,
];

function isTrivial(cmd) {
  if (!cmd || typeof cmd !== 'string') return true;
  const t = cmd.trim();
  if (!t) return true;
  return TRIVIAL.some((r) => r.test(t));
}

/**
 * Recursively walk node_modules, yielding every package.json path.
 * Symlinked entries are skipped (Dirent.isDirectory() is false on a symlink).
 */
function* walkPackageJsons(dir, depth = 0) {
  if (depth > MAX_DEPTH) return;
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const full = join(dir, entry.name);
    // Scoped packages: recurse into @scope/ to find @scope/pkg/package.json
    if (entry.name.startsWith('@')) {
      yield* walkPackageJsons(full, depth + 1);
      continue;
    }
    const pkgJson = join(full, 'package.json');
    if (existsSync(pkgJson)) {
      try {
        if (statSync(pkgJson).isFile()) yield pkgJson;
      } catch {}
    }
    // Recurse into nested node_modules (hoisting-related)
    const nested = join(full, 'node_modules');
    if (existsSync(nested)) yield* walkPackageJsons(nested, depth + 1);
  }
}

function collectHooks() {
  if (!existsSync(NODE_MODULES)) {
    console.error(`node_modules not found at ${NODE_MODULES} — run \`yarn install\` first.`);
    process.exit(2);
  }
  const found = new Map(); // name -> Set of "hook:cmd"
  for (const path of walkPackageJsons(NODE_MODULES)) {
    let pkg;
    try {
      pkg = JSON.parse(readFileSync(path, 'utf8'));
    } catch {
      continue;
    }
    if (!pkg.name || !pkg.scripts) continue;
    for (const hook of HOOK_KEYS) {
      const cmd = pkg.scripts[hook];
      if (!cmd || isTrivial(cmd)) continue;
      if (!found.has(pkg.name)) found.set(pkg.name, new Set());
      found.get(pkg.name).add(`${hook}: ${cmd.replace(/\s+/g, ' ').trim()}`);
    }
  }
  return found;
}

function loadAllowlist() {
  if (!existsSync(ALLOWLIST_PATH)) return new Set();
  const raw = readFileSync(ALLOWLIST_PATH, 'utf8');
  const names = new Set();
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    // Allow either "name" or "name  # comment" — strip inline comment.
    const name = trimmed.split(/\s+#/)[0].trim();
    if (name) names.add(name);
  }
  return names;
}

function writeAllowlist(hooks) {
  const names = [...hooks.keys()].sort();
  const lines = [
    '# .supply-chain/install-hooks.allowlist',
    '#',
    '# Every package in node_modules that declares a non-trivial',
    '# preinstall / install / postinstall script. Regenerate with',
    '# `node scripts/audit-install-hooks.mjs --update` after any',
    '# dependency change. CI runs the same script without --update',
    '# and fails if this file drifts from the tree.',
    '#',
    '# See SUPPLY-CHAIN-SECURITY.md §7 for the per-package rationale',
    '# (node-gyp-build native bindings, benign shim resolvers, etc.).',
    '',
  ];
  for (const name of names) {
    const hookLines = [...hooks.get(name)].sort();
    lines.push(`${name}  # ${hookLines.join(' | ')}`);
  }
  writeFileSync(ALLOWLIST_PATH, lines.join('\n') + '\n');
}

function collectHooksAcrossTrees() {
  // Aggregate across root + every subgraphs/* directory that has a
  // populated node_modules. Used by --update to capture the union.
  const REPO_ROOT = resolve(SCRIPT_DIR, '..');
  const candidates = [REPO_ROOT];
  const subgraphsDir = join(REPO_ROOT, 'subgraphs');
  if (existsSync(subgraphsDir)) {
    for (const entry of readdirSync(subgraphsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      candidates.push(join(subgraphsDir, entry.name));
    }
  }
  const aggregate = new Map();
  let treesScanned = 0;
  for (const tree of candidates) {
    const nm = join(tree, 'node_modules');
    if (!existsSync(nm)) continue;
    treesScanned++;
    for (const path of walkPackageJsons(nm)) {
      let pkg;
      try {
        pkg = JSON.parse(readFileSync(path, 'utf8'));
      } catch {
        continue;
      }
      if (!pkg.name || !pkg.scripts) continue;
      for (const hook of HOOK_KEYS) {
        const cmd = pkg.scripts[hook];
        if (!cmd || isTrivial(cmd)) continue;
        if (!aggregate.has(pkg.name)) aggregate.set(pkg.name, new Set());
        aggregate.get(pkg.name).add(`${hook}: ${cmd.replace(/\s+/g, ' ').trim()}`);
      }
    }
  }
  return { aggregate, treesScanned };
}

if (UPDATE) {
  const { aggregate, treesScanned } = collectHooksAcrossTrees();
  if (treesScanned === 0) {
    console.error('No node_modules trees found. Run `yarn install` at root and in every subgraph first.');
    process.exit(2);
  }
  writeAllowlist(aggregate);
  console.log(`Wrote ${aggregate.size} entries to ${ALLOWLIST_PATH} (aggregated across ${treesScanned} tree(s)).`);
  process.exit(0);
}

const found = collectHooks();
const allowed = loadAllowlist();
const foundNames = new Set(found.keys());
const unexpected = [...foundNames].filter((n) => !allowed.has(n)).sort();

// Stale-entry detection intentionally omitted: per-tree matrix means
// some hook-bearing packages legitimately only surface in some trees.
// Cleanup happens at `--update` time.

if (unexpected.length === 0) {
  console.log(`install-hooks: OK (${foundNames.size} in tree, all in allowlist).`);
  process.exit(0);
}

console.error('::error::install-hook audit found NEW packages with install hooks not in the allowlist:');
for (const name of unexpected) {
  console.error(`  + ${name}`);
  for (const hook of found.get(name)) console.error(`      ${hook}`);
}
console.error('');
console.error('Review the hook. If it is legitimate, run `yarn audit:install-hooks:update`');
console.error('at repo root (after `yarn install` in every affected tree) to refresh the allowlist.');
process.exit(1);
