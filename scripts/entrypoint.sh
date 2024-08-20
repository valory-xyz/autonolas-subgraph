#! /bin/bash -e

echo "Starting entrypoint.sh"
echo "Network: $CHAIN"
echo "Subgraph node: $SUBGRAPH_NODE"
echo "Registry: $IPFS_REGISTRY"

# Install the "autonolas" subgraph

if [ "$CHAIN" == "mainnet" ]; then 
  cp profiles/subgraph-prod.yaml subgraph.yaml
elif [ "$CHAIN" == "staging" ]; then 
  cp profiles/subgraph-staging.yaml subgraph.yaml
else
  echo "Invalid param"
  exit 1
fi
echo "Starting $CHAIN"

yarn graph codegen &&  yarn graph build

until yarn graph create --node $SUBGRAPH_NODE autonolas
do
  echo "graph-node not ready..."
  sleep 10
done
yarn graph deploy --node $SUBGRAPH_NODE --ipfs $IPFS_REGISTRY autonolas -l 0.1.0

# Install the "autonolas-staging" Subgraph
# We are deploying autonolas-staging for backward compatibility (there are some applications using it)
# It has a different startBlock to be indexed separately from “autonolas” Subgraph

sed -i 's/startBlock: 15178253/startBlock: 15178252/g' subgraph.yaml

yarn graph codegen &&  yarn graph build
yarn graph create --node $SUBGRAPH_NODE autonolas-staging
yarn graph deploy --node $SUBGRAPH_NODE --ipfs $IPFS_REGISTRY autonolas-staging -l 0.1.0

echo "Deployment completed!"
sleep infinity
