# Autonolas Subgraph


## Environment variables

- `IPFS_URL` : URL for IPFS node.
- `RPC_URL` : RPC URL for chain interactions.
- `GRAPH_LOG` : Logging level.
- `GRAPH_START_BLOCK` : Block number where the forked subgraph will start indexing at
- `GRAPH_ETHEREUM_GENESIS_BLOCK_NUMBER` : Genesis block number.
- `ETHEREUM_POLLING_INTERVAL` : How often to poll chain for new blocks (in `ms`).

## Deployment profiles

1. Local deployment

**Note**: Make sure you have a local hardhat instance running. (Preferebally `valory/autonolas-registries`)

### Environment variables

```bash
export IPFS_URL=https://registry.autonolas.tech
export RPC_URL=http://host.docker.internal:8545
export GRAPH_START_BLOCK=0
export GRAPH_ETHEREUM_GENESIS_BLOCK_NUMBER=0
export ETHEREUM_POLLING_INTERVAL=1000
```

Run the deployment using `make node` and deploy the subgraph using `make deploy-local`

2. Testnet deployment (`Goerli`)

### Environment variables

```bash
export IPFS_URL=https://registry.autonolas.tech
export RPC_URL=GOERLI_RPC_URL
export GRAPH_START_BLOCK=7344700
export GRAPH_ETHEREUM_GENESIS_BLOCK_NUMBER=7344700
export ETHEREUM_POLLING_INTERVAL=12000
```

Run the deployment using `make node` and deploy `make deploy-staging`

3. Mainnet deployment (`Ethereum`)

### Environment variables

```bash
export IPFS_URL=https://registry.autonolas.tech
export RPC_URL=MAINNET_RPC_URL
export GRAPH_START_BLOCK=15178253
export GRAPH_ETHEREUM_GENESIS_BLOCK_NUMBER=15178253
export ETHEREUM_POLLING_INTERVAL=12000
```

Run the deployment using `make node` and deploy `make deploy-prod`


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