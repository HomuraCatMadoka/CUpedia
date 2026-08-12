# 公开 CU bus 数据（排除 Bus Clock）

抓取日：2026-08-11。本目录只收**网上可直接下载**、且不是 [CUHK-bus-clock](https://github.com/CCheukKa/CUHK-bus-clock) 的来源。

官方第一方快照仍在 `../cuhk-public-data/`；这里是第三方与历史社区数据。

## 结论

| 来源                                                                            | 有没有                                        | 能当什么                                                 | 不能当什么                               |
| ------------------------------------------------------------------------------- | --------------------------------------------- | -------------------------------------------------------- | ---------------------------------------- |
| CUHK 交通处 HTML/PDF/WP REST                                                    | 有，已在官方 merge                            | 当前计划发车、站身份、通告索引                           | 官方逐站到站、实时车位                   |
| CUHK Campus Map JS                                                              | 有，官方 merge 已抓                           | 旧坐标/旧路线图候选                                      | 当前 shape 真值                          |
| OpenStreetMap                                                                   | 有，官方 merge 已抓                           | 坐标候选（ODbL）                                         | 完整校巴运营站表                         |
| [AnsonCheng03/CUBus](https://github.com/AnsonCheng03/CUBus)                     | **有完整 JSON**                               | 社区站码、旧班次展开、站间秒数                           | 当前官方时刻表                           |
| [Megumi-B/Flippy_Routes_Addon](https://github.com/Megumi-B/Flippy_Routes_Addon) | **有 SQLite/SQL**                             | 2023 站序+坐标、开放日专车变体                           | 当前班次                                 |
| CU Bus App（Carson Wah）v1.18                                                   | **有内嵌 `cubus.db`**（本目录 `cu-bus-app/`） | 19 路线变体、35 站坐标、预展开到站、站间秒数、教学日日历 | 官方真值；无开放实时 API（Firebase 401） |
| data.gov.hk / GTFS / hkbus.app                                                  | **无** 校巴数据集                             | —                                                        | 不覆盖中大内部校巴                       |
| 职员专车                                                                        | 登录墙                                        | —                                                        | 不爬                                     |

**没有**官方 GTFS、GTFS-RT 或开放数据许可。

## 1. AnsonCheng03/CUBus（社区应用源数据）

- 仓库：https://github.com/AnsonCheng03/CUBus
- 路径：`src/initDatas/*`（GitHub raw 可下）
- 本地：`cubus-anson/`
- 元数据 `lastModifiedDates.json` 显示 Route/station/gps 约 **2024-10-21**；`timetable.json` 时间戳写 `1970-01-01`（生成物，不是业务生效日）
- 无 LICENSE 文件

| 文件               | 内容                                                    |                   体量 |
| ------------------ | ------------------------------------------------------- | ---------------------: |
| `Route.json`       | 16 条路线/变体：`1A`…`N#`；`schedule` + 站序 + 站间秒数 |              16 routes |
| `timetable.json`   | 按「站\|方向」展开的到站/发车时刻字符串                 | 32 站键，4231 个时刻槽 |
| `gps.json`         | 23 个站码坐标                                           |                     23 |
| `station.json`     | 站码 → 附近建筑别名列表                                 |                     23 |
| `translation.json` | en/zh 站名                                              |                   双语 |
| `notice.json`      | App 自身通知（非交通处通告）                            |                      5 |

### 与 2026-08-11 官方对照（重要）

CUBus 内嵌的 1A：

```text
schedule: 07:30–18:40  every 20, 40
stations: MTR → SPORTC → SHAWHALL → UADM → SHHC → MTR
```

官方当前 1A：

```text
07:40–18:50  every 10, 20, 40, 50
```

→ **CUBus 班次已过时**，只能当历史/社区参考，不能覆盖官方 merge。
站间 `time`（秒）是社区估算（浮点），不是官方 Stop time。

### 实时状态

源码里的 PHP 会爬 `transport.cuhk.edu.hk` 首页 `.hr-status` 写 `Status.json`；那是**运行时服务端产物**，不在本仓库静态 JSON 里。本目录未镜像其线上 API。

## 2. Flippy Routes Addon（报站机路线库，2023-02）

- 发布：https://github.com/Megumi-B/Flippy_Routes_Addon/releases/tag/CU_v1.1
- 本地：`flippy/announcement_CU_171.{db,sql}`
- 基于 2022-08/09 资料，**2023-02-24** 打包
- 用途是 Flippy 报站机，不是乘客时刻表

| 表              | 数量 | 用途                                      |
| --------------- | ---: | ----------------------------------------- |
| `RouteList`     |   22 | 含 1A–8、N、H 变体 + Info Day A/B/C/D1/D2 |
| `StopList`      |   64 | 全部带 lat/lon                            |
| `RouteStopList` |  245 | 路线站序                                  |

无班次分钟/服务时段字段。适合做**历史站序 + 坐标**交叉检查。

## 3. CU Bus App（Carson Wah，闭源 APK 研究提取）

- 包名：`com.carsonwah.cubus`，用户提供 APKPure XAPK **v1.18**
- 本地：`cu-bus-app/`（见该目录 `README.md` + `provenance.json`）
- 核心资产：`assets/cubus.db`
  - 19 routes（含 `_sat` / `_non_teach` / `_area_39` / `_postgrad` 变体）
  - 35 stops + lat/long
  - 5069 `arrival_schedule`（客户端预计算到站，含秒）
  - 1606 `route_segment` 期望秒数
  - 2588 `operating_day`（2023-06-01 … 2030-07-01）
- 1A 与 2026-08-11 官方 band **一致**（`07:40–18:50` / 10,20,40,50）
- 远程：`cu-bus-app.firebaseio.com` **Permission denied**；ETA 走本地库

## 4. 已在官方 merge、非 Bus Clock 的公开源

见 `../cuhk-public-data/merged.snapshot.json` 的 `sourceSnapshots`（共 50，其中 4 条是 Bus Clock，其余 46 条为官方/OSM/校历/假期）：

- WP `route` / `stop` / `newsdetails` REST
- 14 英 + 14 繁路线 HTML
- 7 份 PDF（当前 4 + 2024–25 历史 3）
- Campus Map HTML + `cuhk_location_db.js?20161006`
- 教务处 Almanac、1823 公众假期 JSON
- OSM Overpass

展开后的起点发车：`../schedules/all-origin-departures.csv`（432 条，**仅官方**）。

## 5. 搜过但没有机器可读公开数据

- CU Bus App 的**远程**时刻 API — 无（仅内嵌 DB，见 §3）
- [hkbus.app](https://hkbus.app) — 只做专营巴士，不含中大校巴
- data.gov.hk package_search（CUHK bus / campus shuttle）— **0 结果**
- 香港巴士大典 fandom — 百科叙述，非 feed
- 职员自组巴士 — 登录后才可见，排除

## 多源冲突审查

见同目录：

- `cross-source-conflict-review.md` — 可读结论
- `cross-source-conflict-review.json` — 机器可读明细
- 复现：`python3 scripts/cuhk-bus-cross-source-review.py`

硬冲突摘要：Anson **1A/1B 班次过时**；App 班次对齐官方；站序/坐标/邻边秒数有可解释偏差，见报告。

## 使用边界

1. **计划班次以官方 HTML/PDF 为准**（本仓库 `cuhk-public-data` + `schedules`）。
2. CUBus / Flippy / CU Bus App 只作坐标、别名、历史/社区站序、站间耗时先验。
3. 第三方文件无明确开放数据许可；本地只存研究副本，不默认再分发。
4. 不把社区 `TravelTime` / `arrival_schedule` 写成官方 Stop time。
