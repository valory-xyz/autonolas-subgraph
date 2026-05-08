# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in this repository — including its build infrastructure, deploy workflows, or any of the indexed subgraph mappings — please **do not** open a public GitHub issue. Instead, email **security@valory.xyz** with:

- A clear description of the vulnerability and its potential impact.
- The affected subgraph(s), network(s), and any relevant entity IDs, transaction hashes, or block ranges.
- Steps to reproduce, including the version (commit SHA) you tested against.
- Any proof-of-concept code, queries, or transaction traces.

We aim to acknowledge receipt within **72 hours** and will keep you updated on triage and remediation.

## Supported Scope

The following are in scope:

- Anything under [`subgraphs/`](subgraphs/) — mapping handler logic, schema definitions, and per-network manifest files.
- The shared ABIs in [`abis/`](abis/) — if any was sourced from an unverified or malicious contract.
- The GitHub Actions workflows in [`.github/workflows/`](.github/workflows/) — secret handling, deploy logic, input validation.
- The deployment helper at [`scripts/deploy.ts`](scripts/deploy.ts) — input handling and shell interpolation.
- The local-development [`docker-compose.yaml`](docker-compose.yaml) configuration.
- Repository configuration: lockfiles, `package.json` files, `.gitignore`, `.nvmrc`, and CI gate scripts.

## Out of Scope

- Vulnerabilities in [The Graph](https://thegraph.com/) protocol itself, in `graph-node`, or in the broader Graph Protocol stack — please report those upstream.
- Vulnerabilities in Valory's hosted graph-node infrastructure (`admin.subgraph.autonolas.tech`, `admin.subgraph.staging.autonolas.tech`) — those are tracked separately by the infra team; route via security@valory.xyz and the infra owners will pick them up.
- Issues in third-party dependencies that have already been disclosed publicly and are tracked via the audit allowlist in `.supply-chain/`.
- Vulnerabilities in the on-chain Olas smart contracts indexed by these subgraphs — please report those to the [Olas core repositories](https://github.com/valory-xyz).

## Disclosure

We follow a coordinated-disclosure process. Once a fix is available we will:

1. Publish a patched release of the affected subgraph(s).
2. Credit the reporter (with consent) in the release notes.
3. File a CVE if the impact warrants one.

## Contact

- Security disclosure: **security@valory.xyz**
- General questions: **info@valory.xyz**

Thank you for helping keep the Olas ecosystem safe.
