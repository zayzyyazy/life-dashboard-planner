FROM node:22-bookworm-slim

# better-sqlite3 native build + git for vault sync
RUN apt-get update && apt-get install -y python3 make g++ git \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
COPY server/package.json server/package-lock.json ./server/
COPY packages/obisidan-plug/package.json packages/obisidan-plug/package-lock.json ./packages/obisidan-plug/

# install:all runs scripts/check-node.mjs, which isn't copied yet — install directly
RUN npm install --ignore-scripts && \
    npm install --prefix packages/obisidan-plug && \
    npm install --prefix server

COPY packages/obisidan-plug ./packages/obisidan-plug
RUN cd packages/obisidan-plug && npm run build

COPY . .

RUN npm run build

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV DATA_DIR=/app/data
ENV VAULT_PATH=/app/data/Brain-Vault
ENV BRAIN_DATA_DIR=/app/data/brain
ENV PORT=3847

RUN mkdir -p /app/data /app/data/brain

EXPOSE 3847

COPY scripts/docker-entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
