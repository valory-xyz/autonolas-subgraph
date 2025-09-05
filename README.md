# Autonolas Subgraph

## Prerequisites
- Node.js (latest version >24)
- yarn

## Setup

1. Install dependencies:
```bash
yarn install
```

2. Copy environment file:
```bash
cp .env.example .env
```

3. Configure your environment variables in `.env` (see Environment Variables section below)

## Usage

Deploy subgraphs using the deployment script:

```bash
node --env-file=.env scripts/deploy.ts
```

### Command Help

```
Options:
      --version      Show version number                               [boolean]
  -e, --environment  Deployment environment
                                     [string] [choices: "staging", "production"]
  -s, --subgraph     Subgraph name to deploy                            [string]
  -a, --action       Deployment action [string] [choices: "update", "overwrite"]
  -d, --dry-run      Run in dry-run mode (no commands executed)
                                                      [boolean] [default: false]
      --help         Show help                                         [boolean]
```

### Demo

*[Recording with asciiplayer will be included here]*

## Environment Variables

The following environment variables can be configured in your `.env` file:

- `SUBGRAPH_NODE`: The Graph Node endpoint URL for subgraph deployment (with embedded basic auth)
  - Example: `https://username:password@admin.your-graph-node.example.com`
- `IPFS_REGISTRY`: IPFS registry endpoint URL for storing subgraph files (with embedded basic auth)
  - Example: `https://username:password@your-ipfs-node.example.com`

### Basic Authentication Configuration

Depending on your environment, basic authentication should be configured differently in the `.env` file:

- **Development/Local**: Use local credentials or no auth if running locally
- **Staging**: Use staging environment credentials embedded in URLs
- **Production**: Use production credentials with proper security measures

The basic auth credentials are embedded directly in the URLs using the format: `https://username:password@hostname`


## Example queries

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