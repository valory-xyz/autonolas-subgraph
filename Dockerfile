FROM node:18-alpine

RUN apk add --no-cache git bash

COPY subgraphs /subgraphs

WORKDIR /subgraphs

RUN cd /subgraphs/autonolas && yarn install
RUN cd /subgraphs/autonolas-base && yarn install
RUN cd /subgraphs/mech && yarn install

COPY scripts /scripts

# yarn graph codegen && yarn graph build

ENV IPFS_REGISTRY=https://registry.autonolas.tech
ENV SUBGRAPH_NODE=http://graph-node:8020
ENV CHAIN=staging

ENTRYPOINT ["/bin/bash"]
CMD ["/scripts/entrypoint.sh"]
