# Autonolas Subgraph

## Deploy to Production (GitHub Actions)

Production deployments are managed through GitHub Actions for consistency and security.

**⚠️ Important:** Production deployments are only allowed from the `main` branch. Staging deployments can be triggered from any branch.

### Option 1: Using the GitHub UI

1. Go to the [Actions tab](../../actions/workflows/deploy-prod-subgraph.yaml) in the GitHub repository
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
