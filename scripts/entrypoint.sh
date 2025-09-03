#! /bin/bash -e

echo "Starting entrypoint.sh"
echo "Subgraph node: $SUBGRAPH_NODE"
echo "Registry: $IPFS_REGISTRY"

# Install the "autonolas" Subgraph
cd /subgraphs/autonolas

yarn graph codegen && yarn graph build

until yarn graph create --node $SUBGRAPH_NODE autonolas
do
  echo "graph-node not ready..."
  sleep 10
done
yarn graph deploy --node $SUBGRAPH_NODE --ipfs $IPFS_REGISTRY autonolas -l 0.1.0

# Install the "autonolas-staging" Subgraph
cd /subgraphs/autonolas
# We are deploying autonolas-staging for backward compatibility (there are some applications using it)
# It has a different startBlock to be indexed separately from “autonolas” Subgraph
sed -i 's/startBlock: 15178253/startBlock: 15178252/g' subgraph.yaml

yarn graph codegen &&  yarn graph build
yarn graph create --node $SUBGRAPH_NODE autonolas-staging
yarn graph deploy --node $SUBGRAPH_NODE --ipfs $IPFS_REGISTRY autonolas-staging -l 0.1.0

# Install the "autonolas-base" Subgraph
cd /subgraphs/autonolas-base

yarn graph codegen &&  yarn graph build
yarn graph create --node $SUBGRAPH_NODE autonolas-base
yarn graph deploy --node $SUBGRAPH_NODE --ipfs $IPFS_REGISTRY autonolas-base -l 0.1.0


# Install the "mech" Subgraph
cd /subgraphs/mech

yarn graph codegen && yarn graph build
yarn graph create --node $SUBGRAPH_NODE mech-2
yarn graph deploy --node $SUBGRAPH_NODE --ipfs $IPFS_REGISTRY mech-2 -l 0.1.0

# # Install the "mech-marketplace" Subgraph for Gnosis and Base
# cd /subgraphs/mech-marketplace

# # Generate network-specific manifests from template
# yarn generate-manifests

# # Deploy Gnosis network
# yarn graph codegen subgraph.gnosis.yaml && yarn graph build subgraph.gnosis.yaml
# yarn graph create --node $SUBGRAPH_NODE mech-marketplace-gnosis
# yarn graph deploy --node $SUBGRAPH_NODE --ipfs $IPFS_REGISTRY mech-marketplace-gnosis -l 0.1.0 subgraph.gnosis.yaml

# # Deploy Base network
# yarn graph codegen subgraph.base.yaml && yarn graph build subgraph.base.yaml
# yarn graph create --node $SUBGRAPH_NODE mech-marketplace-base
# yarn graph deploy --node $SUBGRAPH_NODE --ipfs $IPFS_REGISTRY mech-marketplace-base -l 0.1.0 subgraph.base.yaml

echo "Deployment completed!"
sleep infinity
