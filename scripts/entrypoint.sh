#! /bin/bash
# params
# $1: subgraph config (mainnet or goerli)

set -e

echo "Starting entrypoint.sh"
echo "Network: $CHAIN"
echo "Subgraph node: $SUBGRAPH_NODE"
echo "Registry: $IPFS_REGISTRY"


if [ "$CHAIN" = "mainnet" ]; then
  echo "Starting mainnet"
  cp profiles/subgraph-prod.yaml subgraph.yaml
elif [ "$CHAIN" = "goerli" ]; then
  echo "Starting "goerli"
  cp profiles/subgraph-staging.yaml subgraph.yaml
else
  echo "Invalid param"
fi

yarn graph codegen &&  yarn graph build

yarn graph remove --node "$SUBGRAPH_NODE" autonolas || echo "Not Found!" 
yarn graph create --node "$SUBGRAPH_NODE" autonolas
yarn graph deploy --node "$SUBGRAPH_NODE" --ipfs "$IPFS_REGISTRY" autonolas -l 0.1.0
