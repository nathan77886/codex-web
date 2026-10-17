FROM node:24-bookworm-slim AS build

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl g++ make patch python3 unzip \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts && npm rebuild better-sqlite3

COPY . .
RUN npm run prepare \
  && node --test tests/app-server-proxy.test.cjs \
  && npm pkg delete scripts.prepare \
    dependencies.@electron/asar dependencies.@tanstack/react-query dependencies.@types/ws \
    dependencies.prettier dependencies.react dependencies.react-dom dependencies.sharp-cli \
    dependencies.typescript dependencies.vite \
  && npm prune --omit=dev --ignore-scripts \
  && node -e 'require("better-sqlite3")(":memory:").close()' \
  && find scratch/asar -type f \( -name '*.map' -o -name '*.orig' \) -delete \
  && rm -rf scratch/ChatGPT.app scratch/Codex.app

FROM node:24-bookworm-slim

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates git openssh-client ripgrep \
  && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/src/server ./src/server
COPY --from=build /app/scratch/asar ./scratch/asar
COPY --from=build /app/scripts/app-server-proxy.cjs ./scripts/app-server-proxy.cjs

ENV NODE_ENV=production \
    NODE_USE_ENV_PROXY=1 \
    HOST=127.0.0.1 \
    PORT=8214 \
    CODEX_CLI_PATH=/app/scripts/app-server-proxy.cjs

EXPOSE 8214

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s \
  CMD node -e 'fetch(`http://127.0.0.1:${process.env.PORT || 8214}/`).then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))'

CMD ["sh", "-c", "exec node src/server/main.js --host \"${HOST}\" --port \"${PORT}\""]
