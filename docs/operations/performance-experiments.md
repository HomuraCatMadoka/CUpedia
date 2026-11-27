# Run and compare performance experiments

Use the same read-only scenarios to establish a baseline, reproduce a slow request, or compare two versions. The [initial scenarios](../../scripts/performance-scenarios.json) cover course search, course detail, an anonymous Wiki article, and the manifest as a static control.

## Start an isolated preview

From a clean checkout with Node 20, pnpm, project dependencies and Nginx installed, start a dedicated E2E database. The seed step resets that database.

```sh
docker compose up -d --wait db
export DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5433/cupedia_performance_e2e
export AUTH_SECRET="$(openssl rand -hex 32)"
export AUTH_URL=http://127.0.0.1:13134
export SKIP_EMAIL_WHITELIST=false BREVO_API_KEY=
export MINIO_ENDPOINT=127.0.0.1 MINIO_PORT=19094
export MINIO_ACCESS_KEY=preview-only MINIO_SECRET_KEY=preview-only
export MINIO_BUCKET=cupedia-perf-public MINIO_PRIVATE_BUCKET=cupedia-perf-private
export MINIO_PUBLIC_URL=http://127.0.0.1:19094/cupedia-perf-public
export CUPEDIA_PERF_LOG=1 NEXT_TELEMETRY_DISABLED=1
export CUPEDIA_NGINX_PREFIX="$(mktemp -d)"
mkdir -m 700 "$CUPEDIA_NGINX_PREFIX/logs"

node --import tsx e2e/provision.ts
pnpm build
pnpm start --hostname 127.0.0.1 --port 13135 >"$CUPEDIA_NGINX_PREFIX/logs/app.log" 2>&1 &
perf_app_pid=$!
nginx -p "$CUPEDIA_NGINX_PREFIX/" -c "$PWD/deploy/performance/nginx.conf" -t
nginx -p "$CUPEDIA_NGINX_PREFIX/" -c "$PWD/deploy/performance/nginx.conf"
curl --fail --silent --retry 8 --retry-connrefused --output /dev/null \
  http://127.0.0.1:13134/manifest.webmanifest
```

The four read-only scenarios use local storage placeholders and send no email. See the [testing guide](../development/testing.md) for the seed and the [preview proxy instructions](../../deploy/performance/README.md) for logging and rotation.

## Capture and compare

Run twice from the same checkout and preview to establish ordinary variation. For a comparison between versions, build the tested version and label it accordingly. Keep the data, probe machine, connection settings, and warm-up protocol comparable.

```sh
pnpm perf:experiment run \
  --base-url http://127.0.0.1:13134 \
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

For a new scenario, add a unique ID, a fixed preview path, a normalized route template, the expected status and a stable content marker. Update the proxy and origin reporter when introducing a new route group. Choose a route template with placeholders for resource IDs.

Check `comparable` and `differentConditions` before using the differences. A failed content or status check makes the run exit with an error and leaves the report for diagnosis.

When finished, stop the proxy as shown in its [instructions](../../deploy/performance/README.md) and stop the preview app with `kill "$perf_app_pid"`. Keep the baseline and comparison for the next run.

## Isolated replay on 2026-11-27

The [baseline](artifacts/performance/934-isolated-preview.baseline.json) and [comparison](artifacts/performance/934-isolated-preview.comparison.json) were captured at 10:46 Hong Kong time. Both used Node 20.20.2, a Next.js 16.2.6 production build, Nginx and a fresh PostgreSQL 18 cluster with E2E seed data. The preview used separate loopback ports. A different origin or fixture requires a fresh baseline. The test build disabled the persistent webpack cache to fit local disk space.

Each run passed 72 measured requests and 8 warm-ups. All measured requests matched an Nginx row, and all 108 measured dynamic requests across the two runs matched their application stages. The same build was used twice, so the differences below show timing variation under matching conditions.

| Scenario      | Serial median, baseline → repeat | Three concurrent, baseline → repeat |
| ------------- | -------------------------------- | ----------------------------------- |
| Course search | 10.51 → 7.09 ms                  | 20.60 → 15.95 ms                    |
| Course detail | 6.64 → 5.52 ms                   | 16.56 → 13.91 ms                    |
| Wiki article  | 13.14 → 11.21 ms                 | 30.75 → 29.66 ms                    |
| Manifest      | 1.26 → 1.31 ms                   | 2.04 → 1.60 ms                      |

These two sample request IDs show how to connect client time to response headers, Nginx's upstream header time, and an application stage in the baseline.

| Scenario      | Request ID                         | Client headers | Nginx upstream headers | Application stage   |
| ------------- | ---------------------------------- | -------------- | ---------------------- | ------------------- |
| Course detail | `9d93baf6cc1a32a14086bad44019c71c` | 6.64 ms        | 7 ms                   | `detail` · 2.39 ms  |
| Wiki article  | `c71711710c9e2997af1419de75220ce1` | 16.17 ms       | 16 ms                  | `article` · 0.26 ms |

Nginx times have millisecond granularity. The browser displayed the three dynamic pages. Direct and proxy cache headers matched, and six known requests matched the origin report's status, count and byte totals across log rotation. Test query and cookie values stayed out of the structured logs and reports.

## Diagnose a change

1. Use the same time window in Cloudflare and the [origin report](../../deploy/performance/README.md). Check requests, response bytes, and errors by route. The origin report covers requests that reached Nginx. If the client times out after Nginx logs a complete response, compare the delivery path from the edge to the client.
2. Select a slow sample in the experiment report. Its request ID joins the client result, Nginx timing and any named application stages. Course search times the result and subject reads. Course detail times the consolidated loader. Wiki records article, viewer, tree, discussions and backlink reads where those branches run. The manifest provides a static control.
3. Compare the slow stage with the database or container metrics for the same time window. Application stages measure elapsed time and can overlap. The database pool field is the larger queue snapshot at the start or end of each stage. If database query statistics are available, use their execution times as a separate signal. Read container CPU alongside these timings.
4. Change one factor, such as a query or a cache rule, then rerun. Keep account state, warm-up and concurrency comparable. If controls or conditions changed, investigate those differences before interpreting latency deltas. Run concurrency experiments on preview. Use low-frequency read-only requests and passive observation on the live site.

The origin log uses fixed route labels and omits raw request paths, search values, cookies and bodies. Sample reports hold only the timing fields used for comparison. Share the reports and keep the underlying logs in the private preview log directory.
