# HK Bus 近距离站点、环线站序与 CUHK Route 2 地图核查

核查日期：2026-08-10
应用基线：`hkbus/hk-independent-bus-eta` 提交 [`328628c`](https://github.com/hkbus/hk-independent-bus-eta/commit/328628c86d4f420525f782e20cf97e6f1e4b2bf9)
ETA 类型与查询基线：`hkbus/hk-bus-eta` 3.8.2／提交 [`24d4afd`](https://github.com/hkbus/hk-bus-eta/commit/24d4afda3c0ef2906af2354967223ccffb6dbe17)
数据管线基线：`hkbus/hk-bus-crawling` 提交 [`28ee57d`](https://github.com/hkbus/hk-bus-crawling/commit/28ee57ded973adce81791435acc899df19bb2fcd)

## 结论

HK Bus **不会因为两个站点在地理上很近，就把它们折叠成同一个站点身份**。它同时保留三层不同概念：

1. `stopId`：运营商站点身份；`stopList` 以它为 key，每项只有名称和坐标。
2. `stopMap`：附近且行驶方向相似的“等价站点”关系，用于跨运营商联合查看；不会删除原站点。
3. `(routeId, seq)`：某站在某条有序路线中的一次出现。环线同一个 `stopId` 可以出现多次，业务上靠 `seq` 区分。

地图也没有按距离合并 marker。每个站序 occurrence 都会产生一个 marker；若两个 marker 坐标完全或几乎相同，源码没有 cluster、spiderfy、横向错位或点击选择菜单。可以确认它们都会被创建，但公开源码不足以保证用户在完全重叠时能点中下面那个 marker；这是 **unknown／现有实现的交互缺口**，不是数据合并。

对 CUHK 的直接结论：**善衡书院和大学体育中心应是两个独立 `StopPoint`，不要因为隔着一条马路且 GPS 很近而合并。** 它们可以共享一个便于搜索／展示的地点组，但路线站序、预计到站和反馈必须指向具体站点 occurrence。

## 1. Stop identity：站点 ID、等价关系和路线 occurrence 分开

`hk-bus-eta` 的公开类型把路线站序定义为每家运营商一组 `string[]`，把站点表定义为 `Record<string, StopListEntry>`；站点实体本身只有 `name` 与 `location`。另有 `StopMap = Record<string, [Company, string][]>` 表示相关站点，而非替代 `stopList` 的 canonical ID（[`type.ts` 24–70](https://github.com/hkbus/hk-bus-eta/blob/24d4afda3c0ef2906af2354967223ccffb6dbe17/src/type.ts#L24-L70)）。

在 App 内，收藏／站点 ETA 的 key 明确写成 `<co>|<stopId>`；查路线时遍历每条路线的站点数组，把每个匹配 occurrence 保存成 `[routeId, seq]`，因此同一 `stopId` 在同一环线出现两次时不会被压成一次（[`useStopEtas.tsx` 15–63](https://github.com/hkbus/hk-independent-bus-eta/blob/328628c86d4f420525f782e20cf97e6f1e4b2bf9/src/hooks/useStopEtas.tsx#L15-L63)）。ETA 查询随后按 `stops[company][seq]` 取得站点并把 `seq` 传给运营商查询（[`index.ts` 26–67](https://github.com/hkbus/hk-bus-eta/blob/24d4afda3c0ef2906af2354967223ccffb6dbe17/src/index.ts#L26-L67)）。

所以 HK Bus 的实际身份语义是：

- 物理／运营商站点：`(company, stopId)`；
- 路线中的一次停靠：`(routeId, seq)`；
- `stopMap` 只是等价／邻近关系，不是主键合并。

## 2. 是否有基于距离的“合并”

有距离计算，但应分清两类，均不等于把两个 `stopId` 合成一个：

### 2.1 `stopMap` 等价站点分组

数据管线只把 **50 米以内**且“从本站驶向下一站”的 bearing 与目标站 bearing 相差不超过 **45°** 的站加入同组；它递归寻找关联站，最后从每个站自己的 `stopMap` value 中排除自己（[`mergeStopList.py` 8–84](https://github.com/hkbus/hk-bus-crawling/blob/28ee57ded973adce81791435acc899df19bb2fcd/crawling/mergeStopList.py#L8-L84)）。bearing 是根据每条路线当前站到下一站的坐标计算，并在建表时保留 `routeKey`、公司和 `seq`（[`mergeStopList.py` 87–187](https://github.com/hkbus/hk-bus-crawling/blob/28ee57ded973adce81791435acc899df19bb2fcd/crawling/mergeStopList.py#L87-L187)）。生成结果写入 `db.stopMap`，`db.stopList` 仍完整保留（[`mergeStopList.py` 221–270](https://github.com/hkbus/hk-bus-crawling/blob/28ee57ded973adce81791435acc899df19bb2fcd/crawling/mergeStopList.py#L221-L270)）。

这意味着隔路相对、行车 bearing 通常相差约 180° 的两个站，**通常不会**因为相距很近而进入同一等价组；但若站点被多条不同方向路线使用，bearing 集合可能更复杂，不能把 45° 规则当作绝对的“马路两侧识别器”。

App 在站点详情中只是把当前 `(company, stopId)` 与 `stopMap[stopId]` 拼接起来共同查询，并没有改写身份（[`RouteEtaPage.tsx` 289–303](https://github.com/hkbus/hk-independent-bus-eta/blob/328628c86d4f420525f782e20cf97e6f1e4b2bf9/src/pages/RouteEtaPage.tsx#L289-L303)）。

### 2.2 联营路线跨公司对齐

数据管线还会在合并同一路线的两个运营商站序时，要求站数相同且每一对站点坐标相距小于 400 米；这是为了把 KMB/CTB 的同一联营路线放进同一 route entry，不是合并站点记录（[`mergeRoutes.py` 5–12、103–125](https://github.com/hkbus/hk-bus-crawling/blob/28ee57ded973adce81791435acc899df19bb2fcd/crawling/mergeRoutes.py#L5-L12)）。

## 3. 环线与同一站重复出现

HK Bus 的路线详情没有先对 `stopIds` 做 `Set` 或按坐标去重：站点列表直接按数组 `map((stopId, idx) => ...)` 渲染，并以 `idx` 作为 occurrence 区分（[`StopAccordionList.tsx` 50–63](https://github.com/hkbus/hk-independent-bus-eta/blob/328628c86d4f420525f782e20cf97e6f1e4b2bf9/src/components/route-eta/StopAccordionList.tsx#L50-L63)）。收藏 key 也是 `routeId/idx`，分享 URL 带 `stopId,index`（[`StopAccordion.tsx` 65–99](https://github.com/hkbus/hk-independent-bus-eta/blob/328628c86d4f420525f782e20cf97e6f1e4b2bf9/src/components/route-eta/StopAccordion.tsx#L65-L99)）。

路线 URL 同时支持 `stopId,index`：若一个 `stopId` 在站序出现多次，页面收集所有匹配下标，再选择最接近 URL 所给 index 的 occurrence（[`RouteEtaPage.tsx` 72–105](https://github.com/hkbus/hk-independent-bus-eta/blob/328628c86d4f420525f782e20cf97e6f1e4b2bf9/src/pages/RouteEtaPage.tsx#L72-L105)）。因此“站点实体相同”与“本圈第几次停靠”是分开的。

KMB ETA 适配器另有明确环线分支：当站序首尾 `stopId` 相同，并查询这个重复站时，要求上游 ETA 的 sequence 与当前 `seq + 1` 精确匹配（[`kmb.ts` 14–54](https://github.com/hkbus/hk-bus-eta/blob/24d4afda3c0ef2906af2354967223ccffb6dbe17/src/kmb.ts#L14-L54)）。这进一步证明 ETA 不能只用 `stopId`，必须带站序 occurrence。

当前第一方数据库由库函数从 [`routeFareList.min.json`](https://data.hkbus.app/routeFareList.min.json) 加载（[`index.ts` 149–170](https://github.com/hkbus/hk-bus-eta/blob/24d4afda3c0ef2906af2354967223ccffb6dbe17/src/index.ts#L149-L170)）。2026-08-10 抽查其中 KMB 10 线 `CHOI WAN → TAI KOK TSUI (CIRCULAR)`：48 个 occurrence 的第 0 和第 47 项均为 `09680C5849BFA077`。这与上述环线代码一致。注意，轻铁 crawler 对 705/706 采取另一种 source-specific 规范化：主动避免再次加入首站（[`lightRail.py` 14–28、96–109](https://github.com/hkbus/hk-bus-crawling/blob/28ee57ded973adce81791435acc899df19bb2fcd/crawling/lightRail.py#L96-L109)）。因此 HK Bus 没有“所有环线一律首尾重复”的统一规则，可靠主键仍应是 occurrence sequence。

## 4. 地图上的近距离／重叠 marker

路线地图先把 `stopIds` 映射为 `stops`，再对完整 `stops` 数组逐项创建 MapLibre DOM `<Marker>`。marker key 含 `lng-lat-idx`，点击回传的也是 `idx`；当前站和已过站状态同样按 `idx` 判断（[`RouteMap.tsx` 62–80、251–279](https://github.com/hkbus/hk-independent-bus-eta/blob/328628c86d4f420525f782e20cf97e6f1e4b2bf9/src/components/map/maplibre/RouteMap.tsx#L62-L80)）。地图点击后页面导航到该 numeric index（[`RouteEtaPage.tsx` 117–142](https://github.com/hkbus/hk-independent-bus-eta/blob/328628c86d4f420525f782e20cf97e6f1e4b2bf9/src/pages/RouteEtaPage.tsx#L117-L142)）。

已确认：

- 不按距离合并路线 marker；
- 重复 occurrence 会产生多个 marker；
- marker 选择结果是 route sequence index，不只是 `stopId`。

Unknown／限制：源码没有路线站点的 cluster、spiderfy、相邻 marker 错位或“点一下选两个站”的逻辑，也没有为普通巴士 marker 设置独立 z-index。完全重叠时，浏览器/MapLibre DOM 堆叠会令其中一个 marker 位于上层，但具体哪个在所有平台可被点中不应作为稳定产品行为。列表仍可逐 occurrence 选择，因此 HK Bus 主要靠站序列表避开这个问题。

## 5. 方向与站台消歧

HK Bus route entry 带每公司 `bound`、`orig`、`dest`；路线页顶部以“往 destination”表达方向（[`type.ts` 24–43](https://github.com/hkbus/hk-bus-eta/blob/24d4afda3c0ef2906af2354967223ccffb6dbe17/src/type.ts#L24-L43)、[`RouteHeader.tsx` 17–36](https://github.com/hkbus/hk-independent-bus-eta/blob/328628c86d4f420525f782e20cf97e6f1e4b2bf9/src/components/route-eta/RouteHeader.tsx#L17-L36)）。但 `StopListEntry` 没有显式 `platformCode`、`direction` 或 `parentStation` 字段；消歧主要依赖运营商 stop ID、站名、路线方向和 sequence。

作为对照，GTFS 官方模型允许一个 station 下有多个 stop/platform，并提供 `parent_station` 与 `platform_code`；`stop_times.txt` 的主键是 `(trip_id, stop_sequence)`，规范也明确同一 stop 可在同一 trip 被服务多次（[GTFS Schedule Reference：stops.txt 与 stop_times.txt](https://github.com/google/transit/blob/master/gtfs/spec/en/reference.md#stopstxt)）。这与 HK Bus 的“实体 ID + sequence occurrence”基本思想一致，但 GTFS 的站点层级表达更完整。

## 6. 对 CUHK 善衡书院／大学体育中心的建议

### 数据模型

- 建两个独立 boarding point：`shho_side` 与 `sports_centre_side`（最终 ID 可另定），各有真实坐标、名称和道路一侧／行驶方向提示。
- 可选建一个非上车实体 `place_group`，例如 `shho_sports_cluster`，只用于“附近地点”搜索和 UI 聚合；**预计到站、反馈和模型训练不得只指向这个 group**。
- 路线站序使用独立 occurrence 表：`RoutePatternStop(pattern_id, seq, stop_point_id, pickup_type, dropoff_type)`；唯一键至少是 `(pattern_id, seq)`，不要使用 `(route_id, stop_point_id)`，因为环线可以重复经过同一个点。
- 用户反馈至少保存 `pattern_id + seq + observed_at`；另存 GPS、accuracy 和用户是否手动改站。仅保存“善衡附近 + 时间”不足以训练两个方向的 offset。

### GPS 默认站点

- 不能只选欧氏距离最近者。HK Bus 的路线页也是纯距离选择默认 occurrence（[`RouteEtaPage.tsx` 56–70](https://github.com/hkbus/hk-independent-bus-eta/blob/328628c86d4f420525f782e20cf97e6f1e4b2bf9/src/pages/RouteEtaPage.tsx#L56-L70)），在隔路站和手机 GPS 误差下会跳错边。
- 若两个候选都落在 `max(GPS accuracy, 产品最小阈值)` 内，反馈表单应显示二选一，例如“善衡书院｜下一站大学站”与“大学体育中心｜下一站邵逸夫堂”，不要静默合并。
- 从具体路线站序打开反馈时，直接预填当前 occurrence；只有从全局按钮进入时才需要 GPS 候选消歧。

### 地图交互

- 使用两个真实坐标 marker；高缩放时应能看出在马路两侧。
- 若像素上仍重叠，应使用轻量 spiderfy／错位和带名称的二选一浮层，或点击聚合点后放大并列出两个站。不要照搬 HK Bus 当前“两个 DOM marker 直接叠放”的缺口。
- 选中 marker 后高亮的是 `seq` occurrence，并同步滚动到站序行；对重复 stop point，列表序号和“下一站”文案比站名更可靠。

## 7. CUHK 官方资料如何表示这两个站

CUHK 交通处当前 [Route 2 页面](https://transport.cuhk.edu.hk/tc/route/2/) 与官方 [Shuttle Bus 路线图](https://transport.cuhk.edu.hk/wp-content/uploads/documents/Shuttle.pdf) 都把 `University Sports Centre` 与 `S.H. Ho College` 列成 Route 2 的两个不同停站。交通处 WordPress 数据中的 ID 也不同：

| 当前交通处 stop ID | 英文站名                 | Route 2 中的位置               |
| ------------------ | ------------------------ | ------------------------------ |
| `2546`             | University Sports Centre | 起点后的第一个停站             |
| `2550`             | S.H. Ho College          | 回到 University Station 前一站 |

CUHK 官方 [Campus Map](https://www.cuhk.edu.hk/english/campus/cuhk-campus-map.html?area=shuttle+bus) 加载的公开静态数据文件 [`cuhk_location_db.js`](https://www.cuhk.edu.hk/english/js/campus/cuhk_location_db.js?20161006) 也把两者保存为两个独立站点：

| Campus Map stop ID | 英文站名                 | 坐标（纬度，经度）                       |
| ------------------ | ------------------------ | ---------------------------------------- |
| `2`                | University Sports Centre | `22.41774071488508, 114.2105171084404`   |
| `51`               | S.H. Ho College          | `22.418023378635656, 114.20974999666214` |

按这组官方坐标计算，两站直线距离约 **85 米**。这支持用户所说的“同一环线、道路两侧、空间上非常接近”，但不支持将它们合成一个上车点。产品可以把它们在“附近”结果中放在同一地点组下；站序、ETA、地图 marker 和反馈仍须分别指向 `2546` 与 `2550` 对应的 StopPoint。

当前 Route 2 的官方有向站序是：

```text
Station Piazza [2812]
→ University Sports Centre [2546]
→（45、00 分班次加停 Sir Run Run Shaw Hall [2544]）
→ Fung King Hey Building [2814]
→ United College (Upward) [2816]
→ New Asia College [2820]
→ United College (Downward) [2818]
→ University Administration Building [2548]
→ S.H. Ho College [2550]
→ University Station [2552]
```

所以 UI 消歧不应只写两个相近站名，而应利用环线方向：

- `大学体育中心｜上山方向｜下一站邵逸夫堂／冯景禧楼`
- `善衡书院｜回程方向｜下一站大学站`

## 8. 官方路线几何与当前原型的问题

当前原型在地图中使用 `STOPS.map((stop) => stop.coordinates)` 生成路线。这等于用直线把各站依次连接，因此线段会穿过建筑、山坡或不通车的道路；它只能表达站序，不能表达巴士实际行车路径。

CUHK Campus Map 的静态数据提供了 46 个有向道路片段，每段包含起终站 ID 与 Google encoded polyline 风格的 `encoded_line`。字段可按 Google 官方的 [Encoded Polyline Algorithm](https://developers.google.com/maps/documentation/utilities/polylinealgorithm) 解码。旧地图中的以下片段可以拼成与当前 Route 2 高度吻合的候选环线：

```text
1 → 2 → 3 → 4 → 5 → 6 → 7 → 45 → 46
```

解码并连接后的结果为 **137 个坐标点、约 4.45 公里**，各段如下：

| segment ID | 大致区段                             | 点数 |  约长 |
| ---------- | ------------------------------------ | ---: | ----: |
| `1`        | University Station → Sports Centre   |   22 | 644 m |
| `2`        | Sports Centre → Shaw Hall            |   28 | 742 m |
| `3`        | Shaw Hall → Fung King Hey            |    3 | 393 m |
| `4`        | Fung King Hey → United (Upward)      |   15 | 311 m |
| `5`        | United (Upward) → New Asia           |   13 | 294 m |
| `6`        | New Asia → United (Downward)         |   12 | 276 m |
| `7`        | United (Downward) → Admin Building   |   20 | 608 m |
| `45`       | Admin Building → S.H. Ho College     |   14 | 484 m |
| `46`       | S.H. Ho College → University Station |   18 | 697 m |

这组 geometry 是目前最好的第一方候选，明显优于站点直连，但仍不能直接标成“当前官方 Route 2 轨迹”：

1. Campus Map 页面自己声明地图可能不按比例且不实时更新；
2. 数据中的旧 route pattern 不是交通处当前 1A／1B／2 等编号体系，也没有逐条有效期；
3. 候选 geometry 从 `University Station` 开始，而当前 Route 2 从 `Station Piazza` 开始，起始小段仍需用当前地图或实地反馈核实。

因此原型的正确做法是：把这条 polyline 标成 `provisional_official_candidate`，保留来源 URL、源 segment IDs、抓取时间与 hash；在 UI 中只显示普通路线线条，不宣称是实时 GPS 或已验证的精确轨迹。

## 9. 建议落到 schema 与交互的最小改动

```text
StopPoint
  id, official_stop_id, name, coordinates, source

RoutePatternStop
  pattern_id, seq, stop_point_id, next_stop_id, stop_condition

RouteShape
  shape_id, geometry, source_url, source_segment_ids, status

ArrivalFeedback
  pattern_id, seq, stop_point_id, observed_at, gps, gps_accuracy
```

- 预计到站与反馈的业务主键使用 `pattern_id + seq`，不使用地名或“附近地点组”。
- 在具体站点展开页点“反馈”，直接继承当前 `pattern_id + seq`；GPS 只用于校验和建议，不反过来覆盖用户正在查看的站点。
- 从全局入口反馈、且 GPS 同时覆盖两站时，显示上述带方向和下一站的二选一。
- 地图保留两个 marker；缩放不足导致像素重叠时，点击后显示两个候选，而不是把数据合并。
- 路线线条改用独立 `RouteShape`，不再从 stop coordinates 即时连直线。

## 置信度与 unknown

- 高置信度：类型结构、`stopMap` 的 50m + 45°规则、route occurrence 的 `seq` 身份、KMB 环线 ETA 特判、marker 按 occurrence 渲染且无显式去重／cluster。
- 高置信度：CUHK 当前 Route 2 的停站顺序；Sports Centre 与 S.H. Ho College 是不同官方 stop ID；当前原型使用站点坐标直连。
- 中置信度：旧 Campus Map segments `1,2,3,4,5,6,7,45,46` 是当前 Route 2 大部分道路几何的合适候选。
- Unknown：完全重叠 marker 在不同浏览器和 React/MapLibre DOM 排序下具体哪个获得点击；公开源码没有承诺该行为。
- Unknown：`Station Piazza` 到旧 geometry 起点 `University Station` 的当前精确行车段，以及两站各自的站牌落点是否仍与旧 Campus Map 坐标完全一致。
