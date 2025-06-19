#! /bin/bash -e

echo "Starting entrypoint.sh"
echo "Subgraph node: $SUBGRAPH_NODE"
echo "Registry: $IPFS_REGISTRY"

# Install the "autonolas" Subgraph
cd /subgraphs/autonolas

yarn graph codegen &&  yarn graph build

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


echo "Deployment completed!"
sleep infinity
