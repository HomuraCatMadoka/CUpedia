# syntax=docker/dockerfile:1
FROM node:24.22.3-bookworm-slim@sha256:873f586f3794f52281bd039bf02c048a0be08fde619338f9941bad1eb6b34530 AS base
WORKDIR /app

FROM base AS dependencies
ARG TARGETARCH
COPY package.json pnpm-lock.yaml ./
RUN test "$TARGETARCH" = amd64 \
    && manager="$(node -p 'require("./package.json").packageManager ?? "pnpm@10.24.0"')" \
    && node -e 'if (!/^pnpm@[0-9]+\.[0-9]+\.[0-9]+$/.test(process.argv[1])) process.exit(1)' "$manager" \
    && npm install --global --no-audit --no-fund "$manager" \
    && pnpm install --frozen-lockfile

# The deployed glibc/amd64 app uses these native Sharp packages outside Next's
# standalone output. Copy their locked versions from the same dependency install.
RUN --network=none <<'SH'
set -eu
install -d /opt/cupedia-native/node_modules/@img
cp -a \
  node_modules/.pnpm/@img+sharp-linux-x64@0.34.5/node_modules/@img/sharp-linux-x64 \
  node_modules/.pnpm/@img+sharp-libvips-linux-x64@1.2.4/node_modules/@img/sharp-libvips-linux-x64 \
  /opt/cupedia-native/node_modules/@img/
SH

FROM dependencies AS build
COPY . .
ARG NEXT_BUILD_SKIP_TYPECHECK=0
# Build with placeholder settings and no network access to external services.
RUN --network=none NEXT_OUTPUT=standalone \
    NEXT_TELEMETRY_DISABLED=1 \
    DATABASE_URL=postgresql://placeholder:placeholder@127.0.0.1:5432/placeholder \
    AUTH_SECRET=cupedia-image-build-placeholder-not-for-runtime \
    AUTH_URL=http://127.0.0.1:3000 \
    MINIO_BUCKET=cupedia-build-public \
    MINIO_PRIVATE_BUCKET=cupedia-build-private \
    pnpm build

FROM base AS runtime
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    NODE_EXTRA_CA_CERTS=/app/certs/supabase-prod-ca-2021.crt \
    NODE_PATH=/opt/cupedia-native/node_modules
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static/
COPY --from=build --chown=node:node /app/public ./public/
COPY --from=build --chown=node:node /app/src/data/sensitive-words-*.txt ./src/data/
COPY --from=dependencies /opt/cupedia-native /opt/cupedia-native
COPY certs/supabase-prod-ca-2021.crt ./certs/

USER node
# Exercise native image encoding and the certificate as the runtime user.
RUN --network=none <<'SH'
set -eu
node --check server.js
node <<'JS'
const { X509Certificate } = require('node:crypto');
const { readFileSync } = require('node:fs');
const sharp = require('sharp');

const certificate = new X509Certificate(readFileSync(process.env.NODE_EXTRA_CA_CERTS));
if (!certificate.ca || !(Date.parse(certificate.validTo) > Date.now())) {
  throw new Error('The Supabase CA is invalid or expired');
}

async function verifySharp() {
  if (sharp.versions.sharp !== '0.34.5') {
    throw new Error('Unexpected Sharp runtime version');
  }
  const picture = sharp({
    create: { width: 2, height: 2, channels: 3, background: 'white' },
  });
  const { data, info } = await picture.resize(1, 1).png().toBuffer({ resolveWithObject: true });
  if (info.width !== 1 || info.height !== 1 || info.format !== 'png' || !data.length) {
    throw new Error('Sharp could not encode a resized image');
  }
}

verifySharp().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
JS
SH

EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
    CMD ["node","-e","fetch('http://127.0.0.1:3000/manifest.webmanifest',{signal:AbortSignal.timeout(4000)}).then(async response=>{if(!response.ok||(await response.json()).name!=='CUpedia')process.exit(1)}).catch(()=>process.exit(1))"]
CMD ["node", "server.js"]
