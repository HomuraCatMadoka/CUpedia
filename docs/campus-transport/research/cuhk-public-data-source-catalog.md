# CUHK 校巴公开数据源目录与合并键审计

> 核对日期：2026-08-10（Asia/Hong_Kong）。数量均来自该日实际取得的原始响应或固定 Git commit；“公开可访问”不等于“有开放数据许可”。

## 结论

这批来源合并后，可以得到一套可追溯的冷启动数据骨架：

- 14 条当前官方路线身份，刚好由 6 条普通日间路线、4 条转堂路线、2 条夜间/假日路线和 2 条收费小巴路线覆盖；
- 47 条官方运营站点记录，其中 1 条是 `(Blank)`，其余 46 条应保留方向和 PSLB 平台语义；去掉方向/PSLB 后只能得到 34 个**候选物理地点**，不能据此直接合并运营站点；
- 当前官方起点发车窗口、每小时发车分钟、服务日条件和视觉路线图；
- 2024–25 三份仍可访问的历史时刻表，可与 2026 当前版本做差异审计；
- 最近两年 64 条官方服务通告索引，但有效日期、临时位置等正文通常在图片内；
- OpenStreetMap 校园周边 130 个 `highway=bus_stop` 节点，其中只有 12 个明确标记 `operator=CUHK`；
- CUHK Bus Clock 固定版本中的 154 条 2025 GPS 点、154 条最近站标签、49 个非空站间 pair 和 113 个秒数样本。

这些数据仍然没有官方逐站到站时刻、车辆 ID、trip ID、AVL、GTFS 或 GTFS-Realtime。因此只能生成始终标为“预计”的 cold start，不构成实时 ETA。

## 来源总表

| 来源                                                                                                                   | 实取数量/范围                                        | 实际可用字段                                                                 | 原始身份键                      | 跨源合并候选键                          | 许可/发布边界                                                                 |
| ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------- | --------------------------------------- | ----------------------------------------------------------------------------- |
| [CUHK route REST](https://transport.cuhk.edu.hk/wp-json/wp/v2/route?per_page=100)                                      | 14 条，1 页                                          | `id`、`slug`、`title.rendered`、`date`、`modified`、`route_category`、`link` | `cuhk-wp:route:<id>`            | 规范化路线代码 + 官方 `id`              | 未发现开放数据许可；保留来源和抓取证据                                        |
| [CUHK stop REST](https://transport.cuhk.edu.hk/wp-json/wp/v2/stop?per_page=100)                                        | 47 条，1 页                                          | `id`、`slug`、`title.rendered`、`date`、`modified`、`link`                   | `cuhk-wp:stop:<id>`             | 官方别名 + 方向/PSLB + 空间距离         | 未发现开放数据许可；不要把公开访问视为可任意再发布                            |
| CUHK route HTML，例如 [1A](https://transport.cuhk.edu.hk/route/1a/)                                                    | REST 可发现 14 个页面；本轮逐字段核对 1A、5、8、Down | 服务窗口、发车分钟、日型说明、站名、乘客范围、临时规则说明                   | 页面 URL + 抓取内容 hash        | `routeId + serviceBand + serviceRule`   | DOM 是展示模板，不是有稳定契约的 feed                                         |
| CUHK 当前 PDF                                                                                                          | 4 份，合计 5 页                                      | 路线、服务时间、发车分钟、条件停站、路线图、服务资格/收费信息                | URL + 内容 SHA-256              | `routeId + documentSnapshot`            | 未发现开放数据许可；不要直接镜像整份 PDF                                      |
| CUHK 2024–25 PDF                                                                                                       | 3 份，各 1 页                                        | 与当前 PDF 同类，并有明确业务生效日期                                        | URL + 内容 SHA-256              | `routeId + validFrom`                   | 可作历史证据，不表示允许再发布原文                                            |
| [CUHK newsdetails REST](https://transport.cuhk.edu.hk/wp-json/wp/v2/newsdetails?per_page=100)                          | 全部 118 条；2024-08-10 起 64 条                     | `id`、`date`、`modified`、`slug`、`title`、`link`、revision links            | `cuhk-wp:newsdetails:<id>`      | 标题解析出的路线/站点 + OCR 后有效期    | REST 正文不足；事件生效必须审核                                               |
| [CUHK Bus Clock 固定 commit](https://github.com/CCheukKa/CUHK-bus-clock/tree/575adc5475fc115001c30d9b5d5373384791c1f6) | 2025-02-21 至 2025-04-25                             | GPS、路线标签、最近站标签、站间秒数、人工路线/坐标常量                       | commit + 文件路径 + 行/JSON key | 路线别名、站点别名、`route + timestamp` | 仓库 GPL-3.0；`data/*.json` 没有单列数据许可说明                              |
| OpenStreetMap / Overpass                                                                                               | 指定 bbox 130 个节点；12 个 `operator=CUHK`          | `type`、`id`、`lat`、`lon`、`tags.*`                                         | `osm:<type>:<id>`               | 双语别名 + 方向 + 距离                  | [ODbL](https://www.openstreetmap.org/copyright)，必须遵循署名及数据库许可要求 |

## 1. CUHK 官方路线索引

### 1.1 REST 记录

直接来源：[WordPress `route` endpoint](https://transport.cuhk.edu.hk/wp-json/wp/v2/route?per_page=100)。响应头为 `X-WP-Total: 14`、`X-WP-TotalPages: 1`。

14 个实际路线 slug：

```text
1a, 1b, 2, 3, 4, 5, 6a, 6b, 7, 8, n, h, up, down
```

类别分布可由记录中的 `route_category` 看出：普通/夜间/假日路线为 `31`，转堂路线为 `32`，收费小巴 Up/Down 为 `35`。真实记录示例：

```json
{
  "id": 2554,
  "slug": "1a",
  "date": "2021-03-25T17:29:53",
  "modified": "2026-01-08T18:46:37",
  "title": { "rendered": "1A Main Campus" },
  "route_category": [31],
  "link": "https://transport.cuhk.edu.hk/route/1a/",
  "content": { "rendered": "", "protected": false },
  "acf": []
}
```

本轮 14 条的 `modified` 范围为 2025-11-17 至 2026-07-26。不过 `modified` 只是 WordPress 记录更新时间，不是时刻表 `validFrom`。

### 1.2 HTML 才包含班次和展示站序

完整 REST 记录的 `content.rendered` 为空、`acf` 为空数组。班次位于公开 HTML 模板中。抽取四个实际页面得到：

| 页面                                              | 服务带                                     | 发车分钟                             |       页面中的站名条数 |
| ------------------------------------------------- | ------------------------------------------ | ------------------------------------ | ---------------------: |
| [1A](https://transport.cuhk.edu.hk/route/1a/)     | `07:40–18:50`                              | `10, 20, 40, 50`                     |                      4 |
| [5](https://transport.cuhk.edu.hk/route/5/)       | 周一至五 `09:18–17:26`；周六 `09:18–13:26` | `18, 22, 26`                         |                      7 |
| [8](https://transport.cuhk.edu.hk/route/8/)       | `07:40–18:40`                              | `00, 20, 40`                         | 16，包含非教学日变体站 |
| [Down](https://transport.cuhk.edu.hk/route/down/) | `07:00–08:15` 与 `08:45–21:15`             | 前者 `00, 15, 30, 45`；后者 `15, 45` |                     13 |

页面还真实出现以下信息：

- 普通和转堂路线的乘客说明为 `CUHK Students & Staff School Bus Service`；
- `Remarks [NS] [S]`、台风/暴雨安排等折叠区块；
- 站点元素使用 `route-stop-text`，起点、终点、停站和不停站依靠 CSS 类/颜色表达。

因此 HTML 可以提供结构候选，却不能简单以 DOM 出现顺序当作已验证 `RoutePattern`：尤其 Route 8 的教学日/非教学日变体和多列路线图会混在同页。

## 2. CUHK 官方站点索引

直接来源：[WordPress `stop` endpoint](https://transport.cuhk.edu.hk/wp-json/wp/v2/stop?per_page=100)。响应头为 `X-WP-Total: 47`、`X-WP-TotalPages: 1`。

真实记录：

```json
{
  "id": 7526,
  "slug": "residences-no-3-downward",
  "title": { "rendered": "Residences No. 3 (Downward)" },
  "date": "2025-06-23T17:04:31",
  "modified": "2025-06-23T17:04:31",
  "link": "https://transport.cuhk.edu.hk/stop/residences-no-3-downward/",
  "content": { "rendered": "", "protected": false },
  "acf": []
}
```

实际数据特点：

- 47 条均没有经纬度；
- 1 条记录是 `id=2897, slug=blank, title=(Blank)`，不能进入可选车站；
- Upward、Downward、PSLB 是运营站点/站台语义。例如 `Univ. Station` 与 `Univ. Station (PSLB)` 不应直接去重成同一个 `Stop`；
- 若只将标题尾部的 `(Upward)`、`(Downward)`、`(PSLB)` 去掉，47 条会得到 35 个名称组；再去掉 `(Blank)` 后是 34 个候选 `StopPlace`。这只是物理地点分组候选，不是 34 个最终站点；
- `New Asia College` 有无方向、上行、下行三条记录，说明仅靠 normalized name 会过度合并；
- 站点 `modified` 范围为 2021-06-04 至 2026-07-30，也不能解释为业务有效期。

推荐保留两层：官方 WordPress `id` 对应不可丢失的运营 `Stop`，再用名称、方向与坐标建立可撤销的 `StopPlaceLink`。

## 3. 当前与 2024–25 官方 PDF

### 3.1 实际文件清单

| 文件                                                                                                    | 页面/文本情况                              | PDF metadata                                      | 覆盖路线           | SHA-256                                                            |
| ------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------- | ------------------ | ------------------------------------------------------------------ |
| [Shuttle.pdf](https://transport.cuhk.edu.hk/wp-content/uploads/documents/Shuttle.pdf)                   | 1 页，可抽文本                             | 创建 2026-02-04                                   | 1A、1B、2、3、4、8 | `b3262eae15303816d7410878b07842ecc32539c22056d731716c90b32914d09d` |
| [NH.pdf](https://transport.cuhk.edu.hk/wp-content/uploads/documents/NH.pdf)                             | 1 页，可抽文本                             | 创建 2026-02-03，修改 2026-02-04                  | N、H               | `4238b6a144137659086111072fe4df17be5e61b31b68aae5fca55c40ae24b854` |
| [Meet-class.pdf](https://transport.cuhk.edu.hk/wp-content/uploads/documents/Meet-class.pdf)             | 1 页，可抽文本                             | 创建 2026-02-04                                   | 5、6A、6B、7       | `fd85c6d510f3de4033745f404499a6f1611d8fdac91ef18dc238d4b164d58439` |
| [PSLB_2025.pdf](https://transport.cuhk.edu.hk/wp-content/uploads/documents/PSLB_2025.pdf)               | 2 页，`pdftotext` 仅得到换页符，实质为图片 | 创建/修改 2026-04-08                              | Up、Down           | `5f488aa6b0f1d196ce8d70179898331dfa013fc9e147dafd63e0b88be03cfe6c` |
| [Shuttle_24-25.pdf](https://transport.cuhk.edu.hk/wp-content/uploads/documents/Shuttle_24-25.pdf)       | 1 页，可抽文本                             | 创建 2024-10-30；版面写 `Effective: Sep 3, 2024`  | 1A、1B、2、3、4、8 | `064d3ace1f8278f367258863e6140d17767b0854efb5617933f0a47fe8ae7e97` |
| [NH_24-25.pdf](https://transport.cuhk.edu.hk/wp-content/uploads/documents/NH_24-25.pdf)                 | 1 页，可抽文本                             | 创建 2024-10-30；版面写 `Effective: Aug 26, 2024` | N、H               | `61a318c29ae1bcfd7c65c214336a07389f5ed0606af171677788d7e245913f5e` |
| [Meet-class_24-25.pdf](https://transport.cuhk.edu.hk/wp-content/uploads/documents/Meet-class_24-25.pdf) | 1 页，可抽文本                             | 创建 2024-10-30；版面写 `Effective: Sep 2, 2024`  | 5、6A、6B、7       | `61f3945cbb8e980c3e4f484e69b1145d173ecc5a466d4174f5e41cd6ebca7748` |

当前四份 PDF 一共覆盖 REST 的全部 14 条路线。PSLB 文件名虽带 `2025`，本轮取得的文件 metadata 是 2026-04-08，不能用文件名猜有效年度。

### 3.2 版本差异实际能说明什么

将三组可抽文本 PDF 做版面文本 diff：

- 2024–25 和当前 Shuttle/NH 的可见班次数字相同；当前版移除了页面上的明确 `Effective` 日期；
- 当前 Meet-class 比 2024–25 版明确多写了 `Reading Week` 为停驶时段；
- 当前文件的 PDF 创建/修改日期均不能替代业务生效日期；
- PDF 路线图是多列视觉排版，抽取文本会穿插站序；它适合作为人工复核证据，不适合无审核生成站序。

所以每次抓取必须保留 `url + retrievedAt + sha256 + parsedFields + parserVersion`，不能只保存“最新版”的覆盖结果。

## 4. CUHK 官方服务通告

### 4.1 REST 索引数量

直接来源：[第 1 页](https://transport.cuhk.edu.hk/wp-json/wp/v2/newsdetails?per_page=100)和[第 2 页](https://transport.cuhk.edu.hk/wp-json/wp/v2/newsdetails?per_page=100&page=2)。响应头显示总计 118 条、2 页。

按发布时间筛选 `date >= 2024-08-10` 得到 64 条。标题关键词计数（可重叠）：

| 标题关键词   | 条数 |
| ------------ | ---: |
| `Completed`  |   56 |
| `relocation` |   48 |
| `suspension` |   11 |
| `delay`      |    2 |

这 64 条的 `content.rendered` 全部为空、`acf` 全部为空数组、`featured_media` 全部为 `0`。REST 可发现事件，不能直接得到事件正文。

真实记录：

```json
{
  "id": 8285,
  "date": "2026-08-07T17:07:05",
  "modified": "2026-08-07T17:08:14",
  "slug": "bus-stop-temporary-relocation-university-station-2",
  "title": {
    "rendered": "Bus Stop Temporary Relocation &#8211; University Station"
  },
  "content": { "rendered": "", "protected": false },
  "featured_media": 0,
  "link": "https://transport.cuhk.edu.hk/newsdetails/bus-stop-temporary-relocation-university-station-2/"
}
```

### 4.2 HTML 图片才有有效内容

[通告 8285 的 HTML 页](https://transport.cuhk.edu.hk/newsdetails/bus-stop-temporary-relocation-university-station-2/)实际引用 1798×2560 JPG：

<https://transport.cuhk.edu.hk/wp-content/uploads/news/Service_Information/TSP_ISI_2026_15_大學站校巴站臨時遷移-scaled.jpg>

因此通告 ingestion 至少需要：

1. 以 WordPress `id` 去重索引记录；
2. 从 HTML 定位图片/PDF资产并保留 hash；
3. OCR 只产生候选 `effectiveFrom/effectiveTo/routeRefs/stopRefs`；
4. 人工审核后才生成 `ServiceException`。

不能按标题去重：同一个 Shaw College 会在不同日期重复迁站；`(Completed)` 也可能是原 post 后续改名，而不是一个新的结束事件。

## 5. CUHK Bus Clock 固定版本

固定版本：[`575adc5475fc115001c30d9b5d5373384791c1f6`](https://github.com/CCheukKa/CUHK-bus-clock/tree/575adc5475fc115001c30d9b5d5373384791c1f6)。固定 commit 是必要条件，`main` 的路线/坐标以后变化会改变最近站结果。

### 5.1 原始 GPS

直接来源：[`data/bus-log.json`](https://github.com/CCheukKa/CUHK-bus-clock/blob/575adc5475fc115001c30d9b5d5373384791c1f6/data/bus-log.json)。

实取统计：

- 154 条记录，`timeStamp` 和 `location.timestamp` 各自均为 154 个唯一值；
- UTC 时间范围 `2025-02-21T02:06:13.000Z`–`2025-04-25T07:08:56.947Z`；
- 覆盖 25 个不同 UTC 日期；
- 9 个路线标签：1A=40、1B=14、2=27、3=19、4=5、5=9、8=19、H=20、N=1；
- 154 条 `location.mocked` 均为 `false`；设备报告 `accuracy` 范围约 3.79m–1000m。

字段：

```json
{
  "route": "1A",
  "timeStamp": "2025-02-21T02:06:13.000Z",
  "location": {
    "timestamp": 1740103573000,
    "mocked": false,
    "coords": {
      "latitude": 22.4146252,
      "longitude": 114.2102296,
      "accuracy": 6.510000228881836,
      "altitude": 0,
      "altitudeAccuracy": 0,
      "heading": 203.39356994628906,
      "speed": 0.5965909361839294
    }
  }
}
```

这个固定文件内可以用 `route + timeStamp` 唯一定位一条观测；更稳妥的来源键应再包含 commit 和原始记录 hash。它没有 vehicle/trip 身份，不能据此声称同一路线的相邻记录一定属于同一班车。

### 5.2 处理后标签与站间数组

直接来源：

- [`data/processed-bus-log.json`](https://github.com/CCheukKa/CUHK-bus-clock/blob/575adc5475fc115001c30d9b5d5373384791c1f6/data/processed-bus-log.json)
- [`data/station-times.json`](https://github.com/CCheukKa/CUHK-bus-clock/blob/575adc5475fc115001c30d9b5d5373384791c1f6/data/station-times.json)
- [`scripts/processing.ts`](https://github.com/CCheukKa/CUHK-bus-clock/blob/575adc5475fc115001c30d9b5d5373384791c1f6/scripts/processing.ts)

`processed-bus-log.json` 仍有 154 条，增加 `station`，覆盖 33 个唯一站点标签。`station-times.json` 有：

- 54 个 `origin>>destination` key；
- 49 个非空 pair、5 个空 pair；
- 共 113 个秒数；
- 22 个 pair 只有 1 个样本，16 个有 2 个，6 个有 3 个，1 个有 4 个，2 个有 5 个，另有两个 pair 分别有 11 和 16 个样本。

`station-times.json` 的 pair key 没有 route、日期、时段或 trip。它适合做带样本数的弱先验，不适合与别的时长数组按 pair 名直接拼接成“更多独立样本”。需要从 raw + processed 按固定处理版本重建 observation provenance。

### 5.3 TypeScript 常量

直接来源：[`constants/BusData.ts`](https://github.com/CCheukKa/CUHK-bus-clock/blob/575adc5475fc115001c30d9b5d5373384791c1f6/constants/BusData.ts)。实取：

- 19 个路线/变体代码，包括 `2+`、`5*`、`N+`、`H+` 等条件变体；
- 34 个站点常量和 34 组经纬度；
- 54 个 runtime 站间 timing entries；
- 至少 4 条 timing 代码行以 `//!` 显式标出人为复制/填充值。

这些常量适合提供别名、路线变体候选和坐标交叉检查。它们不是独立的实到观测；特别是 runtime timings 不能与 `station-times.json` 再合并一次，否则会重复计数，并可能把手工值当成 GPS 数据。

仓库顶层有 [GPL-3.0 `LICENSE`](https://github.com/CCheukKa/CUHK-bus-clock/blob/575adc5475fc115001c30d9b5d5373384791c1f6/LICENSE)，但没有为 `data/*.json` 单独写明数据许可或 GPS 数据提供者授权。生产使用前应澄清；在此之前只保存来源引用和隔离评估结果，不重新打包发布原始 GPS。

## 6. OpenStreetMap / Overpass

本轮实际查询（bbox 为 CUHK 及相邻道路，南、西、北、东）：

```overpass
[out:json][timeout:60];
nwr["highway"="bus_stop"](22.408,114.193,22.433,114.217);
out center tags;
```

查询接口：[Overpass API](https://overpass-api.de/api/interpreter)。取得的镜像快照标记 `timestamp_osm_base=2026-07-02T18:15:00Z`，共 130 个 node：

- 129 个有 `name:en`，129 个有 `name:zh`；
- 75 个没有 `operator`；
- 12 个为 `operator=CUHK`；
- 其余为 KMB、Citybus、Long Win 等校外站，不能导入 CUHK 站表。

真实节点：[OSM node 2035104643](https://www.openstreetmap.org/node/2035104643)：

```json
{
  "type": "node",
  "id": 2035104643,
  "lat": 22.4180416,
  "lon": 114.2098498,
  "tags": {
    "name": "善衡書院 S.H. Ho College",
    "name:en": "S.H. Ho College",
    "name:zh": "善衡書院",
    "operator": "CUHK",
    "local_ref": "15",
    "highway": "bus_stop",
    "public_transport": "platform"
  }
}
```

12 个明确 CUHK 节点只对应 10 个 normalized place name：University Administration Building 和 University MTR Station Piazza 各有两个不同 node，分别带不同 `route_ref`。这说明 OSM node 更接近站台/停靠点，不应按名称去重删除。

跨源匹配时应以 `osm type + osm id` 保存来源身份，再使用双语别名、方向、`route_ref` 和距离生成候选 `StopPlaceLink`。`operator=CUHK` 是高精度筛选，但召回不足；不能把没有该 tag 的校园节点自动排除，也不能把 bbox 内 130 个节点全导入。

## 7. 合并与去重规则

### 7.1 永远先保留来源记录

推荐的 staging identity：

```text
cuhk-wp:route:2554
cuhk-wp:stop:2544
cuhk-wp:newsdetails:8285
osm:node:2035104643
bus-clock:575adc5:bus-log:<route>:<timeStamp>
document:<sha256>
```

去重发生在 canonical link 层，不覆盖或删除原始记录。每条 canonical 值保留 `sourceRefs`、`retrievedAt`、`sourceModifiedAt`、`contentHash` 和 parser version。

### 7.2 分实体处理

| 实体             | 可以自动做                                                  | 不能自动做                                                         |
| ---------------- | ----------------------------------------------------------- | ------------------------------------------------------------------ |
| Route            | 官方 `id/slug` 定主身份；Bus Clock route code 作为 alias    | 把 `2`/`2+`、`N`/`N+` 等 pattern 变体无条件合并                    |
| Stop             | 官方 WordPress `id` 定运营 stop；名称和 OSM 距离建候选 link | 删除 Upward/Downward/PSLB 差异，或按 normalized name 覆盖成单站    |
| StopPlace        | 规范化名称 + 双语别名 + 邻近坐标生成候选组                  | 没有坐标/人工复核时把 34 个名称组视为最终地点                      |
| Schedule         | 官方 HTML/PDF 一致时生成 route/service-band 候选            | 以 WordPress `modified` 或 PDF metadata 充当 `validFrom`           |
| ServiceException | 按官方 news post `id` 保存；OCR 后人工审核有效期            | 按重复标题删除通告，或直接将 post `date` 当事件开始时间            |
| GPS observation  | 固定 commit 内按 `route + timeStamp` 连接 raw/processed     | 将相邻点必然解释成同一 trip，或再把 station-times 当新观测重复导入 |
| Segment prior    | `pair + source commit + sample count` 保存弱先验            | 把无 route 维度的 113 个秒数说成逐线路真值                         |

### 7.3 冲突优先级

1. 官方当前 HTML/PDF 决定计划服务，但发生冲突即进人工审核；
2. 官方 stop REST 决定运营身份，OSM 只补坐标和别名；
3. 已审核通告可在有效期内覆盖基础班次；
4. Bus Clock 只提供弱时长先验，不能覆盖官方路线/服务规则；
5. 所有推算的中间站时间持续显示“预计”。

## 8. 可直接交给抓取/合并实现的产物边界

第一轮合并程序应能稳定产出：

- 14 个 `RouteSourceRecord`；
- 46 个非空 `OfficialStopSourceRecord`，外加 34 个待审核 `StopPlaceCandidate`；
- 14 个当前 `RouteScheduleCandidate`，每个保留 HTML/PDF 双来源证据；
- 3 组 2024–25 `ScheduleSnapshot` 和 4 组当前 snapshot；
- 最近两年 64 个 `NewsSourceRecord`，全部标 `detailsStatus=image-review-required`；
- 12 个显式 CUHK OSM node link 候选，先映射到 10 个地点候选；
- 154 个 Bus Clock raw observation、154 个 processed label 和 49 个非空 segment-prior groups，但绝不重复计数其 113 个时长。

这已经足够生成并审计第一版路线、当天起点班次和一部分中间站 offset。仍然缺失的是真实到站反馈、可靠的 trip identity、完整站点坐标映射和官方 realtime feed。

## 许可说明

- CUHK 的[网站免责声明](https://www.cuhk.edu.hk/english/disclaimer.html)说明内容可无预告更改并排除依赖责任，但不是开放数据许可。公开 REST、HTML 和 PDF 仍应只抓取必要字段、保留 attribution/URL/hash，并在批量再发布前确认授权。
- Bus Clock 仓库顶层 GPL-3.0 明确覆盖代码仓库的开源分发安排，但数据文件没有单独的数据权利说明；原始 GPS 的生产使用和再发布需进一步确认。
- OpenStreetMap 数据明确采用 ODbL；使用坐标和派生数据库时必须遵守相应署名及 share-alike 条件。
