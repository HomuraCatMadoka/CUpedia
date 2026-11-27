# Run and compare performance experiments

Use the same read-only scenarios to establish a baseline, reproduce a slow request, or compare two versions. The [initial scenarios](../../scripts/performance-scenarios.json) cover course search, course detail, an anonymous Wiki article, and the manifest as a static control.

## Start an isolated preview

From a clean checkout with Node 20, pnpm, project dependencies and Nginx installed, start the local PostgreSQL service once with `docker compose up -d --wait db`. In a fresh terminal for each worktree, use the commands below. Each preview uses a new test database, build directory, loopback ports and logs. Keeping the build directories separate also keeps Next.js's file-based data cache separate.

```sh
set -e
perf_id="$(openssl rand -hex 6)"
export DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5433/cupedia_perf_${perf_id}_e2e"
export NEXT_DIST_DIR=".next-e2e-shard-perf-$perf_id"
perf_ports="$(
  node --input-type=module <<'JS'
import { once } from "node:events";
import { createServer } from "node:net";

const servers = [createServer(), createServer()];
const ports = [process.env.CUPEDIA_PERF_APP_PORT, process.env.CUPEDIA_PERF_PROXY_PORT];
try {
  await Promise.all(servers.map((server, index) => {
    const ready = once(server, "listening");
    server.listen(Number(ports[index] ?? 0), "127.0.0.1");
    return ready;
  }));
  console.log(servers.map((server) => server.address().port).join(" "));
} finally {
  servers.forEach((server) => server.close());
}
JS
)"
read -r perf_app_port perf_proxy_port <<EOF
$perf_ports
EOF
export CUPEDIA_PERF_APP_PORT="$perf_app_port" CUPEDIA_PERF_PROXY_PORT="$perf_proxy_port"
export CUPEDIA_PERF_PROXY_URL="http://127.0.0.1:$perf_proxy_port"
export AUTH_SECRET="$(openssl rand -hex 32)"
export AUTH_URL="$CUPEDIA_PERF_PROXY_URL"
export SKIP_EMAIL_WHITELIST=false BREVO_API_KEY=
export MINIO_ENDPOINT=127.0.0.1 MINIO_PORT=19094
export MINIO_ACCESS_KEY=preview-only MINIO_SECRET_KEY=preview-only
export MINIO_BUCKET=cupedia-perf-public MINIO_PRIVATE_BUCKET=cupedia-perf-private
export MINIO_PUBLIC_URL=http://127.0.0.1:19094/cupedia-perf-public
export CUPEDIA_PERF_LOG=1 NEXT_TELEMETRY_DISABLED=1
export CUPEDIA_NGINX_PREFIX="$(mktemp -d)"
export CUPEDIA_NGINX_CONFIG="$CUPEDIA_NGINX_PREFIX/nginx.conf"
mkdir -m 700 "$CUPEDIA_NGINX_PREFIX/logs"
sed -e "s/127\.0\.0\.1:13135/127.0.0.1:$perf_app_port/" \
  -e "s/127\.0\.0\.1:13134/127.0.0.1:$perf_proxy_port/" \
  deploy/performance/nginx.conf >"$CUPEDIA_NGINX_CONFIG"

node --import tsx e2e/provision.ts
pnpm build
node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port "$perf_app_port" \
  >"$CUPEDIA_NGINX_PREFIX/logs/app.log" 2>&1 &
perf_app_pid=$!
nginx -p "$CUPEDIA_NGINX_PREFIX/" -c "$CUPEDIA_NGINX_CONFIG" -t
nginx -p "$CUPEDIA_NGINX_PREFIX/" -c "$CUPEDIA_NGINX_CONFIG"
curl --fail --silent --retry 8 --retry-connrefused --output /dev/null \
  "$CUPEDIA_PERF_PROXY_URL/manifest.webmanifest"
kill -0 "$perf_app_pid"
```

The four read-only scenarios use local storage placeholders and send no email. See the [testing guide](../development/testing.md) for the seed and the [preview proxy instructions](../../deploy/performance/README.md) for logging and rotation.

## Capture and compare

Run twice from the same preview to establish ordinary variation. To compare versions, stop the first preview before starting the next. Reuse `CUPEDIA_PERF_APP_PORT` and `CUPEDIA_PERF_PROXY_PORT` in the next terminal so the origin stays the same. Seed the same fixtures and keep the probe, connection settings and warm-up procedure comparable.

```sh
pnpm perf:experiment run \
  --base-url "$CUPEDIA_PERF_PROXY_URL" \
  --scenarios scripts/performance-scenarios.json \
  --revision "$(git rev-parse --short HEAD)" \
  --environment "${CUPEDIA_PERF_ENVIRONMENT:-docker-preview-pg17}" \
  --probe local-loopback --fixture e2e-seed \
  --warmup 1 --samples 9 --change preview-baseline \
  --origin-log "$CUPEDIA_NGINX_PREFIX/logs/origin.jsonl" \
  --app-log "$CUPEDIA_NGINX_PREFIX/logs/app.log" \
  --out "$CUPEDIA_NGINX_PREFIX/baseline.json"
# Repeat with --change same-revision-repeat and --out "$CUPEDIA_NGINX_PREFIX/rerun.json".
pnpm perf:experiment compare \
  "$CUPEDIA_NGINX_PREFIX/baseline.json" "$CUPEDIA_NGINX_PREFIX/rerun.json"
```

The runner sends anonymous GET requests, checks status and content, and records one warm-up request before each measured group. It runs the same scenario serially and in groups of three concurrent requests. It records client time to response headers and time to finish reading the body. Label a version comparison with `--change` so the report says what changed. Keep the baseline JSON and comparison together. Check the origin and application match counts to see which samples joined their log records. Expect only origin matches for the manifest.

For a new scenario, add a unique, non-sensitive label as its ID, a fixed preview path, an allowed route label, the expected status and a stable content marker. Use the [shared route labels](../../scripts/performance-route-labels.mjs) in reports. To add a route group, update that list and the proxy's route map together.

Check `comparable`, `differentConditions` and the warm-up failure counts before using the differences. A warm-up failure suppresses the affected group's deltas. The run exits with an error if any content or status check fails and leaves the report for diagnosis.

Log records must match the request ID and fall inside the client's request window, with up to one second of clock skew. Sync clocks before comparing records from different machines. Cached responses with a positive `Age` or a Cloudflare cache hit are left out of log joins. Application records need a stage timestamp. When both logs are provided, an application match also needs a matching origin record.

When finished, stop the proxy as shown in its [instructions](../../deploy/performance/README.md) and stop the preview app with `kill "$perf_app_pid"`. Keep the baseline and comparison for the next run.

## Isolated replay on 2026-11-27

The [baseline](artifacts/performance/934-isolated-preview.baseline.json) and [comparison](artifacts/performance/934-isolated-preview.comparison.json) were captured at 11:11 Hong Kong time. Both used Node 20.20.2, a Next.js 16.2.6 production build, Nginx and a fresh PostgreSQL 18 cluster with E2E seed data. The preview used separate loopback ports. A different origin or fixture requires a fresh baseline. The test build disabled the persistent webpack cache to fit local disk space.

Each run passed 72 measured requests and 8 warm-ups. All measured requests matched an Nginx row, and all 108 measured dynamic requests across the two runs matched their application stages. The same build was used twice, so the differences below show timing variation under matching conditions.

| Scenario      | Serial median, baseline → repeat | Three concurrent, baseline → repeat |
| ------------- | -------------------------------- | ----------------------------------- |
| Course search | 11.43 → 7.36 ms                  | 20.65 → 15.93 ms                    |
| Course detail | 6.81 → 5.53 ms                   | 16.89 → 13.16 ms                    |
| Wiki article  | 13.45 → 10.84 ms                 | 32.12 → 29.74 ms                    |
| Manifest      | 1.84 → 1.04 ms                   | 2.19 → 1.59 ms                      |

These two sample request IDs show how to connect client time to response headers, Nginx's upstream header time, and an application stage in the baseline.

| Scenario      | Request ID                         | Client headers | Nginx upstream headers | Application stage   |
| ------------- | ---------------------------------- | -------------- | ---------------------- | ------------------- |
| Course detail | `2876d38b61bfae218c8b99afde5d9c7c` | 7.04 ms        | 7 ms                   | `detail` · 2.45 ms  |
| Wiki article  | `dd6ba5ee694332d6cf3785d7eac823ee` | 15.58 ms       | 15 ms                  | `article` · 0.28 ms |

Nginx times have millisecond granularity. The browser displayed the three dynamic pages. Direct and proxy cache headers matched, and known requests matched the origin report's status, count and byte totals across log rotation. Test query and cookie values stayed out of the structured logs and reports.

Separate loopback tests confirmed that cached responses and out-of-window log rows do not join, and that failed warm-ups suppress the affected comparisons.

Two concurrent previews with separate database fixtures, build directories and Nginx logs each displayed only their own course title. Their request IDs appeared only in the corresponding origin log.

## Diagnose a change

1. Use the same time window in Cloudflare and the [origin report](../../deploy/performance/README.md). Check requests, response bytes, and errors by route. The origin report covers requests that reached Nginx. If the client times out after Nginx logs a complete response, compare the delivery path from the edge to the client.
2. Select a slow sample in the experiment report. Its request ID joins the client result, Nginx timing and any named application stages. Course search times the result and subject reads. Course detail times the consolidated loader. Wiki records article, viewer, tree, discussions and backlink reads where those branches run. The manifest provides a static control.
3. Compare the slow stage with the database or container metrics for the same time window. Application stages measure elapsed time and can overlap. The database pool field is the larger queue snapshot at the start or end of each stage. If database query statistics are available, use their execution times as a separate signal. Read container CPU alongside these timings.
4. Change one factor, such as a query or a cache rule, then rerun. Keep account state, warm-up and concurrency comparable. If controls or conditions changed, investigate those differences before interpreting latency deltas. Run concurrency experiments on preview. Use low-frequency read-only requests and passive observation on the live site.

The origin log uses fixed route labels and omits raw request paths, search values, cookies and bodies. Sample reports hold only the timing fields used for comparison. Share the reports and keep the underlying logs in the private preview log directory.
