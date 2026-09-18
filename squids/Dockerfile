# One Dockerfile for every squid. Build from the REPO ROOT with the squid
# folder as a build arg (see .github/workflows/build-squid-image.yaml):
#
#   docker build -f squids/Dockerfile --build-arg SQUID=mech-fees .
#
# squids/_shared is built first at the same relative path it has in the
# repo, so a squid's "file:../_shared" dependency resolves inside the image.
# Squids that do not depend on it (pearl-transactions, predict-polymarket)
# just carry an unused folder.
ARG SQUID
FROM node:24-slim AS build
ARG SQUID
# native deps (bufferutil et al.) need a compiler at install time
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ && rm -rf /var/lib/apt/lists/*
WORKDIR /app/squids/_shared
COPY squids/_shared/package.json squids/_shared/package-lock.json ./
RUN npm ci
COPY squids/_shared/tsconfig.json ./
COPY squids/_shared/src ./src
RUN npm run build && npm prune --omit=dev

WORKDIR /app/squids/${SQUID}
COPY squids/${SQUID}/package.json squids/${SQUID}/package-lock.json ./
RUN npm ci
COPY squids/${SQUID}/tsconfig.json squids/${SQUID}/schema.graphql ./
COPY squids/${SQUID}/src ./src
RUN npm run build && npm prune --omit=dev

FROM node:24-slim
ARG SQUID
WORKDIR /app/squids/${SQUID}
USER node
COPY --chown=node:node --from=build /app/squids/_shared/package.json /app/squids/_shared/package.json
COPY --chown=node:node --from=build /app/squids/_shared/node_modules /app/squids/_shared/node_modules
COPY --chown=node:node --from=build /app/squids/_shared/lib /app/squids/_shared/lib
COPY --chown=node:node --from=build /app/squids/${SQUID}/node_modules ./node_modules
COPY --chown=node:node --from=build /app/squids/${SQUID}/lib ./lib
COPY --chown=node:node squids/${SQUID}/package.json squids/${SQUID}/schema.graphql ./
COPY --chown=node:node squids/${SQUID}/db ./db
# processor by default; the API pod overrides the command with
# ["npx", "squid-graphql-server"] and the migration job with
# ["npx", "squid-typeorm-migration", "apply"]
CMD ["node", "lib/main.js"]
