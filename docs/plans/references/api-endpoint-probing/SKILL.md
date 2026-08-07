---
name: api-endpoint-probing
description: "Probe REST APIs with curl: verify base URL, shape, errors."
related_skills: [api-docsite-to-cli, bash-cli-patterns]
---

# API Endpoint Probing

Verify that REST API endpoints actually work before building on them: confirm the real base URL, run real requests, record status/latency/JSON shape, probe error behavior, and produce a feasibility report. Especially for public APIs with only docs and no official SDK.

## Workflow

### 1. Confirm the base URL serves the API (not just docs)
Many API "base URLs" are actually documentation sites (Apifox self-hosted docs, ReadMe, etc.). Any unknown path gets 302-redirected to the docs index.

- Probe a documented path with headers: `curl -s -I "https://HOST/api/endpoint?param=x"` and inspect the `Location:` header.
- If `location: /help/index.html`, `/docs/`, or any HTML page → this host is **docs-only**. The real API lives elsewhere.
- Header fingerprints of a docs/WAF front (not the API backend): `x-doc-selfhost: true`, `x-waf-access`, `x-waf-client-ip`.
- Docs index often at `https://HOST/llms.txt`; per-endpoint OpenAPI specs may be published as markdown (`https://HOST/<id>.md`) with full parameter schemas + examples.

### 2. Find the real API base URL
- OpenAPI `servers:` is frequently **empty** (`servers: []`) — never assume the docs host is the API host.
- **Search official client source code on GitHub — high-yield move:**
  ```bash
  # find client repos for the org/product (repos search needs NO auth)
  curl -s "https://api.github.com/search/repositories?q=ORG+in:name,description" | jq -r '.items[]?.full_name'
  # list repo files (git trees API is open; code-search API is NOT — it 401s unauthenticated)
  curl -s "https://api.github.com/repos/ORG/REPO/git/trees/main?recursive=1" | jq -r '.tree[].path'
  ```
  Then fetch config-ish files (`*ApiUrls*.cs`, `config.py`, `settings*.json`, `*.js` with URL constants) and grep for `https://` host constants. A file literally named `DefaultApiUrls.cs` is the jackpot.
- **Mine the docs site's own HTML/JS config — equally high-yield, no GitHub needed:** Apifox self-hosted docs embed a huge Remix JS config dump in every page that can leak hidden backend host tokens (e.g. `data.<brand>.zenglingkun.cn`). Grab a doc page and regex for the brand name:
  ```bash
  curl -s https://HOST/<docpage> -o /tmp/doc.html
  python3 -c "import re; html=open('/tmp/doc.html').read(); print(sorted(set(re.findall(r'[a-zA-Z0-9.-]*BRAND[a-zA-Z0-9.-]*', html))))"
  ```
  Then sanity-check any `data.*` / `api.*` / `*-api.*` token as a candidate backend with a real query.
- Sanity-check candidate hosts with a real query: nginx 404 HTML, a CDN default cert (SNI mismatch), or connection reset all mean "wrong host". More fingerprints, see Pitfalls (waitress/520, 418 Host-rejection).

### 3. Probe each endpoint (success case)
```bash
curl -s --get --max-time 30 --data-urlencode 'train=G1' \
  -w '\nHTTP:%{http_code} TIME:%{time_total} CT:%{content_type} SIZE:%{size_download}\n' \
  https://HOST/api/train/query
```
Record per endpoint: HTTP status, latency (s), Content-Type, top-level JSON keys, wrapped vs raw.

### 4. Classify the JSON shape
```bash
python3 -c "
import json
d=json.load(open('FILE'))
if isinstance(d,dict): print('dict keys:', list(d.keys()))
elif isinstance(d,list): print('list len:', len(d), '| elem:', type(d[0]).__name__ if d else None)"
```
Key distinction: **raw JSON** (no wrapper) vs **wrapped** `{success, msg, data}`. Some APIs are raw in V1 and wrapped in V2 — verify per version rather than assuming.

### 5. Probe error behavior
Two probes per endpoint: (a) invalid value (`param=ZZZ999`), (b) missing a required param. Record the HTTP status AND the actual error JSON shape (`{code, msg}` or whatever really comes back). Run the calls — never fabricate error shapes.

### 6. Non-ASCII params (Chinese etc.)
Always `curl --get --data-urlencode 'keyword=新余'` — never paste raw non-ASCII into the URL. `--data-urlencode` percent-encodes correctly and is also the safe way to pass values containing `&`, `=`, spaces.

### 7. Fuzzy-search endpoints: probe behaviors before building a resolver on them

When an endpoint is a keyword/fuzzy search (`station/preselect` style) and you plan to use it as a name→id resolution fallback, probe these before designing the resolver:

- **Empty keyword → `[]`** usually means there is NO full-list enumeration endpoint — you cannot crawl all entities via search. A bundled offline mapping (from the data owner's canonical source, e.g. 12306 station table for railway telecodes) is then required.
- **Suffix intolerance**: fuzzy endpoints often reject user-style suffixes (`深圳北站` → `[]`, while `深圳北` matches). The resolver must strip aliases (trailing `站`) BEFORE querying.
- **Exact-name ordering**: a full-name keyword returns the exact match first — exploitable as "exact match wins" in the resolver.
- **Candidates can be huge** (`keyword=塘` → 40+ stations) — when resolving, list `name(code)` candidates and exit 1 on ambiguity rather than picking arbitrarily.

## Pitfalls
- **302 empty-body on ALL `/api/*` paths is a docs-only WAF, not a per-route issue** — when even browser UA + Referer + cookies from the root page still 302 to `/help/index.html`, stop hammering the path variants: the host simply doesn't serve the API. Browser navigation is NOT an automatic bypass — a real Chrome session hits the same 302.
- **`Host:` header override → HTTP 418** = WAF vhost rejection. Some CDN fronts only accept the SNI-matched Host; overriding Host to probe virtual-host routing gets you 418, not the backend.
- **HTTP 520 + JSON body + `server: waitress`** = a REAL Python backend answering at its root (e.g. `{"msg":"...官方数据API"}`), but all `/api/*` paths return waitress's default 404 and `/docs`/`/openapi.json` also 404 → the API routes aren't mounted THERE; the API may live on a sibling host (railgo: V1 on `data.*`, V2 on `rg-api.*`). Keep hunting — probe sibling subdomains before concluding the API is down.
- **`--resolve` to a fake-ip (198.18.x.x) is useless** — in proxied environments the fake IP is a proxy marker, not a routable address; curl gets `META:000`/connection failure. Don't waste a probe round on it.
- **GitHub code-search API 401s unauthenticated** — use the repositories search API + git trees API (both open) and fetch candidate files raw instead.
- **HTTP 200 + empty array `[]` is NOT an error** — frequently a data-availability issue (out-of-range/future date, no trains that day). Report it as an observation, not a failed probe; try several known-good param combos before concluding.
- **A silent empty array can ALSO mean a REQUIRED param was omitted** — rail-cli's `sts_query` marks `date` as `required: true`; calling without it returned a clean `[]` (HTTP 200) that looked exactly like "no direct trains", when the real cause was the missing param. Rule: if the docs list a param as required, send it (or a sensible default) BEFORE trusting an empty/odd response. Cross-check the OpenAPI `required:` list against the request you actually sent.
- Docs may mark a param `required` that the API tolerates being missing — and vice versa. Test both.
- `servers: []` in OpenAPI = base URL undeclared; recover it from client source, not from the docs.
- Fake-IP DNS answers (198.18.x.x) mean traffic goes through a local proxy (Clash-style); recorded latency includes proxy overhead — don't over-interpret millisecond differences.
- Distinguish "docs example shape" from "actual response shape" — real responses routinely add/restructure keys (e.g. a documented flat object coming back as `{data, trains}`).
- If the session runs out of steps mid-probe, honestly mark which error probes were NOT executed; don't extrapolate error shapes.

## Session references
- `references/railgo-api.md` — RailGo (Chinese railway data API): docs host vs real host, all 6 V1 endpoint shapes + latencies, V2 endpoint schemas + WAF-blocked probing results (302 on all paths, waitress/520 backend fingerprint), quirks, **station name↔telecode mapping** (12306 station table source, preselect behaviors, resolver pattern, sts_query date requirement resolved).

## Verifying via parallel subagents (rail-cli pattern)
When probing many endpoints at once, dispatch 3 parallel leaf subagents (V1 group / V2 group / local environment). Proven practices:
- **Pre-probe inputs yourself first**, then hand each subagent a concrete test matrix (real telecodes, a real train number, exact commands) — otherwise subagents guess params and their results are meaningless.
- **Never let verification subagents use `execute_code`** — it requires interactive user consent a leaf subagent can never obtain; the call gets BLOCKED and the subagent stalls. Instruct them to use `terminal` only, redirecting large JSON payloads to files (`cmd > /tmp/out.json`, then parse a compact summary).
- **Cross-verify key claims yourself** with direct curl after the batch — subagent self-reports can be wrong (rail-cli's V2 subagent reported "all endpoints fail" because it never found the real host; direct curl proved otherwise).
- Distinguish "API semantic OK" from CLI bugs: empty arrays / placeholder data (`["--"]`) for endpoints without data are API behavior, not client failures.
