#!/usr/bin/env node
/**
 * Unit tests for the pure helpers exported by audit.lib.mjs, focused on the
 * `--npm` gate: npm audit JSON → advisories → allowlist decision.
 * Uses Node's built-in test runner (node:test) — no new devDependencies.
 * Run with `node --test scripts/audit.test.mjs` (or `yarn audit:test`).
 *
 * The fixtures are trimmed `npm audit --omit=dev --json` reports (npm 7+,
 * auditReportVersion 2). The point is that a change in npm's output format
 * fails the gate loudly instead of letting it pass with zero advisories.
 */

/* eslint-disable no-undef -- standalone test module: uses JS built-in globals (works across legacy + flat eslint configs) */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseAdvisories, parseNpmAdvisories, decideExit } from './audit.lib.mjs';

const TODAY = '2026-10-08';

// Parse like `audit.mjs --npm` (or plain `audit.mjs` with `yarn: true`),
// then take the exit decision from the same decideExit() the script uses.
function gate(report, allowlistEntries = [], { yarn = false } = {}) {
  const stdout = typeof report === 'string' ? report : JSON.stringify(report);
  const parsed = yarn ? parseAdvisories(stdout) : parseNpmAdvisories(stdout);
  const allowed = new Map(allowlistEntries.map((e) => [e.id, e]));
  return { parsed, ...decideExit(parsed, allowed, TODAY) };
}

function advisory({ source, name, severity, range = '<1.0.0' }) {
  return {
    source,
    name,
    dependency: name,
    title: `${name} is vulnerable`,
    url: `https://github.com/advisories/GHSA-test-${source}`,
    severity,
    cwe: [],
    cvss: { score: 0, vectorString: null },
    range,
  };
}

// One advisory on `name`, plus a parent package that only points at it with
// a string `via` (as npm does for transitive effects).
function report(name, adv, severity = adv.severity) {
  return {
    auditReportVersion: 2,
    vulnerabilities: {
      [name]: {
        name,
        severity,
        isDirect: false,
        via: [adv],
        effects: ['parent'],
        range: adv.range,
        nodes: [`node_modules/${name}`, `node_modules/parent/node_modules/${name}`],
        fixAvailable: false,
      },
      parent: {
        name: 'parent',
        severity,
        isDirect: true,
        via: [name],
        effects: [],
        range: '*',
        nodes: ['node_modules/parent'],
        fixAvailable: false,
      },
    },
    metadata: {
      vulnerabilities: { info: 0, low: 0, moderate: 0, high: severity === 'high' ? 2 : 0, critical: severity === 'critical' ? 2 : 0, total: 2 },
    },
  };
}

const HIGH = report('proxy-addr', advisory({ source: 1241210, name: 'proxy-addr', severity: 'high' }));
const CRITICAL = report('evil-pkg', advisory({ source: 1300001, name: 'evil-pkg', severity: 'critical' }));
const ALLOW_HIGH = {
  id: 1241210,
  ghsa: 'GHSA-test-1241210',
  package: 'proxy-addr',
  severity: 'high',
  reason: 'test',
  added: '2026-10-07',
  review: '2026-11-06',
};

test('npm: maps an advisory onto the yarn advisory shape', () => {
  const { advisories, sawAuditRow } = parseNpmAdvisories(JSON.stringify(HIGH));
  assert.equal(sawAuditRow, true);
  assert.equal(advisories.length, 1);
  const [{ advisory: a, paths }] = advisories;
  assert.equal(a.id, 1241210);
  assert.equal(a.severity, 'high');
  assert.equal(a.module_name, 'proxy-addr');
  assert.equal(a.github_advisory_id, 'GHSA-test-1241210');
  assert.deepEqual([...paths], ['node_modules/proxy-addr', 'node_modules/parent/node_modules/proxy-addr']);
});

test('npm: unlisted high advisory fails the gate', () => {
  const r = gate(HIGH);
  assert.equal(r.code, 1);
  assert.deepEqual(r.blocking.map((b) => b.advisory.id), [1241210]);
});

test('npm: the same high advisory allowlisted passes', () => {
  const r = gate(HIGH, [ALLOW_HIGH]);
  assert.equal(r.code, 0);
  assert.deepEqual(r.suppressed.map((s) => s.advisory.id), [1241210]);
  assert.equal(r.expired.length, 0);
});

test('npm: allowlisted past its review date still passes, flagged expired', () => {
  const r = gate(HIGH, [{ ...ALLOW_HIGH, review: '2026-10-01' }]);
  assert.equal(r.code, 0);
  assert.deepEqual(r.expired.map((e) => e.advisory.id), [1241210]);
});

test('npm: unlisted critical advisory fails the gate', () => {
  const r = gate(CRITICAL, [ALLOW_HIGH]);
  assert.equal(r.code, 1);
  assert.deepEqual(r.blocking.map((b) => [b.advisory.id, b.advisory.severity]), [[1300001, 'critical']]);
});

test('npm: moderate advisory does not block', () => {
  const r = gate(report('meh', advisory({ source: 1300002, name: 'meh', severity: 'moderate' })));
  assert.equal(r.code, 0);
});

test('npm: clean report passes', () => {
  const r = gate({
    auditReportVersion: 2,
    vulnerabilities: {},
    metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0 } },
  });
  assert.equal(r.code, 0);
});

// --- malformed / unexpected output must fail loudly (exit 2), never pass ---

const MALFORMED = {
  'not JSON': 'npm ERR! network request failed',
  'empty object': {},
  'npm error report': { error: { code: 'ENOTFOUND', summary: 'request to registry failed' } },
  'npm 6 format (advisories, no auditReportVersion)': { advisories: {}, metadata: {} },
  'missing vulnerabilities key': { auditReportVersion: 2, metadata: {} },
  'vulnerabilities is null': { auditReportVersion: 2, vulnerabilities: null },
  'vulnerabilities is an array': { auditReportVersion: 2, vulnerabilities: [] },
  'JSON array': [],
  'advisory without numeric source': (() => {
    const r = structuredClone(HIGH);
    const via = r.vulnerabilities['proxy-addr'].via[0];
    via.id = via.source;
    delete via.source;
    return r;
  })(),
  'advisory without severity': (() => {
    const r = structuredClone(HIGH);
    delete r.vulnerabilities['proxy-addr'].via[0].severity;
    return r;
  })(),
  'advisory with unknown severity': (() => {
    const r = structuredClone(HIGH);
    r.vulnerabilities['proxy-addr'].via[0].severity = 'HIGH';
    return r;
  })(),
  'via is not an array': (() => {
    const r = structuredClone(HIGH);
    r.vulnerabilities['proxy-addr'].via = r.vulnerabilities['proxy-addr'].via[0];
    return r;
  })(),
  'high package but no advisory objects anywhere': (() => {
    const r = structuredClone(HIGH);
    r.vulnerabilities['proxy-addr'].via = ['something-renamed'];
    return r;
  })(),
};

for (const [name, input] of Object.entries(MALFORMED)) {
  test(`npm: malformed report fails loudly — ${name}`, () => {
    const r = gate(input);
    assert.equal(r.code, 2, `expected exit 2, got ${r.code}`);
    assert.equal(typeof r.parsed.problem, 'string', 'expected a problem description');
  });
}

// --- yarn mode: same decision, yarn-audit JSON lines ---

const YARN_HIGH = [
  { type: 'auditAdvisory', data: { resolution: { path: 'parent>proxy-addr' }, advisory: { id: 1241210, severity: 'high', module_name: 'proxy-addr' } } },
  { type: 'auditSummary', data: {} },
]
  .map((row) => JSON.stringify(row))
  .join('\n');

test('yarn: unlisted high advisory fails the gate, allowlisted passes', () => {
  assert.equal(gate(YARN_HIGH, [], { yarn: true }).code, 1);
  assert.equal(gate(YARN_HIGH, [ALLOW_HIGH], { yarn: true }).code, 0);
});

test('yarn: output with no audit rows fails loudly', () => {
  assert.equal(gate('{"type":"info","data":"fetching"}\nnot json', [], { yarn: true }).code, 2);
});
