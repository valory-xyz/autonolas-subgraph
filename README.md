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

- `BASIC_AUTH_USER`: Username for basic authentication (required)
- `BASIC_AUTH_PASSWORD`: Password for basic authentication (required)
- `IPFS_REGISTRY`: IPFS registry URL (optional, defaults to `https://registry.autonolas.tech`)

### Environment URLs

The deployment script uses predefined URLs for the Graph Node based on the selected environment:

- **Staging**: `admin.staging.subgraph.autonolas.tech`
- **Production**: `admin.subgraph.autonolas.tech`

### Basic Authentication Configuration

The basic authentication credentials are applied to the predefined URLs automatically. Make sure to:

1. Set the correct `BASIC_AUTH_USER` and `BASIC_AUTH_PASSWORD` in your `.env` file
2. Use environment-specific credentials (staging credentials for staging, production credentials for production)
3. Keep your credentials secure and never commit them to the repository


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