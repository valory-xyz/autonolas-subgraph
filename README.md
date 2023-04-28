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

`IPFS_URL`=`https://registry.autonolas.tech`
`RPC_URL`=`http://host.docker.internal:8545`
`GRAPH_START_BLOCK`=`0`
`GRAPH_ETHEREUM_GENESIS_BLOCK_NUMBER`=`0`
`ETHEREUM_POLLING_INTERVAL`=`1000`

Run the deployment using `make node` and deploy the subgraph using `make deploy-local`

2. Testnet deployment (`Goerli`)

### Environment variables

`IPFS_URL`=`https://registry.autonolas.tech`
`RPC_URL`=`GOERLI_RPC_URL`
`GRAPH_START_BLOCK`=`7344700`
`GRAPH_ETHEREUM_GENESIS_BLOCK_NUMBER`=`7344700`
`ETHEREUM_POLLING_INTERVAL`=`12000`

Run the deployment using `make node` and deploy `make deploy-staging`

3. Mainnet deployment (`Ethereum`)

### Environment variables

`IPFS_URL`=`https://registry.autonolas.tech`
`RPC_URL`=`MAINNET_RPC_URL`
`GRAPH_START_BLOCK`=`15178253`
`GRAPH_ETHEREUM_GENESIS_BLOCK_NUMBER`=`15178253`
`ETHEREUM_POLLING_INTERVAL`=`12000`

Run the deployment using `make node` and deploy `make deploy-prod`