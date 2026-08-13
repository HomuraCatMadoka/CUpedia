# CU Bus 数据源调研 Handoff

**日期**：2026-08-11
**工作树**：`wt/campus-transport-truth-model`
**用途**：交给后续 agent 的只读交接。研究副本 only；无开放再分发许可。

---

## 一句话结论

- **计划起点发车**：只信官方 transport.cuhk.edu.hk（本仓已 merge + expand）。
- **中间站到站时刻**：官方**没有**；仅 App / Anson 预计算，不能当 official Stop time。
- **App v1.18 班次与官方对齐**；**Anson 1A/1B 班次过时**；Flippy 无班次。
- **无** GTFS / GTFS-RT / data.gov.hk 校巴包；CU Bus App Firebase RTDB 401。

---

## 数据落点（绝对相对路径均以仓库根为准）

| 源           | 路径                                                                    | 内容                                          |
| ------------ | ----------------------------------------------------------------------- | --------------------------------------------- |
| 官方 merge   | `docs/campus-transport/data/cuhk-public-data/merged.snapshot.json`      | 14 线、band、pattern、50 sourceSnapshots      |
| 官方起点发车 | `docs/campus-transport/data/schedules/all-origin-departures.{json,csv}` | **432** origin-only 候选                      |
| 第三方目录   | `docs/campus-transport/data/third-party/`                               | README + provenance + 三源                    |
| Anson CUBus  | `.../third-party/cubus-anson/`                                          | Route/gps/timetable/translation（约 2024-10） |
| Flippy 2023  | `.../third-party/flippy/announcement_CU_171.{db,sql}`                   | 22 线站序+坐标，含 Info Day                   |
| CU Bus App   | `.../third-party/cu-bus-app/`                                           | `raw/cubus.db` + `export/*` + README          |
| 冲突审查     | `.../third-party/cross-source-conflict-review.{md,json}`                | 多源冲突结论                                  |
| 复现脚本     | `scripts/cuhk-bus-public-data-merge.ts`                                 | 官方 merge，PARSER `cuhk-public-data-merge/6` |
|              | `scripts/cuhk-bus-expand-departures.ts`                                 | band → origin 发车                            |
|              | `scripts/cuhk-bus-cross-source-review.py`                               | 多源冲突                                      |

**排除**：Bus Clock（`CUHK-bus-clock`）不进第三方目录；官方 merge 的 sourceSnapshots 里可能仍有 4 条历史引用。

---

## 各源能干什么 / 不能干什么

### 1. 官方（Transport Office）

- **有**：线路 HTML/PDF、起点服务时段 + 发车分钟、站序 pattern、通告索引、部分坐标候选（Campus Map / OSM 已并进 merge）。
- **没有**：逐站 Stop time、实时车位、GTFS。
- **权威字段**：`scheduleBands`（`start/end/departureMinutes`）、`officialMapEvidence.routePatterns`。
- **解析注意**：发车分钟只从 `.rb-large` 取；备注走 `departureRemarkRaw`，勿混入分钟。

### 2. CU Bus App（`com.carsonwah.cubus` v1.18）

- 来源：用户提供 APKPure XAPK → 解出 `assets/cubus.db`。
- 表：`route` 19、`stop` 35、`arrival_schedule` 5069、`route_segment` 1606、`operating_day` 2588。
- 路线 ID：`1A,1B,2,2_sir_run_run,3,4,5,5_sat,6A,6A_sat,6B,7,7_sat,8,8_non_teach,H,H_area_39,N,N_postgrad`。
- **1A 与官方一致**：`07:40–18:50` mins `[10,20,40,50]`。
- ETA = 本地 `arrival_schedule` + `operating_day` 日类型过滤；**不是**爬官方 live。
- Firebase `https://cu-bus-app.firebaseio.com` → **401**。
- `arrival_schedule` 示例（1A 首班）：
  uni 07:40:00 → sports 07:41:51 → shaw 07:43:41 → admin 07:45:26 → shho 07:47:51 → terminal 07:49:41。

### 3. AnsonCheng03/CUBus

- GitHub `src/initDatas/*`，本仓 raw 快照 2026-08-11；Route 文件 mtime 约 **2024-10-21**。
- **硬冲突**：1A `07:30–18:40 [20,40]`；1B 结束 18:00 / mins `[0]`。
- 其余 2–8/H/N 的 window/mins 与官方大致一致；H/N/2 用 `#` 变体拆 mins。
- `stations.time` = 邻站 hop 秒（浮点）；`timetable.json` = 按站展开字符串。

### 4. Flippy CU_v1.1（2023-02）

- 报站机路线库：**无班次字段**。
- 22 线：1A–8/N/H 变体 + **Info Day A/B/C/D1/D2**（仅此源）。
- 主键：`RouteList.RouteCode` 是整数；展示用 `OpenDataRouteId`（如 `1A;CU`）；站序 join `RouteStopList.MapStopId = StopList.OpenDataStopId`。

---

## 冲突审查摘要（已落盘）

| 维度           |   数 | 要点                                                   |
| -------------- | ---: | ------------------------------------------------------ |
| 起点班次硬冲突 |    2 | 仅 Anson 1A、1B                                        |
| 站序启发式冲突 |   16 | 多为方向站/WYS↔Res3&4 命名；H/N 官方有 New Asia Circle |
| 坐标 ≥40m      |    6 | 最大 university station ~233m（多泊位混桶）            |
| 邻边秒 ≥30s    | 9 线 | 多为跳站匹配假阳性（如 8 线 AREA39→CCEN）              |

**变体不是冲突**：官方 multi-minute pattern ↔ App/Anson 拆 `*_sat` / `_area_39` / `_postgrad` / `_sir_run_run`。

**仅官方**：PSLB `Up`/`Down`。
**仅 Flippy**：Info Day 专车。

---

## 领域约束（与 CONTEXT.md 对齐）

- **Trip** 需要确认的 origin 发车 + pattern + service day。
- **Stop time** 仅当来源明确给出；**禁止**用固定偏移伪造官方中间站时刻。
- 第三方 `arrival_schedule` / hop 秒只可作 **ETA 先验**，须标注 provenance。
- 坐标多源候选：**人工选点**，禁止静默平均 ≥40m 差异点。

---

## Provenance 要点

- 官方：`url + fetchedAt + sha256 + parserVersion`（merge 内 `sourceSnapshots`）。
- 第三方：`docs/campus-transport/data/third-party/provenance.json`
  - Anson files sha256
  - Flippy db sha256
  - App：xapk / base apk / cubus.db sha256，`CURRENT_DB_VERSION=7`
- App cubus.db sha256：`c0d045c980aee48e66e3d81a88f22eed227bae29a9f56c38ca2320705704cd2d`

---

## 后续 agent 建议顺序

1. 读 `docs/campus-transport/CONTEXT.md` + 本 handoff + `cross-source-conflict-review.md`。
2. 需要计划发车 → 只读 `schedules/all-origin-departures.*` 或重跑 expand 脚本。
3. 需要中间站先验 → App `export/arrival_schedule.json`；**不要**写回 schema 当 official。
4. 需要站序/坐标候选 → App stops + 官方 pattern；Flippy 仅历史/Info Day。
5. 改解析/merge → 升 `PARSER_VERSION`，保留 content-addressed 快照习惯。
6. **不要**默认再分发 APK/DB；不要爬职员专车登录墙；不要把 Bus Clock 当第三方主源 unless 用户明确要求。

---

## 已知未做

- 未把多源结果写入生产 schema / UI。
- 未做真车 GPS 校准（Bus Clock 轨迹未纳入冲突审查）。
- 未解决 Firebase 私有数据（也无授权去绕）。
- 站名归一是启发式；residual alias 可能仍有噪声。

---

## 快速自检命令

```bash
# 官方 origin 条数
python3 -c "import json; d=json.load(open('docs/campus-transport/data/schedules/all-origin-departures.json')); print(len(d['departures']))"

# App 表计数
sqlite3 docs/campus-transport/data/third-party/cu-bus-app/raw/cubus.db "select 'route',count(*) from route union all select 'arrival',count(*) from arrival_schedule;"

# 多源冲突复现
python3 scripts/cuhk-bus-cross-source-review.py
```
