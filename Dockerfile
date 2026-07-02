FROM node:22-bookworm-slim

# better-sqlite3 native build
RUN apt-get update && apt-get install -y python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
COPY server/package.json server/package-lock.json ./server/

RUN npm run install:all

COPY . .

RUN npm run build

ENV NODE_ENV=production
ENV DATA_DIR=/app/data
ENV PORT=3847

RUN mkdir -p /app/data

EXPOSE 3847

COPY scripts/docker-entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
