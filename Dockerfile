FROM node:18-alpine

RUN apk add --no-cache git bash
COPY package.json /app/package.json
COPY yarn.lock /app/yarn.lock

WORKDIR /app

RUN yarn install

COPY abis /app/abis
COPY subgraphs /app/subgraphs
COPY scripts /app/scripts

# yarn graph codegen && yarn graph build

ENV IPFS_REGISTRY=https://registry.autonolas.tech
ENV SUBGRAPH_NODE=http://graph-node:8020
ENV CHAIN=staging

ENTRYPOINT ["/bin/bash"]
CMD ["/app/scripts/entrypoint.sh"]
