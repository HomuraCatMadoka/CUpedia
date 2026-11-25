# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim AS base
WORKDIR /app

FROM base AS dependencies
COPY package.json pnpm-lock.yaml ./
# The current manifest has no packageManager field. Keep the pin until it does.
RUN manager="$(node -p 'require("./package.json").packageManager ?? "pnpm@10.24.0"')" \
    && node -e 'if (!/^pnpm@[0-9]+\.[0-9]+\.[0-9]+$/.test(process.argv[1])) process.exit(1)' "$manager" \
    && npm install --global --no-audit --no-fund "$manager" \
    && pnpm install --frozen-lockfile

FROM dependencies AS build
COPY . .
ARG NEXT_BUILD_SKIP_TYPECHECK=0
# Only dependency installation needs network access. Use the CI-style build
# values so prerendering cannot reach production services.
RUN --network=none NEXT_OUTPUT=standalone \
    NEXT_TELEMETRY_DISABLED=1 \
    DATABASE_URL=postgresql://placeholder:placeholder@127.0.0.1:5432/placeholder \
    AUTH_SECRET=cupedia-image-build-placeholder-not-for-runtime \
    AUTH_URL=http://127.0.0.1:3000 \
    MINIO_BUCKET=cupedia-preview-public \
    MINIO_PRIVATE_BUCKET=cupedia-preview-private \
    pnpm build

FROM base AS runtime
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static/
COPY --from=build --chown=node:node /app/public ./public/
COPY --from=build --chown=node:node /app/src/data/sensitive-words-*.txt ./src/data/

USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
    CMD ["node","-e","fetch('http://127.0.0.1:3000/manifest.webmanifest',{signal:AbortSignal.timeout(4000)}).then(async response=>{if(!response.ok||(await response.json()).name!=='CUpedia')process.exit(1)}).catch(()=>process.exit(1))"]
CMD ["node", "server.js"]
