# Supply chain security

This document describes the supply-chain threat model for `autonolas-subgraph`, the controls in place, and how to respond when something breaks.

## 1. Why this repo's supply chain matters

The deliverables here are not user-facing apps — they are **The Graph** subgraphs deployed to Valory's self-hosted graph-node infrastructure (`subgraph.autonolas.tech`) that index on-chain data for the Olas ecosystem. **Every Olas dashboard, frontend app, and analytics view that queries one of these subgraphs depends on the data shipped from this repo.** A compromised deployment can serve manipulated on-chain data to every downstream consumer; the blast radius is org-wide, not repo-local.

The supply-chain surface is:
- The CI runner that builds (`graph codegen` + `graph build`) and pushes (`graph deploy`).
- The dependency tree that runs at install + build time on dev machines and CI (where install scripts execute).
- The deploy auth secrets (`GRAPH_NODE_PROD_*` and `GRAPH_NODE_STAGING_*`).
- The `@graphprotocol/graph-cli` toolchain that compiles AssemblyScript mappings to WASM.

Because the deliverable is data, not a downloadable artifact, there is no Docker image to scan, no CSP to write, no end-user bundle to pin. Hardening is concentrated in CI/secrets/dep-pinning rather than container or runtime defenses.

## 2. Threat model

| # | Threat | Concrete example | Control |
|---|---|---|---|
| T1 | Supply-chain compromise via a transitive dep of `@graphprotocol/graph-cli` | `event-stream` (2018), `xz-utils` (2024), repeated nx/sourcemap CDN incidents (2024–2025) | Audit gate (§5), install-hook gate (§7), lockfile-lint (§6), SHA-pinned actions, Dependabot (§4) |
| T2 | Stolen `GRAPH_NODE_*` deploy credentials | Phished maintainer, leaked CI log, exfiltration via compromised dep with install hook | Quarterly password rotation (§3), gitleaks scan over full history (§8), GitHub Environments scoping, least-privilege workflow `permissions: contents: read` |
| T3 | GitHub Action tag-mutation | `tj-actions/changed-files` (March 2025) — maintainer's PAT compromised, every action tag rewrites to dump CI secrets | All actions SHA-pinned to commit hash, not tag |
| T4 | Compromised maintainer account → `workflow_dispatch` shell injection | `subgraph` / `version` / `manifest` interpolated into shell commands | Regex validation on every dispatch input + `permissions: contents: read` |
| T5 | Historical secret leak in git or CI logs | `GRAPH_NODE_*_PASSWORD` is interpolated into the deploy URL via shell; redaction is best-effort | Gitleaks scans every PR + full history; rotate passwords on incident |
| T6 | Malicious subgraph deploy via compromised feature branch | A staging deploy from an arbitrary branch with malicious handler code could publish poisoned data downstream | Production deploys gated to `main` branch; staging deploys are advisory only and overwritten by the next production deploy |
| T7 | Manifest tampering (contract-address swap) | Malicious PR edits `subgraph.gnosis.yaml` to index events from an attacker-controlled contract with matching event signatures | CODEOWNERS routes manifest review to the security reviewer; build smoke-test (§9) confirms the manifest still compiles |

## 3. Secrets inventory

| Name | Used by | Location | Rotation cadence | How to rotate |
|---|---|---|---|---|
| `GRAPH_NODE_PROD_USER` | `.github/workflows/deploy-subgraph.yaml`, `.github/workflows/deploy-subgraph-no-version-label.yaml` | GitHub `production` environment secret | **Quarterly** | (See runbook below.) |
| `GRAPH_NODE_PROD_PASSWORD` | Same as above | GitHub `production` environment secret | **Quarterly** | (See runbook below.) |
| `GRAPH_NODE_STAGING_USER` | Same workflows | GitHub `staging` environment secret | **Quarterly** | (See runbook below.) |
| `GRAPH_NODE_STAGING_PASSWORD` | Same workflows | GitHub `staging` environment secret | **Quarterly** | (See runbook below.) |

If the repo gains additional secrets (oracle keys, RPC endpoints, monitoring tokens), update this table and add a control for each.

### Rotation runbook

The deploy workflows authenticate to `admin.subgraph.autonolas.tech` (production) and `admin.subgraph.staging.autonolas.tech` (staging) via HTTP basic auth. The credentials are interpolated into the URL by the workflow's "Prepare environment" step. Rotation:

1. **Generate new credentials.** Coordinate with the infra team that operates the self-hosted graph-node. They reset the basic-auth user+password in the graph-node admin config.
2. **Update GitHub repo secrets.** Settings → Environments → `production` (or `staging`) → Secrets → update `GRAPH_NODE_PROD_USER` / `GRAPH_NODE_PROD_PASSWORD` (or staging equivalents).
3. **Test the rotation.** Dispatch the deploy workflow against a small subgraph (e.g. `tokenomics`) to staging. Confirm the deploy succeeds. If it fails, revert credentials at graph-node side and investigate before retrying production.
4. **Record the rotation date** in this document or a separate rotation log.

### Residual exposure: basic-auth-in-URL (current state)

The deploy workflow interpolates the user+password into the node URL:

```yaml
GRAPH_NODE_URL="https://${GRAPH_NODE_USER}:${GRAPH_NODE_PASSWORD}@admin.subgraph.autonolas.tech"
echo "::add-mask::$GRAPH_NODE_URL"
```

`::add-mask::` mitigates *log* exposure (Actions output filters the masked value out of subsequent log lines) but not:
- The credentials sit in the env-var of every step in the deploy job.
- Reverse-proxy / load-balancer access logs at `admin.subgraph.autonolas.tech` may log the auth header in HTTP traffic.
- Multi-line output where redaction can fail.

The quarterly rotation cadence is the primary mitigation. The longer-term fix is header-based auth (`Authorization: Bearer <token>`); tracked as Tier 1.1 Option B in the supply-chain plan, deferred pending an infra ticket to confirm graph-node support.

## 4. Dependabot

This repo intentionally does **not** ship a `.github/dependabot.yml`. Routine version-update PRs across 11 npm scopes + `github-actions` would generate ~10–15 PRs/week — high noise relative to the team's review bandwidth, especially while heterogeneous `@graphprotocol/graph-cli` versions persist (0.64.0 → 0.98.x; Tier 3 convergence is a separate PR). Without convergence, Dependabot would open the same advisory PR against 6+ different graph-cli version lines.

Vulnerability surfacing is still active via the **Security tab**, configured in repo Settings → Code security and analysis:

1. **Dependabot alerts** → Enable. Surfaces known-CVE advisories in the Security tab as they're disclosed. No PRs. This is the primary signal we rely on.
2. **Dependabot security updates** → Leave **disabled** for now. (When enabled, it opens auto-fix PRs *only* for known-CVE alerts — far lower volume than version updates, but currently we'd prefer to triage from the Security tab and bump deps manually as part of regular work.)

The CI-side audit gate ([`scripts/audit.mjs`](scripts/audit.mjs), §5) is the enforcement counterpart — it blocks PRs that introduce new high/critical advisories. Dependabot alerts and the audit gate cover different parts of the lifecycle:

- **Audit gate** — blocks new advisories landing.
- **Dependabot alerts** — surfaces newly disclosed advisories on already-merged code.

Revisit the policy after Tier 3 (graph-cli convergence) lands: with a single graph-cli version line, ordinary version-update PRs become tractable and we may opt in by adding a `.github/dependabot.yml`.

## 5. Audit gate (`yarn audit:prod`)

Yarn 1.x `yarn audit` exits with a *severity bitmask*, not a threshold, and has no suppression mechanism — a single unfixable transitive advisory blocks every PR. To work around this, [`scripts/audit.mjs`](scripts/audit.mjs) wraps `yarn audit --json` and:

1. Fails on any **high** or **critical** advisory not listed in [`.supply-chain/audit-allowlist.json`](.supply-chain/audit-allowlist.json).
2. Surfaces allowlist entries whose `review` date has passed as a **CI warning** (does not fail; review and renew or remove).

**Critical naming detail**: the script is exposed as `yarn audit:prod`, NOT `yarn audit`. Yarn 1.x's built-in `yarn audit` shadows same-named scripts in `package.json`, so naming the script `audit` would silently invoke the built-in instead.

The audit gate runs as a **matrix across the root + 10 subgraphs** in [`.github/workflows/supply-chain.yml`](.github/workflows/supply-chain.yml). Per-path matrix is necessary because heterogeneous graph-cli versions mean root audit alone wouldn't surface advisories present only in older trees (`autonolas` and `autonolas-base` on graph-cli 0.64.0). The script self-locates its allowlist via `import.meta.url`, so a single allowlist at the repo root governs every matrix entry.

Allowlist policy: every entry needs `id`, `reason`, `added`, `review` (all required), plus optional `ghsa`, `package`, `severity` for human readability. An expired entry prints a warning but does not block CI — the team is expected to refresh or remove on review.

## 6. Lockfile lint

[`.github/workflows/supply-chain.yml`](.github/workflows/supply-chain.yml) runs `lockfile-lint` on every `yarn.lock` (root + 10 subgraphs):

```
npx --yes lockfile-lint --path yarn.lock --type yarn --validate-https \
  --allowed-hosts yarn npm --empty-hostname false
```

Catches non-registry deps (e.g., `codeload.github.com` URLs from forked-and-patched packages), HTTP-only sources, and missing integrity hashes. A new GitHub-source dep should be allowlisted explicitly with a comment naming the package — never blanket-allow.

## 7. Install-hook gate

[`scripts/audit-install-hooks.mjs`](scripts/audit-install-hooks.mjs) enumerates every package in `node_modules` that declares a non-trivial `preinstall` / `install` / `postinstall` script and diffs the list against [`.supply-chain/install-hooks.allowlist`](.supply-chain/install-hooks.allowlist). Drift in either direction (new hook OR removed hook) fails the job — the latter catches stale allowlist entries.

A new package with an install hook NOT in the allowlist requires an explicit decision: vet what the hook does, then run `yarn audit:install-hooks:update` to add it (with an inline comment describing what the hook does). Anything you can't justify in a sentence shouldn't go in.

The Graph CLI's transitive tree includes `node-gyp-build` and similar legitimate native-binding bootstrappers; those are expected and allowlisted. Anything else is suspicious.

The install-hook audit runs at **the root tree only** in CI (after `yarn install --frozen-lockfile --ignore-scripts`). Graph-cli's transitive tree is the dominant source of install hooks and is present in every subgraph; subgraph-specific hooks (e.g. `matchstick-as`'s native bindings) are expected to surface via the lockfile-lint matrix.

## 8. Secret scanning (gitleaks)

[`.github/workflows/gitleaks.yml`](.github/workflows/gitleaks.yml) runs gitleaks on every push + PR. Configuration notes:

- The gitleaks binary is downloaded with a **pinned version + checksum-verified** SHA-256 (otherwise an unverified `curl` in the gate that's checking for compromise is itself a hole).
- PR runs scan only the diff against the base branch (fast).
- `push` runs to `main` scan the full history.
- A one-time **full-history scan** (`gitleaks detect --log-opts="--all"`) should be run before the gate becomes blocking; surface any historical leaks before they get re-discovered later.

When bumping `GITLEAKS_VERSION`, fetch the upstream `gitleaks_${VERSION}_checksums.txt` from the GitHub release and update `GITLEAKS_SHA256` in the same commit. Reviewers should re-fetch and confirm.

## 9. Build smoke-test

[`.github/workflows/build.yml`](.github/workflows/build.yml) runs `yarn graph codegen` + `yarn graph build` against every (subgraph, manifest) pair on every PR. This catches breakage from dep bumps, schema changes, manifest edits, or handler regressions before they reach a deploy. It is the protection gate that PR 3 (graph-cli convergence) depends on.

Not yet covered: matchstick test execution (`yarn test`). Tests are heterogeneous in coverage across subgraphs (some have functional suites, others have placeholder boilerplate per `tests/component-registry.test.ts` etc.) and adding a green-bar gate would either give false confidence or block merges on placeholder-test bugs unrelated to the PR. Enabling test-execution per-subgraph as the test suites mature is a Tier 4 follow-up.

## 10. CI control summary

| Workflow | Triggers | Required (branch protection)? | Failure mode |
|---|---|---|---|
| [`build.yml`](.github/workflows/build.yml) | PR + push to main | **Recommended once stable** | Blocks merge if any of the 17 (subgraph, manifest) builds fails |
| [`supply-chain.yml`](.github/workflows/supply-chain.yml) | PR + push to main | **Advisory at first; promote when team is ready** | Currently does not block merge |
| [`gitleaks.yml`](.github/workflows/gitleaks.yml) | PR + push | **Advisory at first; promote when team is ready** | Currently does not block merge |
| [`deploy-subgraph.yaml`](.github/workflows/deploy-subgraph.yaml) | `workflow_dispatch` only, production gated to main | n/a (manual) | Validates inputs, then deploys |
| [`deploy-subgraph-no-version-label.yaml`](.github/workflows/deploy-subgraph-no-version-label.yaml) | Same as primary; used for `autonolas` (no version-slug) | n/a (manual) | Same |

To promote `supply-chain.yml` and `gitleaks.yml` to required: Settings → Branches → main → Branch protection rules → Require status checks → add `All checks passed` (the supply-chain.yml aggregator), `All builds passed` (the build.yml aggregator), **and** `Gitleaks / scan` (cross-workflow `needs:` is not supported — all three must be listed separately).

## 11. Response playbook

If a critical advisory is reported against a published subgraph, OR `GRAPH_NODE_*` credentials are suspected leaked, OR a malicious dep is detected:

1. **Rotate the affected `GRAPH_NODE_*` credentials** immediately (see runbook in §3). **This stops further malicious deploys but does NOT undeploy what has already been published.** The graph-node retains the malicious subgraph version.
2. **Identify the affected subgraphs** — review recent deploy history. The `gh run list --workflow=deploy-subgraph.yaml --limit 50` output shows every recent deployment with the subgraph + version + branch.
3. **Re-deploy known-good versions** of every affected subgraph. Trigger `workflow_dispatch` for each `(subgraph, network, version)` triple, picking the last known-good version label from the deploy history. Document the exact `yarn graph deploy` invocations in the incident issue.
4. **Open an incident issue** referencing this playbook, with timeline + scope.
5. **Notify downstream consumers** — Olas dashboards, frontends, and analytics teams should know to re-validate their cached data.

The metric for response readiness: could the team re-deploy all 10 subgraphs to known-good versions in **under an hour**? If not, drill the playbook quarterly. (Drill cadence: Tier 4.4 follow-up.)

## 12. Repo-specific watches

These dependencies and patterns deserve special attention because of the repo's shape:

- **`@graphprotocol/graph-cli`** — the largest dep tree by transitive footprint. Version surface is currently heterogeneous (0.64.0 → 0.98.x). Track upstream releases at [graph-tooling/releases](https://github.com/graphprotocol/graph-tooling/releases). PR 3 (Tier 3) converges most subgraphs to 0.98.x; the 0.64.0 line on `autonolas` and `autonolas-base` is deferred to a multi-week migration project (Wave 3).
- **`GRAPH_NODE_*` deploy credentials** — the only secrets with org-wide blast radius. The basic-auth-in-URL residual exposure is tracked in §3.
- **AssemblyScript runtime version** carried by `@graphprotocol/graph-ts` — a runtime change can produce subtly-different WASM output. Bumps require a staging deploy + cross-query against prod.
- **Service-registry template/manifest setup** — currently brittle (running `yarn generate-manifests` for `service-registry` overwrites checked-in manifests with broken or lossy template output). Out of scope for a supply-chain PR but tracked here as it intersects with deploy correctness.
- **ABI provenance** — the 37 ABIs in [`abis/`](abis/) are not currently audited for source provenance. If any was sourced from an unverified contract, that's a supply-chain concern. Tracked as a follow-up that needs a dedicated auditor.
- **`scripts/deploy.ts`** — the interactive deploy helper uses `@clack/prompts` and constructs a `gh workflow run` command via shell interpolation. Has not been reviewed for command-injection safety. Tracked as a follow-up.

## Contact

Security disclosures: **security@valory.xyz** (see [SECURITY.md](SECURITY.md)).
