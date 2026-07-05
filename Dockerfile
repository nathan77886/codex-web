FROM node:22-bookworm-slim AS build

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl g++ make patch python3 unzip \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:22-bookworm-slim

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates git openssh-client ripgrep \
  && npm install -g @openai/codex \
  && rm -rf /var/lib/apt/lists/*

COPY --from=build /app /app

ENV NODE_ENV=production
ENV HOST=127.0.0.1
ENV PORT=8214

EXPOSE 8214

CMD ["sh", "-c", "CODEX_CLI_PATH=${CODEX_CLI_PATH:-$(command -v codex)} node src/server/main.js --host ${HOST} --port ${PORT}"]
