# RailGo API (Chinese railway data) — probing findings (2026-08)

## Hosts
- **Docs only (NOT the API):** `https://api.railgo.dev` — Apifox self-hosted docs site. Every `/api/*` path → `HTTP 302 → /help/index.html` (HTML docs page, empty body). OpenAPI specs at `servers: []` (no base URL declared). Docs index: `/llms.txt`; per-endpoint OpenAPI in markdown at `https://api.railgo.dev/<id>.md` (ids listed in llms.txt, e.g. `366464494e0.md` = train/query).
- **Real API host (V1):** `https://data.railgo.zenglingkun.cn` — found in official client source `RailGoApps/RailGo-WinUI` → `RailGo.Core/Query/Online/DefaultApiUrls.cs` (file literally named DefaultApiUrls.cs).
- **V2 host (per same source):** `https://rg-api.zenglingkun.cn/api/v2/*` (e.g. getTrainDelay, getStationBigScreen). V2 claims a different response format vs V1 — unverified in this session.
- `api.railgo.zenglingkun.cn` does NOT exist as a real API host: served a Tencent CDN default cert (`*.cdn.myqcloud.com`, SNI mismatch). `res.railgo.zenglingkun.cn` is a valid static-resource host (cert CN=railgo.zenglingkun.cn).
- DNS in this environment resolves to fake-ip 198.18.0.x (local proxy) — latency numbers include proxy overhead.

## V1 endpoints — all: HTTP 200, Content-Type application/json, RAW JSON (no {success,msg,data} wrapper)
| Endpoint | Params | Response shape (observed) |
|---|---|---|
| `/api/train/query` | `train=G1` | dict: bureauName, car, carOwner, diagram, diagramType, numberFull, numberKind, rundays, runner, timetable, type (~2.5 KB) |
| `/api/train/sts_query` | `from=BJP`, `to=VNP`, `date=YYYYMMDD` (docs mark date required) | `[]` empty array for ALL tested combos (BJP→VNP/SHH, VNP→SHH, SHH→BJP, with and without date=20260807). Data-availability issue, NOT an error — try a past date with known traffic next time |
| `/api/station/preselect` | `keyword=新余` (URL-encoded via --data-urlencode) | list of station dicts: belong, bureau, city, level, lines, name, pinyin, pinyinTriple, province, telecode, tmism, trainList, type (4 hits for 新余; first = 新余/XUG) |
| `/api/station/query` | `telecode=XBG` | dict with keys `data` (station detail incl. name 新余北, telecode, trainList) + `trains` (list of ~70 stopping trains: arrive, depart, fromStation{station,stationTelecode}, indexStopThere, number, numberFull, numberKind, stopTime, toStation, type) — NOT the flat object the OpenAPI example suggests (~21 KB) |
| `/api/train/preselect` | `keyword=G1` | list of train-number strings incl. 复车次 like `G100/G97` (668 items for G1) |
| `/api/lucky` | none | dict: departTime, fromStation{name,pinyin}, number, toStation{name,pinyin} (e.g. D1642 运城北→青岛北 10:29) |

Observed latencies (through local proxy): 0.19–0.63s. No API key required.

## V2 endpoints — ALL VERIFIED on `rg-api.zenglingkun.cn` (2026-08-07 follow-up; the docs host 302-blocked everything, but the real host works)
Docs host `api.railgo.dev/api/v2/*` → every path HTTP 302, empty body, `Location: /help/index.html` (docs-only WAF; browser also 302s). **BUT on the real V2 host `https://rg-api.zenglingkun.cn` all endpoints return 200 JSON with the `{success, msg, data}` wrapper** (root `/` → 404 `{"data":null,"msg":"Endpoint not found.","success":false}` — that wrapper shape IS the API's fingerprint):

| Endpoint | Params (real) | Verified result |
|---|---|---|
| `/api/v2/getTrainMain` | `trainNum=G1` (date opt) | 200 success:true, data {bureau H, bureauShortName 上局, car CR400BF-S, carOwner, numberFull, numberKind, rundays, runner, spend, timetable[7]} |
| `/api/v2/getTrainDelayAll` | `trainNum=G1` | 200 data [{delayStatus 正点, delayStatusCode ON_TIME, delayTime 0, planArriveTime, planDepartTime, stationName 北京南, stationTelecode VNP}] |
| `/api/v2/getStationBigScreen` | `stationTelecode=BJP` (kind opt) | 200 data [{bigScreenPort, bigScreenStatus 候车, bigScreenStatusCode WAITING, time, timeDelay, trainNum C115, trainStartStation 北京, trainEndStation 秦皇岛}] |
| `/api/v2/getExit` | `trainNum=G1` + `stationTelecode=VNP` (date, kind opt) | 200 data {entrance [], exit [], platform ""} (empty for VNP — station has no gate data; not an error) |
| `/api/v2/getCoachPic` | **`train`** (NOT trainNum) | 200 data {carCode CR400BF-S-3169, carInfo [{picOrder, pictureName, pictureUrl}], carPic, carType, coachDetailPicList} |
| `/api/v2/mapLine` | **`train`** (NOT trainNum; docs mark optional but server REQUIRES it) | 200 data {stations, train} (29.5KB for G1; GCJ-02) |

**Error behavior (verified):**
- `getTrainMain?trainNum=NOTREAL999` → HTTP 400 `{"data":null,"msg":"Train data doesn't exist","success":false}` (matches docs)
- Missing required param → HTTP 400 `{"data":null,"msg":"Missing required param 'train'.","success":false}` (or `'stationTelecode'`)
- `getCoachPic`/`mapLine` param is `train`; other V2 endpoints use `trainNum` — **param-name drift between endpoints is real, verify per endpoint**
- Note: client source references `getTrainDelay` (no All suffix) for the delay API, but `getTrainDelayAll` works on this host

Latency: 0.19–0.36s per V2 call. Wrapper checked by CLI: `success:false` → error with `msg`.

## V2 OpenAPI facts (from `479755220e0.md` etc. — schema, not observed)
| Endpoint | Params | Documented data shape |
|---|---|---|
| `/api/v2/getExit` | trainNum, stationTelecode, date opt, kind opt (arrival\|departure, default departure) | {entrance: [], exit: [], platform: string} |
| `/api/v2/getTrainDelayAll` | trainNum | [{delayStatus, delayStatusCode, delayTime, stationName, stationTelecode}] |
| `/api/v2/getStationBigScreen` | stationTelecode, kind opt | [{bigScreenStatus, bigScreenStatusCode, bigScreenPort, time, timeDelay, trainNum, trainStartStation, trainEndStation}] |
| `/api/v2/getTrainMain` | trainNum, date opt (YYYY-MM-DD or YYYYMMDD) | {bureau, bureauShortName, car, carOwner, numberFull, numberKind, rundays, runner, spend, timetable:[{arrive, day, depart, runTime, station, stationTelecode, stopTime, trainCode}]} |
| `/api/v2/getCoachPic` | train | {carCode, carInfo:[{picOrder, pictureName, pictureUrl, pictureValue}], carPic, carType, coachDetailPicList} |
| `/api/v2/mapLine` | train **OPTIONAL** per docs | {stations:[{站名:[lon,lat]}...]} GCJ-02, response can be 90KB+ |

Delay-status codes: ON_TIME / ON_TIME_PREDICTION / DELAY / DELAY_PREDICTION / EARLY / EARLY_PREDICTION / MAINTAINCE_MISSING. Big-screen codes: WAITING / CANCELED / CHECK_BEGIN / CHECK_STOP / ON_TIME / DELAY / EARLY. Docs state V2 latency ~1s server+network — set 30–60s timeouts.

## Not-yet-verified (honest gap)
- ~~`sts_query` returned `[]` for all tested combos (BJP→VNP/SHH, VNP→SHH, SHH→BJP, ±date) — likely a data-availability quirk~~ **RESOLVED 2026-08-07**: `sts_query` works when `date` is present — `from=SZQ to=GGQ date=20260807` → 47 trains (first C7004). The earlier `[]` results were either missing-date (API silently returns `[]` without date despite docs marking it required) or genuinely trainiess combos. Rule: always send `date` (default today).
- V1 error shapes: only `train/query` missing-param 400 `{"error":"缺少train参数"}` was observed; the other V1 endpoints' error branches not probed individually (low risk — CLI treats any non-200/parse failure uniformly).

## Station name ↔ telecode mapping (2026-08-07, rail-cli v0.3.0)
Station-position params (`sts`/`station query`/`screen`/`exit`) accept Chinese names or telecodes. Findings that made this possible:
- **Canonical all-stations source: 12306 official station table** `https://kyfw.12306.cn/otn/resources/js/framework/station_name.js` (~168KB, plain text). Entry format `@<key>|<站名>|<电报码>|<拼音>|<简拼>|...` (pipe-separated, `@`-delimited). ~3382 stations, **name→telecode unique**, and **telecodes match RailGo exactly** (深圳北 IOQ, 广州东 GGQ, 新余北 XBG, 南京南 NKH — spot-checked). Bundled as `rail_cli/stations.json` (~56KB); generator `tools/gen_stations.py`; install.sh copies the whole package dir so the data ships automatically.
- **No full-list endpoint on RailGo**: `preselect` with empty keyword → `[]`.
- **`preselect` exact-name ordering**: full name (`深圳北`) → exact match first; but suffix NOT tolerated (`深圳北站` → `[]`) — resolver must strip trailing `站` before querying.
- Resolver algorithm (rail-cli `station.py`): `^[A-Za-z]{3}$` → telecode passthrough (backward compat, incl. lowercase); else mapping exact match (with 站-suffix alias); else preselect fallback (exact-name wins; 1 hit → use; many hits → list `name(code)` candidates + exit 1; 0 hits → not-found error).

## Docs quirks
- `sts_query` `date` param documented as `required: true` (example 20251024) but omitted-date call still returned 200 `[]`.
- Intro doc (`9008992m0.md`): no key, no explicit rate limit, non-commercial use only; telecode escaping rule (e.g. 徐州东 `-UUH/` — strip trailing `/` before sending); date format flexibility (MMdd, yyyy-MM-dd, etc.).
