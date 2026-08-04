FROM node:22-slim AS build
# native deps (bufferutil et al.) need a compiler at install time
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json schema.graphql ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:22-slim
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/lib ./lib
COPY package.json schema.graphql ./
COPY db ./db
# processor by default; the API pod overrides the command with
# ["npx", "squid-graphql-server"] and the migration job with
# ["npx", "squid-typeorm-migration", "apply"]
CMD ["node", "lib/main.js"]
