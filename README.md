# Autonolas Subgraph

## Deployment status

Active source locations for these indexers:

- **Polystrat trader (Polymarket, Polygon):** [squid](https://github.com/valory-xyz/autonolas-subgraph/tree/main/squids/predict-polymarket).
- **Omen trader (Gnosis):** [self-hosted subgraph](https://github.com/valory-xyz/autonolas-subgraph/tree/main/subgraphs/predict-omen).
- **Service registry (Gnosis):** [self-hosted subgraph](https://github.com/valory-xyz/autonolas-subgraph/tree/main/subgraphs/service-registry).

Current deployments, endpoints and consumer migrations are tracked in the internal **[WD] Subgraph&Squids Development and Deployment Tracking** document. Update that document when deploying or switching consumers; deployment details do not need to be duplicated here.

Manifests and chain configuration describe what the code supports, not which deployment consumers use. A built image or deployed indexer does not mean consumers have switched to it. For Pearl's consumer configuration, see [olas-operate-app](https://github.com/valory-xyz/olas-operate-app); use the internal tracking document for the full inventory.

## Deploy to Production (GitHub Actions)

Production deployments are managed through GitHub Actions for consistency and security.

**⚠️ Important:** Production deployments are only allowed from the `main` branch. Staging deployments can be triggered from any branch.

### Option 1: Using the GitHub UI

1. Go to the [Actions tab](../../actions/workflows/deploy-subgraph.yaml) in the GitHub repository
2. Click "Run workflow"
3. Fill in the required parameters:
   - **Environment**: Choose `production` or `staging`
   - **Subgraph**: Name of the subgraph to deploy (e.g., `autonolas`, `mech`)
   - **Version**: Semantic version to deploy (e.g., `v0.1.2`)
   - **Manifest**: Manifest file name (e.g., `subgraph.yaml` or `subgraph.base.yaml`)
4. Click "Run workflow"

### Option 2: Using the deployment script

Run the interactive deployment script to generate the GitHub CLI command:

```bash
node scripts/deploy.ts
```

The script will:
- Prompt you to select the subgraph
- Prompt you to select the manifest file
- Ask for the version to deploy
- Generate the `gh workflow run` command for you to execute

### What the workflow does

Once triggered (via UI or CLI), the workflow will:
- Display a deployment plan with your inputs
- Validate version format, subgraph folder, and manifest file
- Build and deploy the subgraph to production
- Display a summary with the deployment URL

**Subgraph naming convention:**
- Format: `{subgraph}-{network}-{version}` or `{subgraph}-{version}` (if no network)
- Version format: Dots (`.`) are replaced with underscores (`_`)
- Examples:
  - `autonolas-v0_1_2` (from `subgraph.yaml`)
  - `tokenomics-mode-mainnet-v0_1_2` (from `subgraph.mode-mainnet.yaml`)

The deployed subgraph will be available at:
```
https://subgraph.autonolas.tech/subgraphs/name/{SUBGRAPH_NAME}
```

## Example queries for testing

1. Query all available records

```graphql
{
    units{
        id,
        tokenId,
        packageType,
        metadataHash,
        packageHash,
        publicId
    }
}
```

2. Query by package hash

```graphql
{
    units(where:{packageHash:<package_hash>}){
        id,
        tokenId,
        packageType,
        metadataHash,
        packageHash,
        publicId
    }
}
```

3. Query by public id and package type

```graphql
{
    units(where:{publicId:<public_id>,packageType:<package_type>}){
        id,
        tokenId,
        packageType,
        metadataHash,
        packageHash,
        publicId
    }
}
```
