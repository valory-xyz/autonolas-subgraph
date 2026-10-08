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

// `npm audit --json` (npm 7+) emits one JSON document. Each advisory shows
// up as an object in the `via` list of the package it affects (string
// entries in `via` only point at another vulnerable package), so the
// objects alone list every advisory. It is mapped onto the yarn advisory
// shape so the gate below is shared.
export function parseNpmAdvisories(stdout) {
  const advisories = new Map();
  let report;
  try {
    report = JSON.parse(stdout);
  } catch {
    return { advisories: [], sawAuditRow: false };
  }
  // A completed run always carries `auditReportVersion` and a
  // `vulnerabilities` object; an error run carries `error` instead.
  if (!report || report.error || !report.auditReportVersion || typeof report.vulnerabilities !== 'object') {
    return { advisories: [], sawAuditRow: false };
  }
  for (const vuln of Object.values(report.vulnerabilities)) {
    for (const via of vuln.via || []) {
      if (typeof via !== 'object' || via === null) continue;
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
  return { advisories: [...advisories.values()], sawAuditRow: true };
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
