# CUHK 当前校巴站点坐标与道路侧别公开数据审计

审计日期：2026-08-10（Asia/Hong_Kong）

## 结论

可以找到，而且 Route 2 已经不缺坐标。此前把 `Station Piazza`、`United College (Upward)`、`United College (Downward)` 视为“官方坐标缺失”，是因为自动合并只接受了严格名称匹配，没有继续解释 CUHK 官方 Campus Map 的旧站点 ID 和有向路段。

目前最可靠的组合是：

1. 用 CUHK 交通处 WordPress `stopId` 保存当前运营站点身份；
2. 用 CUHK 官方 Campus Map 坐标作第一方位置候选；
3. 用 OpenStreetMap 的 `platform + stop_position + route relation` 补道路侧别和沿道路 shape；
4. 用 Bus Clock 坐标作第三方交叉检查，不让它覆盖前两项。

三个来源对 Route 2 的三个先前缺口都给出了相近坐标，最大两源差异约 18.2 米：

| 当前官方站点                       | CUHK Campus Map                       | OpenStreetMap platform                       | Bus Clock                 | 交叉差异                                                 |
| ---------------------------------- | ------------------------------------- | -------------------------------------------- | ------------------------- | -------------------------------------------------------- |
| Station Piazza `[2812]`            | `22.4138255, 114.2093477`，旧 ID `52` | `22.4138075, 114.2094368`，node `2036051433` | `22.4138200, 114.2094600` | 官方↔OSM 9.4m；官方↔Bus Clock 11.6m；OSM↔Bus Clock 2.8m  |
| United College (Upward) `[2816]`   | `22.4203913, 114.2053324`，旧 ID `6`  | `22.4203899, 114.2053940`，node `2035204908` | `22.4204000, 114.2053400` | 官方↔OSM 6.3m；官方↔Bus Clock 1.2m；OSM↔Bus Clock 5.7m   |
| United College (Downward) `[2818]` | `22.4202896, 114.2051634`，旧 ID `7`  | `22.4203017, 114.2053400`，node `1716519514` | `22.4203000, 114.2052800` | 官方↔OSM 18.2m；官方↔Bus Clock 12.0m；OSM↔Bus Clock 6.2m |

两处联合书院 OSM platform 相距约 11.3 米，分别关联道路中心的两个 `stop_position`；下行节点还写有 `本部方向 towards Main Campus`。这比仅保存一个“联合书院中心点”更适合作为反馈定位和站点交互依据。

## 数据源比较

| 来源                          | 可取得字段                                                                                            | 全网覆盖                                                                                                                              | Route 2                                    | 更新性                                                                                                       | 许可与复用风险                                                                                 | 稳定批量抓取                                                                           |
| ----------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| CUHK 官方 Campus Map 静态资产 | 站点旧 ID、双语名、经纬度、类型；旧 route/segment ID、起终点、encoded polyline                        | 51 个带坐标记录：28 个校巴、23 个穿梭小巴。严格名称自动匹配当前 46 个运营 stop 时为 12/46；方向与路线图需人工映射                     | 通过站序和 segment 语义可映射 10/10        | HTTP `Last-Modified` 为 2026-07-06；但页面参数仍为 `20161006`，旧 route 编号也不是当前编号，字段级有效期未知 | CUHK 保留版权，没有开放数据许可；应只保存必要字段、来源 URL/hash，并在对外批量再发布前确认授权 | 单一公开 JS 可抓取，技术上稳定；语义变更没有 schema/version 保证                       |
| OpenStreetMap / Overpass      | platform 坐标/双语名/方向说明、道路 `stop_position`、relation 站序、道路 ways、对象 version/timestamp | 15 个 CUHK route relation、32 个去重 platform；可为约 32/46 个当前运营 stop identity 提供候选，覆盖 24/34 个 physical-place candidate | Route 2 为 10/10；不经邵逸夫堂的变体为 9/9 | 主要 route relation 于 2026-07-06 更新                                                                       | ODbL 1.0；必须署名，公开分发 OSM-derived 数据库可能触发 share-alike；社区数据不是官方真值      | Overpass 可批量，但实例会限流/超时；生产抓取应缓存、固定 object version 并保留原始快照 |
| CUHK Bus Clock 固定版本       | 34 个站点常量及经纬度、路线数组；另有 GPS 样本但不是站牌真值                                          | 严格名称合并可连接 28/46 个当前运营 stop                                                                                              | 10/10                                      | 坐标文件最近相关提交为 2025-05-11；审计固定 commit 为 2026-01-12                                             | 仓库为 GPL-3.0，但坐标来源及独立数据授权没有说明；适合验证，不宜无说明地作为唯一生产真值       | 固定 Git commit 可稳定下载；没有正式数据 API 或 schema 承诺                            |

## 1. CUHK 官方 Campus Map

### 1.1 原始数据

- [CUHK Campus Map 页面](https://www.cuhk.edu.hk/english/campus/cuhk-campus-map.html?area=shuttle+bus)
- [页面直接加载的 `cuhk_location_db.js`](https://www.cuhk.edu.hk/english/js/campus/cuhk_location_db.js?20161006)
- [当前交通处 Route 2 页面](https://transport.cuhk.edu.hk/tc/route/2/)
- [当前交通处 stop REST index](https://transport.cuhk.edu.hk/tc/wp-json/wp/v2/stop?per_page=100&_fields=id,slug,modified,title,link)

本轮取得的 JS：

```text
Content-Length: 396929
Last-Modified: Mon, 06 Jul 2026 02:13:45 GMT
ETag: "60e81-655e7d2efc840"
SHA-256: b18f7ced2e692eec6cd03833d08593d379544c23f9451cccfebd9b9a15076931
```

可复现：

```bash
curl -I -L 'https://www.cuhk.edu.hk/english/js/campus/cuhk_location_db.js?20161006'
curl -L 'https://www.cuhk.edu.hk/english/js/campus/cuhk_location_db.js?20161006' -o cuhk_location_db.js
shasum -a 256 cuhk_location_db.js
```

资产含 51 个 `shuttle_bus_stops` 坐标、19 个旧 `shuttle_bus_route` 和 46 个有向 `bus_route_segment`。它仍由 CUHK 官方页面公开加载，但页面同时提醒地图可能不按比例、资料不是实时更新；HTTP 修改时间只能证明文件最近被服务器更新，不能证明每个站点都在 2026 年实地重测。

### 1.2 三个先前缺口为什么可以映射

`Entrance Piazza` 旧 ID `52` 与当前 `Station Piazza [2812]` 可由双语名、Route 2 起点语义和坐标共同连接。

官方 Campus Map 的两个 `United College` 没写 Upward/Downward，但有向 segment 已给出方向：

```text
segment 4: Fung King Hey [5] -> United College [6]
segment 5: United College [6] -> New Asia College [8]
segment 6: New Asia College [8] -> United College [7]
segment 7: United College [7] -> University Administration Building [10]
```

与当前 Route 2 的官方站序对照后，旧 ID `6` 就是上行站，旧 ID `7` 就是下行站。这是“官方坐标 + 当前官方站序”的推断，应在数据中记录推断证据，而不是把旧 ID 直接等同当前 WordPress ID。

### 1.3 覆盖和限制

当前合并器采用唯一严格名称匹配时，只会把 12/46 个当前运营 stop 自动接到 Campus Map。这个数字反映匹配规则保守，不代表官方资产只有 12 个可用坐标。Route 2 经有向 segment 人工解释后可达 10/10。

全网映射仍应逐条审核，因为：

- Campus Map 旧 route ID 与交通处当前 `1A/1B/2/...` 不是同一套 ID；
- 部分旧记录同名但靠 segment 区分方向；
- 有些当前收费小巴、方向化或新增站点没有直接同名记录；
- CUHK [免责声明](https://www.cuhk.edu.hk/english/disclaimer.html)不是开放许可，并明确内容可无预告改变、学校不承担依赖责任。

## 2. OpenStreetMap：站牌、道路侧别和 Route 2 shape

### 2.1 Route 2 已完整建模

- [Route 2 relation `21069990`](https://www.openstreetmap.org/relation/21069990)
- [Route 2 完整 JSON](https://api.openstreetmap.org/api/0.6/relation/21069990/full.json)
- [不经邵逸夫堂的 relation `21070242`](https://www.openstreetmap.org/relation/21070242)
- [Route 2 对象历史](https://www.openstreetmap.org/relation/21069990/history)
- [2026-07-06 changeset `185204948`](https://www.openstreetmap.org/changeset/185204948)

relation `21069990` 当前包含：

- 10 个 platform；
- 10 个道路中心 `stop_position`；
- 36 个 way occurrence，31 个 unique way；
- 起点 `platform_entry_only` 和终点 `platform_exit_only`。

因此 OSM 可以直接生成沿道路的 Route 2 shape，而不是把站点用直线连接。

### 2.2 三个重点节点与道路侧

| 角色                    |                                                      Platform | Platform 坐标             | 配对的道路 stop_position | 说明                                                            |
| ----------------------- | ------------------------------------------------------------: | ------------------------- | -----------------------: | --------------------------------------------------------------- |
| Station Piazza 起点     | [`2036051433`](https://www.openstreetmap.org/node/2036051433) | `22.4138075, 114.2094368` |             `2236954271` | relation role 为 `platform_entry_only`；节点最近更新 2025-05-28 |
| United College Upward   | [`2035204908`](https://www.openstreetmap.org/node/2035204908) | `22.4203899, 114.2053940` |             `5413654367` | `location_id=10`                                                |
| United College Downward | [`1716519514`](https://www.openstreetmap.org/node/1716519514) | `22.4203017, 114.2053400` |             `5413654365` | `location_id=13`；`description=本部方向 towards Main Campus`    |

两个联合书院 platform 的位置不同，且分别落在道路中心点两侧。产品数据应保留两个 StopPoint；可以另建同一个 `StopPlace=United College`，但不能合并 ETA、反馈或 route occurrence。

### 2.3 全网覆盖与可复现查询

OSM 当前找到 15 个 CUHK 校巴 relation：`1A, 1B, 2, 2*, 3, 4, 5, 6A, 6B, 7, 8, N, N*, H, H*`。它们引用 32 个去重 platform，可为约 32/46 个当前运营 stop identity 生成坐标候选。Area 39、New Asia College 等仍可能出现一个 platform 对多个官方方向站的情况，必须结合 relation occurrence，不可只按名称扩展。

查询全部 CUHK route、站牌和道路 geometry：

```overpass
[out:json][timeout:90];

relation
  ["type"="route"]
  ["route"="bus"]
  ["name:zh"~"^香港中文大學(穿梭|轉堂)校巴"]
  (22.405,114.195,22.430,114.225)
  ->.routes;

(.routes; >>;);
out meta geom;
```

只取 platform：

```overpass
[out:json][timeout:90];

relation
  ["type"="route"]
  ["route"="bus"]
  ["name:zh"~"^香港中文大學(穿梭|轉堂)校巴"]
  (22.405,114.195,22.430,114.225)
  ->.routes;

node(r.routes)["public_transport"="platform"];
out meta;
```

[在 Overpass Turbo 打开 Route 2/2\* 查询](https://overpass-turbo.eu/?Q=%5Bout%3Ajson%5D%5Btimeout%3A90%5D%3B%0A%28rel%2821069990%29%3Brel%2821070242%29%3B%29-%3E.routes%3B%0A%28.routes%3B%20%3E%3E%3B%29%3B%0Aout%20meta%20geom%3B)

OSM 是社区数据，不是 CUHK 官方真值。主要 route relation 在 2026-07-06 的 changeset 中整理，并注明使用 Esri World Imagery；这不能把它升级为官方数据。生产中应保存 `osmType + osmId + version + timestamp` 和原始快照，地图上显示 attribution，并将 OSM-derived layer 与 CUHK 自有数据分开。[OSM 官方版权与 ODbL 说明](https://www.openstreetmap.org/copyright)、[OSMF Licence FAQ](https://osmfoundation.org/wiki/Licence/Licence_and_Legal_FAQ)。

## 3. CUHK Bus Clock

- 固定版本：[`575adc5475fc115001c30d9b5d5373384791c1f6`](https://github.com/CCheukKa/CUHK-bus-clock/tree/575adc5475fc115001c30d9b5d5373384791c1f6)
- 坐标常量：[`constants/BusData.ts`](https://github.com/CCheukKa/CUHK-bus-clock/blob/575adc5475fc115001c30d9b5d5373384791c1f6/constants/BusData.ts#L192-L229)
- 仓库许可：[`GPL-3.0 LICENSE`](https://github.com/CCheukKa/CUHK-bus-clock/blob/575adc5475fc115001c30d9b5d5373384791c1f6/LICENSE)

固定文件有 34 个站点坐标常量。按当前合并器的严格名称规则可连接 28/46 个运营 stop；Route 2 的 10 个站点均可找到候选坐标。三个重点常量为：

```text
UNIVERSITY_STATION_PIAZZA  22.41382, 114.20946
UNITED_COLLEGE_UPWARD      22.42040, 114.20534
UNITED_COLLEGE_DOWNWARD    22.42030, 114.20528
```

它们与官方/OSM 坐标一致到约 1–12 米，可作为有价值的独立检查。但文件没有说明站牌坐标的测量方法、日期或逐点来源；仓库的 GPS 日志也不是站牌坐标真值。Bus Clock 应保留为 `source=bus_clock` 的候选证据，不应无审核覆盖官方或 OSM。

仓库顶层 GPL-3.0 约束代码分发，但没有为坐标和 GPS 数据写独立的数据来源/授权说明。如果产品直接复制常量或大量原始数据，应先确认 GPL/数据权利影响；仅保存来源引用、比较距离和人工确认后的自有结果风险较低。

## 建议落库与抓取优先级

### Route 2 现在可以采用

```text
Canonical identity: CUHK WP stop id
Primary position evidence: CUHK Campus Map stop id + coordinates
Road-side/platform evidence: OSM platform + stop_position
Route shape: OSM relation ways，单独标注 ODbL 来源
Cross-check only: Bus Clock coordinate
```

三处重点映射：

```text
cuhk-wp-stop-2812 <-> cuhk-map-stop-52 <-> osm-node-2036051433
cuhk-wp-stop-2816 <-> cuhk-map-stop-6  <-> osm-node-2035204908
cuhk-wp-stop-2818 <-> cuhk-map-stop-7  <-> osm-node-1716519514
```

每个 link 应记录：

```text
sourceId
sourceUrl
sourceVersion / ETag / contentHash
retrievedAt
mappingMethod (exact_name | route_sequence | manual_review)
distanceToOtherEvidenceMeters
reviewStatus
```

### 全网后续抓取

1. 每次先抓 CUHK 当前 stop index，稳定保留 46 个非空运营身份；
2. 对官方 Campus Map JS 保存 ETag、Last-Modified 和 SHA-256；只在 hash 改变时重跑映射；
3. 抓 OSM relation 的完整 JSON，保留 relation/node/way version，按 ODbL 单独归档；
4. 先自动接受“当前官方名称/站序一致、官方与 OSM 距离不超过 25 米”的候选，其余进入人工审核；
5. Bus Clock 只补缺和显示冲突，不作为 silent overwrite；
6. 用户反馈必须落到 `patternId + stopSequence + stopPointId`，不能只落到模糊的地点名称。

## 仍未验证

- 51 个 CUHK Campus Map 坐标并不等于当前 46 个运营 stop 的完整一对一映射；除 Route 2 外仍要逐线审核方向和重名站；
- Campus Map 的 2026-07-06 HTTP 修改时间不是逐站实测日期；
- OSM 32/46 是候选覆盖，不是 32 个已由 CUHK 逐一确认的站牌；
- Bus Clock 坐标的逐点采集方式和授权来源没有公开说明；
- 临时迁站需另读 CUHK 交通处 service notice，不能直接改写基础站点坐标。
