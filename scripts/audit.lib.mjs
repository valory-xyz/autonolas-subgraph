/**
 * Pure helpers extracted from audit.mjs so they can be unit-tested without
 * firing the script's top-level side effects (allowlist load, audit spawn,
 * process.exit). Imported by both the script and audit.test.mjs.
 *
 * No I/O, no exit, no global state — same input → same output.
 */

/* eslint-disable no-undef -- standalone module: uses JS built-in globals (works across legacy + flat eslint configs) */

export function parseAdvisories(stdout) {
  const advisories = new Map();
  // Track whether we saw any well-formed yarn-audit JSON row. If a
  // registry outage or network failure left us with garbled / partial
  // output, `advisories` would stay empty AND `sawAuditRow` would be
  // false — distinguishes "no advisories" from "could not parse".
  let sawAuditRow = false;
  for (const line of stdout.split('\n')) {
    if (!line.trim()) continue;
    let row;
    try {
      row = JSON.parse(line);
    } catch {
      continue;
    }
    // yarn-audit's JSON output always emits at least an `auditSummary`
    // (success) or an `error` row. Seeing either confirms the run reached
    // a final state, not a truncated stream.
    if (row.type === 'auditAdvisory' || row.type === 'auditSummary') {
      sawAuditRow = true;
    }
    if (row.type !== 'auditAdvisory') continue;
    const a = row.data.advisory;
    const key = a.id;
    if (!advisories.has(key)) advisories.set(key, { advisory: a, paths: new Set() });
    advisories.get(key).paths.add(row.data.resolution.path);
  }
  return { advisories: [...advisories.values()], sawAuditRow };
}

const NPM_SEVERITIES = new Set(['info', 'low', 'moderate', 'high', 'critical']);
const isPlainObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);

// `npm audit --json` (npm 7+) emits one JSON document. Each advisory shows
// up as an object in the `via` list of the package it affects (string
// entries in `via` only point at another vulnerable package), so the
// objects alone list every advisory. It is mapped onto the yarn advisory
// shape so the gate is shared.
//
// Anything that does not look like that format returns `sawAuditRow: false`
// with a `problem`, so the gate fails loudly (exit 2). An advisory whose id or
// severity it cannot read would otherwise be skipped and the gate would pass.
export function parseNpmAdvisories(stdout) {
  const fail = (problem) => ({ advisories: [], sawAuditRow: false, problem });
  let report;
  try {
    report = JSON.parse(stdout);
  } catch {
    return fail('output is not JSON');
  }
  // A completed run always carries `auditReportVersion` and a
  // `vulnerabilities` object; an error run carries `error` instead.
  if (!isPlainObject(report)) return fail('report is not a JSON object');
  if (report.error) return fail(`npm reported an error: ${JSON.stringify(report.error)}`);
  if (!report.auditReportVersion) return fail('no `auditReportVersion` (not an npm 7+ audit report)');
  if (!isPlainObject(report.vulnerabilities)) return fail('`vulnerabilities` is missing or not an object');

  const advisories = new Map();
  let highOrCriticalPackage = false;
  for (const [pkg, vuln] of Object.entries(report.vulnerabilities)) {
    if (!isPlainObject(vuln)) return fail(`vulnerabilities.${pkg} is not an object`);
    if (!Array.isArray(vuln.via) || vuln.via.length === 0) return fail(`vulnerabilities.${pkg}.via is missing or empty`);
    if (vuln.severity === 'high' || vuln.severity === 'critical') highOrCriticalPackage = true;
    for (const via of vuln.via) {
      if (typeof via === 'string') {
        if (!Object.hasOwn(report.vulnerabilities, via)) {
          return fail(`vulnerabilities.${pkg}.via points at unknown package "${via}"`);
        }
        continue;
      }
      if (!isPlainObject(via)) return fail(`vulnerabilities.${pkg}.via has an unexpected entry: ${JSON.stringify(via)}`);
      if (typeof via.source !== 'number') return fail(`advisory under ${pkg} has no numeric \`source\` id`);
      if (!NPM_SEVERITIES.has(via.severity)) {
        return fail(`advisory ${via.source} under ${pkg} has unknown severity ${JSON.stringify(via.severity)}`);
      }
      const key = via.source;
      if (!advisories.has(key)) {
        advisories.set(key, {
          advisory: {
            id: via.source,
            severity: via.severity,
            module_name: via.name,
            vulnerable_versions: via.range,
            // npm's report has no patched range; point at the advisory.
            patched_versions: via.url ? `see ${via.url}` : 'see advisory',
            github_advisory_id: (via.url || '').split('/').pop() || undefined,
            title: via.title,
          },
          paths: new Set(),
        });
      }
      for (const node of vuln.nodes || []) advisories.get(key).paths.add(node);
    }
  }
  // Every high/critical package traces back to at least one high/critical
  // advisory. If none was read, the advisories are in a shape we don't parse.
  const result = [...advisories.values()];
  if (highOrCriticalPackage && !result.some(({ advisory: a }) => a.severity === 'high' || a.severity === 'critical')) {
    return fail('high/critical packages reported but no high/critical advisory could be read');
  }
  return { advisories: result, sawAuditRow: true };
}

// Apply the gate: high/critical advisories not in `allowed` (Map of id →
// allowlist entry) block; allowlisted ones are suppressed, and flagged as
// expired when their review date (YYYY-MM-DD) is before `today`.
export function evaluateAdvisories(advisories, allowed, today) {
  const blocking = [];
  const suppressed = [];
  const expired = [];
  for (const { advisory, paths } of advisories) {
    const sev = advisory.severity;
    if (sev !== 'high' && sev !== 'critical') continue;
    const entry = allowed.get(advisory.id);
    if (!entry) {
      blocking.push({ advisory, paths });
      continue;
    }
    suppressed.push({ advisory, paths, entry });
    if (entry.review && entry.review < today) {
      expired.push({ advisory, entry });
    }
  }
  return { blocking, suppressed, expired };
}

// The gate's exit-code decision, shared by audit.mjs and the tests: output
// that could not be parsed → 2, unlisted high/critical advisories → 1, else 0.
// `parsed` is the result of parseAdvisories / parseNpmAdvisories.
export function decideExit(parsed, allowed, today) {
  if (!parsed.sawAuditRow) return { code: 2, blocking: [], suppressed: [], expired: [] };
  const result = evaluateAdvisories(parsed.advisories, allowed, today);
  return { code: result.blocking.length > 0 ? 1 : 0, ...result };
}
