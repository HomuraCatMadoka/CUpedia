# Preview origin logs

Start the isolated Next.js build on `127.0.0.1:13135` as described in the [experiment runbook](../../docs/operations/performance-experiments.md). From the repository root, start the preview proxy with Nginx installed.

```sh
export CUPEDIA_NGINX_PREFIX="$(mktemp -d)"
mkdir -m 700 "$CUPEDIA_NGINX_PREFIX/logs"
nginx -p "$CUPEDIA_NGINX_PREFIX/" -c "$PWD/deploy/performance/nginx.conf" -t
nginx -p "$CUPEDIA_NGINX_PREFIX/" -c "$PWD/deploy/performance/nginx.conf"
```

Use `http://127.0.0.1:13134` for the preview. Nginx generates an `X-Request-Id` for each request and sends the same value to Next.js and to the caller. The proxy passes through the application's caching headers.

The access log is `$CUPEDIA_NGINX_PREFIX/logs/origin.jsonl`. It uses a fixed set of route labels based on Nginx's normalized path. Unknown routes, authenticated course pages, Wiki search, the new Wiki draft page and revision history fall under `other`. The log excludes raw paths, query strings, cookies, IP addresses, headers and bodies. The preview discards Nginx error logs because Nginx can include raw request data in those messages. Keep the log directory private and share aggregated reports by default.

```sh
pnpm perf:origin \
  --log "$CUPEDIA_NGINX_PREFIX/logs/origin.jsonl" \
  --since 2026-11-25T12:00:00+08:00 --until 2026-11-25T13:00:00+08:00
```

The window includes the start and excludes the end. Omit `--until` to end at the time the report starts. The report summarizes request counts, HTTP statuses, 5xx and 429 counts, and response-body bytes. It shows sample count, median and range for total request time, time to receive the upstream response headers, and total upstream response time. Timing fields use seconds and omit unavailable samples. These measurements include elapsed waiting time. They do not measure CPU usage.

## Rotate the access log

On a host with logrotate, copy [the example](origin.logrotate.example) into the host's configuration and replace the paths. It keeps seven daily rotations, compresses older logs, and asks the running Nginx instance to reopen its log file. Use the instance's actual executable, prefix and configuration paths. Set the log directory owner and permissions so that only the operator and Nginx can read the files.

To check rotation on a local preview, rename the log and signal the same Nginx instance to reopen it.

```sh
mv "$CUPEDIA_NGINX_PREFIX/logs/origin.jsonl" "$CUPEDIA_NGINX_PREFIX/logs/origin.jsonl.1"
nginx -p "$CUPEDIA_NGINX_PREFIX/" -c "$PWD/deploy/performance/nginx.conf" -s reopen
```

Send a preview request and check that it appears only in the new log. To report on a window spanning a rotation, add one `--log` per distinct file, including any needed `.gz` files. Missing paths are reported on stderr and the available files are processed. The command exits with an error if it cannot read any log. Malformed rows are skipped and counted without echoing their contents.

Stop Nginx with `nginx -p "$CUPEDIA_NGINX_PREFIX/" -c "$PWD/deploy/performance/nginx.conf" -s quit`. The configuration listens on the local machine for preview experiments. To instrument production, merge the relevant directives into its existing Nginx configuration and use its current rotation mechanism.
