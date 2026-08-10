# CUHK 公共校园地图作为 CUpedia 底图的可行性调研

调研日期：2026-08-11（Asia/Hong_Kong）

## 决策结论

**不应把 CUHK 当前公共校园地图的瓦片、Google API key 或静态地点数据库直接接入 CUpedia 生产环境。** 它目前适合作为人工核实校园名称、设施类别和大致位置的事实参考，以及未来向 CUHK 申请正式数据合作时的需求样本；在获得 CUHK 明确书面授权、独立数据端点和稳定性承诺前，不应把它注册为 `BasemapProvider`，也不应批量复制、代理或重新托管其内容。

原因不是技术上完全无法读取，而是该页面并非一个获得公开复用许可的地图 API：

1. [CUHK 官方校园地图页面](https://www.cuhk.edu.hk/english/campus/cuhk-campus-map.html) 实际加载 **Google Maps JavaScript API**，以 Google `ROADMAP` 为全局基础地图；在校园范围内，CUHK 再盖上一组不透明的自绘 raster tiles，使它视觉上成为 campus-local basemap。
2. CUHK overlay 是未文档化的 256×256 PNG 瓦片目录，只覆盖 zoom 15–19；地点、设施、校巴站和路线则来自一个浏览器直接执行的静态 JavaScript 数据文件，不是带版本契约的数据 API。
3. CUHK 页面提示地图可能不按比例、资料不实时；CUHK 的[免责声明](https://www.cuhk.edu.hk/english/disclaimer.html)又说明网站内容可不经通知变更、校方不对依赖资料造成的损失负责，并在页脚标明 “All Rights Reserved”。公开可读取不等于获准复制、缓存、嵌入或再发布。
4. 页面中的 Google key 属于 CUHK 的 Google Cloud 项目。CUpedia 不能复制使用；若沿用 Google Maps 架构，必须使用自己的项目、key、billing 和域名/API 限制，同时遵守 Google 对缓存、抓取、派生数据和 attribution 的限制。

对 CUpedia 的推荐仍是：

- renderer 使用 MapLibre GL JS；
- MVP 使用明确允许应用复用的 LandsD Vector/Topographic API；
- 稳定版使用按 CUHK/Hong Kong bbox 生成、自行托管的 OSM 派生 PMTiles；
- 建筑、设施、楼层、申请、评论和路线图全部进入 CUpedia 自有事实平台；
- CUHK 官方地图只作为 `reference source`，人工独立核验后记录来源，不自动整库导入。

## 核验方法与口径

本报告只使用一手材料：CUHK 官方页面、页面加载的 CUHK 脚本和瓦片、CUHK 官方免责声明、Google Maps Platform 官方文档与条款、LandsD/CSDI 官方 API 文档与条款、OpenStreetMap 官方许可证说明、PMTiles 官方文档。

页面与静态资源在 2026-08-11 通过 HTML source、JavaScript 实现和 HTTP response headers 交叉核对。`Last-Modified` 只能说明服务器对该资源给出的修改时间，不能证明资料在现实世界中的完整性或准确性。

“技术可访问”和“法律可复用”分开判断。没有公开 license 或正式 API 条款时，本报告不把匿名可下载的文件推定为开放数据。本报告也不是法律意见；正式复用 CUHK 资产应由项目取得校方书面许可。

## 当前 CUHK 地图的实际组成

```text
Google Maps JavaScript API
└── Google ROADMAP（全局基础地图）
    ├── CUHK campus-local raster basemap overlay（不透明，TMS PNG，z15–19）
    ├── CUHK markers（建筑 / 设施 / 地标 / 校巴站）
    └── CUHK 预编码路线（校巴、步行等静态线形）

CUHK static JavaScript database
└── 浏览器内搜索、筛选和 InfoWindow；不是开放 JSON/API 服务
```

### Renderer 与 Google 基础地图

[官方页面源码](https://www.cuhk.edu.hk/english/campus/cuhk-campus-map.html) 通过 `maps.googleapis.com/maps/api/js?v=3&key=…` 加载 Google Maps JavaScript API。页面公开包含一个 client-side API key；本报告刻意不复制该 key。

CUHK 的 [`cuhk_map_config.js`](https://www.cuhk.edu.hk/english/js/campus/cuhk_map_config.js?20220113) 创建 `google.maps.Map`，并明确使用：

- `mapTypeId: google.maps.MapTypeId.ROADMAP`；
- Google `Marker`、`InfoWindow`、`LatLng`、`ImageMapType`；
- 关闭 Street View 和 map type selector，但保留 Google 的平移、缩放和比例尺控件。

因此，“CUHK online map”不是 CUHK 独立提供的一套全球或香港底图；它是 Google renderer 与 Google ROADMAP 加上 CUHK campus-local raster basemap 的组合。校园内的 sample tile 为全不透明 RGBA，会遮住下层 Google ROADMAP；范围外使用全透明 `blank.png`，才继续显示 Google 背景。

### CUHK 自托管 raster overlay

同一 [`cuhk_map_config.js`](https://www.cuhk.edu.hk/english/js/campus/cuhk_map_config.js?20220113) 创建 `google.maps.ImageMapType`，瓦片 URL 为：

```text
/english/images/campus/tile-map/{z}/{x}/{2^z-y-1}.png
```

实现特征如下：

- tile size 为 256×256 PNG；
- 支持 zoom 15–19，默认 zoom 16；
- 代码把 Google/XYZ 的 `y` 翻转为 `2^z-y-1` 后取文件，因此服务器目录使用 **TMS y 方向**；
- 只在 CUHK 设定的 campus bounds 相交且 zoom 合法时返回实际瓦片，否则返回 `blank.png`；
- overlay 通过 `overlayMapTypes.insertAt(0, …)` 叠在 Google ROADMAP 上。

服务器上确实存在可匿名读取的瓦片。例如按当前中心点计算的 [z19 sample tile](https://www.cuhk.edu.hk/english/images/campus/tile-map/19/428470/295661.png) 在调研时返回 200、`image/png`、256×256 RGBA、`ETag` 和 `Last-Modified: Tue, 30 Nov 2021`；其 alpha 全为 255，即校内自绘 raster 本身不透明。范围外的 `blank.png` alpha 全为 0。响应没有 `Cache-Control`，以非 CUHK `Origin` 请求时也没有 `Access-Control-Allow-Origin`。

这意味着：

- 目录结构足以让工程师推导 MapLibre raster source 的 `scheme: "tms"`；
- 但它不是有文档、版本、SLA、CORS 和复用条款的 provider；
- 浏览器中的 WebGL/CORS 行为不可依赖；通过 CUpedia proxy 或复制到自己的存储虽然能绕开技术限制，却会形成未经许可的缓存/再托管，因此不能作为实现方案。

### 地点、设施与路线数据来源

[官方页面源码](https://www.cuhk.edu.hk/english/campus/cuhk-campus-map.html) 加载 [`cuhk_location_db.js`](https://www.cuhk.edu.hk/english/js/campus/cuhk_location_db.js?20161006)。这个文件向全局暴露 `CUHK_MAP_DATA`，包含：

- campus/college；
- buildings；
- facilities 与 facility categories/types；
- landmarks；
- shuttle bus stops、route/segment；
- walking route 与进入校园的交通线形；
- InfoWindow 字段配置和其他校区。

数据中直接保存中英文名称、建筑代码、`lat_lng`、照片名称、联系方式和部分预编码 polyline。对当前文件逐数组核对得到 159 栋 buildings、382 条 facilities（372 条有坐标、366 条标记为在 Campus Map 显示）、26 个 landmarks、51 个 shuttle stops、19 条 route/segment records 和 2 条 walking routes。

设施包括 51 条 water dispensers、68 条 outdoor recycling/litter bins、8 条 nursing rooms 和 7 条 classrooms/lecture theatres，另有餐厅、图书馆与停车场等；没有独立的 toilet 或 printer 类型。这说明它对 CUpedia 很有参考价值，但不能覆盖用户已提出的全部设施目标。[`cuhk_map_init.js`](https://www.cuhk.edu.hk/english/js/campus/cuhk_map_init.js?20220113) 的搜索逐项遍历 `CUHK_MAP_DATA.buildings`、`facilities`、`landmarks` 和 `shuttle_bus_stops`，没有调用 server-side campus search API。页面自身也明确提示资料不实时、地图可能不按比例。

HTTP headers 显示该数据文件在调研时为约 397 KB，`Last-Modified: Mon, 06 Jul 2026`；文件 URL 的 query suffix 仍是 `20161006`。这说明内容近期有人更新，但 URL 版本号并不是可信的 semantic version，也没有 changelog、schema 或兼容性承诺。

路线同样不是实时导航。配置脚本从数据文件读取预编码路线并直接绘制；页面中的 walking-route 交互代码还有被注释掉的部分。它不能回答楼内走廊、楼梯、电梯、开放时段或无障碍条件。

### 坐标系、覆盖与显示精度

地点以 `google.maps.LatLng(latitude, longitude)` 创建。CUHK 文件没有声明 EPSG code；Google 的[坐标与瓦片官方文档](https://developers.google.com/maps/documentation/javascript/coordinates)说明 Maps JavaScript API 的经纬度使用 WGS84，并通过 Mercator 投影生成 world/pixel/tile coordinates。因此下列坐标系是根据 Google API 语义作出的技术推断，而不是 CUHK 发布的数据规格：

- 点位坐标：WGS84 经纬度；
- raster overlay：Web Mercator tile grid，服务器 y 采用 TMS 翻转；
- CUHK 代码中的 internal bounds 约为 22.410721–22.428831 N、114.199509–114.216317 E；更大的 external bounds 用于判断是否返回 overlay tile；
- native zoom 为 15–19，z19 在校园纬度的理论 Web Mercator pixel resolution 约为 0.276 m/px。

最后一项只是瓦片网格的理论像素尺寸，不代表其建筑轮廓或点位有 0.276 m 测量精度。CUHK 页面明确说地图可能不按比例，且没有公开测量方法、误差、控制点或 QA 说明。没有发现楼层几何、房间 polygon、走廊 graph 或 vertical connector 数据。

## Access、attribution、缓存与复用边界

### CUHK 内容

公共页面、JavaScript 数据和 raster tiles 在调研时都无需登录或 CUHK 身份即可读取，但没有找到下列任一项：

- CUHK Campus Map API 文档；
- 对瓦片或 `CUHK_MAP_DATA` 的开放许可证；
- 允许第三方 iframe/embed、批量下载、缓存、修改或再托管的条款；
- API/version/SLA/update cadence；
- CORS contract 或第三方 access key 申请流程。

相反，CUHK 的[免责声明](https://www.cuhk.edu.hk/english/disclaimer.html)说明内容可不经通知变更、校方不承担依赖责任，并标示 “Copyright © 2026. All Rights Reserved.”；[地图页面](https://www.cuhk.edu.hk/english/campus/cuhk-campus-map.html)自身另有“不按比例、非实时”的显著提示。因此可执行的边界是：

地图配置会在界面加入 CUHK logo control 和免责声明，Google ROADMAP 则由 Google API 显示自身 attribution；配置中没有找到针对 CUHK raster tiles 的第三方复用许可证或授权文字。显示 CUHK logo 只能证明来源/品牌，不能解释为开放许可。

| 使用方式                           | 结论                 | 理由                                                          |
| ---------------------------------- | -------------------- | ------------------------------------------------------------- |
| 链接至 CUHK 官方地图               | 可以作为外部参考链接 | 不复制内容，用户直接查看官方来源                              |
| 人工查看后到现场独立核实名称/位置  | 可以作为调查线索     | CUpedia 应记录自己的观察证据，不整库复制                      |
| 直接加载 CUHK raster tile URL      | **No-go**            | 无公开授权/API 契约/CORS，端点可随时变动                      |
| 通过 CUpedia proxy 缓存瓦片        | **No-go**            | 技术上能做，但构成复制/缓存/再分发风险                        |
| 批量解析并导入 `CUHK_MAP_DATA`     | **No-go**            | 静态文件公开不等于数据库获开放许可                            |
| 将官方页面 iframe 当核心地图       | **No-go**            | 无明确 embedding 权利，无法控制数据、交互、可用性和供应商依赖 |
| 获得 CUHK 书面许可后的正式数据同步 | 可另行设计           | 需明确许可范围、数据格式、更新和责任边界                      |

### Google Maps 内容与 key

CUHK 页面上的 Google key 是 client-side credential，不是给第三方共享的公共 token。Google 的[API security guidance](https://developers.google.com/maps/api-security-best-practices)要求按网站和 API 限制 key，并建议每个应用使用独立 key；CUpedia 若选择 Maps JavaScript API，必须开自己的 Google Cloud project、启用 billing 并使用自己的受限 key。[Maps JavaScript API billing 文档](https://developers.google.com/maps/documentation/javascript/usage-and-billing)也明确要求 billing 和 API key；截至调研日，[官方价格表](https://developers.google.com/maps/billing-and-pricing/pricing)列出的 Dynamic Maps 每月免费 usage cap 是 10,000 次 map loads，超过后按量计费。

更关键的是，[Google Maps Platform Terms](https://cloud.google.com/maps-platform/terms)禁止在服务之外抓取、预取、索引、重托管或批量下载 Google Maps Content，除特定例外外也禁止缓存；条款还禁止从 Google content 建立派生数据，例如描摹道路或建筑轮廓，并要求保留 Google 提供的 logo、版权和 attribution。

因此不能：

- 复制 CUHK 页面中的 Google key；
- 抓取 Google ROADMAP tiles 与 CUHK overlay 合成为自己的 basemap；
- 从 Google 背景描摹建筑、道路或 POI，写入 CUpedia canonical facts；
- 隐藏或覆盖 Google attribution；
- 认为 CUHK 对自己 overlay 的潜在授权会自动授权 Google 内容。

## 稳定性与新鲜度判断

截至 2026-08-11 的直接资源观测：

| 资源                       | 服务器 `Last-Modified` | 判断                                                     |
| -------------------------- | ---------------------- | -------------------------------------------------------- |
| `cuhk_location_db.js`      | 2026-07-06             | 地点/设施数据近期仍有更新，但无 schema/version/changelog |
| `cuhk_map_config.js`       | 2022-01-13             | renderer/overlay 实现较旧                                |
| `cuhk_map_init.js`         | 2022-01-13             | 搜索与交互实现较旧                                       |
| z19 sample raster tile     | 2021-11-30             | 校园底图绘制至少该 tile 较旧                             |
| printable `campus-map.pdf` | 2022-07-28             | 不能代表当前在线数据库                                   |

CUHK 在 [2009 年官方 Newsletter 第 349 期](https://www.iso.cuhk.edu.hk/images/publication/archive/newsletter/349/pdf/NSL349_full.pdf)已经把当时的新校园地图描述为使用 Google technology，并列出 overlay、zoom、照片、地址、联系方式、开放时间与交通资料等能力。当前页面仍使用 jQuery、`v=3` Google Maps loader 和已经过时的 `sensor=true` 参数，代码注释中也存在旧版交互和被禁用路线逻辑。它是持续更新地点数据的长期 legacy application，而技术栈、内部 URL 和 Google key 都不属于对第三方承诺的公共接口。

数据文件比 raster tiles 新约四年，可能出现“点位更新了，但底图建筑/道路绘制未同步”的不一致。CUHK 自己的非实时提示印证了这一风险。对厕所、饮水机、打印机和无障碍路线等高变动事实，必须有独立的 `observedAt`、来源、审核和过期机制。

## 与 LandsD 和自托管 OSM PMTiles 的直接比较

| 维度         | CUHK 当前公共地图                                              | LandsD Vector / Topographic                                         | 自托管 OSM 派生 PMTiles                                            |
| ------------ | -------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------ |
| 本质         | Google ROADMAP + 校内不透明 CUHK raster basemap + 静态 JS 数据 | 政府正式 XYZ/PBF map APIs                                           | 从 OSM 数据生成的自有只读 tile archive                             |
| renderer     | Google Maps JavaScript API                                     | MapLibre/Leaflet 等均可                                             | MapLibre/Leaflet 等均可                                            |
| native zoom  | CUHK raster z15–19                                             | Vector z9–15；Topographic z10–20                                    | 由生成管线决定                                                     |
| 坐标         | WGS84 points；Web Mercator/TMS raster                          | WGS84 或 HK80；文档化 tile scheme                                   | 通常 WGS84/Web Mercator vector tiles                               |
| 自定义样式   | CUHK raster 不可重绘；Google style 受 Google API 限制          | Vector 可通过 style JSON 定制；Topographic 是 PNG                   | 完全控制 style、layer 和 label                                     |
| 室内/楼层    | 未发现楼层几何或室内 graph                                     | 底图本身不保证 CUHK 室内覆盖                                        | 不自动产生室内资料；可叠加 CUpedia 自有楼层                        |
| access/key   | CUHK 文件匿名可读但非正式 API；Google key 不可复用             | 页面列出的 Vector/Topographic URL 无 key 参数                       | 无第三方 key；使用自己的 storage/CDN                               |
| 费用         | CUpedia 若用 Google 须独立 billing；CUHK 端点无服务承诺        | 数据可免费商用/非商用复用，但需署名并避免短时大量请求               | 支付自己的生成、存储和流量成本                                     |
| 复用权       | CUHK 未授开放 license；Google 另有严格条款                     | CSDI 条款明确允许免费浏览、下载、分发和复制，须注明政府/CSDI 来源等 | OSM ODbL 允许复制、分发和改编，须署名并遵守 share-alike 数据库义务 |
| 缓存/离线    | CUHK 未授权；Google 一般禁止                                   | 以 CSDI/LandsD 条款及服务 notice 为准；应保留 provider adapter      | archive 与 cache 均由 CUpedia 控制                                 |
| 稳定性       | 未文档化内部文件，可不经通知变化                               | 正式 API，但版本可能撤除且可暂停；需 fallback                       | 自己控制版本、回滚和更新周期                                       |
| CUpedia 角色 | **仅事实参考/合作线索**                                        | **MVP basemap provider**                                            | **稳定版首选 basemap provider**                                    |

### LandsD 为什么比 CUHK 端点更适合 MVP

LandsD 的 [Vector Map API](https://portal.csdi.gov.hk/csdi-webpage/apidoc/VectorMapAPI) 明确定义 PBF tile、style JSON、WGS84/HK80、XYZ scheme 和 zoom 9–15；[Topographic Map API](https://portal.csdi.gov.hk/csdi-webpage/apidoc/TopographicMapAPI) 明确定义 PNG XYZ tiles、WGS84/HK80 和 zoom 10–20。二者都要求在地图正面显示 Lands Department logo 和版权文字，并要求应用不要在短时间发出大量请求；旧 API version 也可能被移除，因此仍需 adapter 和 fallback。

决定性的差别是许可。[CSDI Terms and Conditions](https://portal.csdi.gov.hk/csdi-webpage/doc/TNC) 把 digital maps、data specifications 和 API 纳入 Data，并明确允许在遵守条款、清晰标注政府/CSDI 来源和知识产权的前提下，免费用于商业及非商业的浏览、下载、分发、复制、链接和打印。CUHK 网站没有给出同等授权。

校园级显示时，Vector z15 可 overzoom 并承载可定制的香港上下文；若需要原生更高倍数的官方背景，可切换/叠加 Topographic z10–20。两者都不应承担 CUpedia 的设施、楼层和路线事实。

### 自托管 OSM PMTiles 为什么更适合稳定版

[OpenStreetMap 官方版权与许可证页](https://www.openstreetmap.org/copyright)说明 OSM 数据采用 ODbL：允许复制、分发和改编，但必须署名 OpenStreetMap contributors，并对基于数据库的分发遵守相同许可证义务；同页也明确提醒 OSM data 开放不代表公共 tile server 是免费第三方 CDN。因此稳定版应生成并托管自己的 tiles，而不是依赖 `tile.openstreetmap.org`。

[PMTiles 官方文档](https://docs.protomaps.com/pmtiles/)把 PMTiles 定义为单文件 tile pyramid archive，通过 HTTP Range Requests 按需取 tile，可放在 S3 类对象存储；它是只读格式，更新时重建整个 archive。对 CUHK/Hong Kong bbox，这带来：

- 不依赖 Google/CUHK key 或未文档化端点；
- style、zoom、缓存、CDN、回滚和更新时间由 CUpedia 控制；
- 可将上一版 archive 保留为故障回退；
- OSM 只承担道路、建筑与基础环境，CUpedia facts/indoor/routes 仍独立更新。

代价是维护定期导入、署名/ODbL 合规、对象存储和 CDN；OSM 在 CUHK 的具体正确性也需要实地 QA。它不是“免费且无需维护”，而是“复用权明确且运维可控”。

## 对 CUpedia 的实施约束

### Provider 分类

```text
BasemapProvider
├── landsd-vector
├── landsd-topographic
└── osm-pmtiles

ReferenceSource
└── cuhk-public-campus-map
```

`ReferenceSource` 只进入事实的 provenance UI 和管理员核验流程，不能向 MapLibre 返回 CUHK tile/style URL。这样以后 CUHK 若正式授权，只需新增一个经过许可审查的 provider 或 import adapter，不会把未经授权的依赖渗入地图组件。

### 可以立即采用的 CUHK 信息

- 把官方地图链接放在管理员的“外部核实来源”中；
- 用其建筑命名、简称、设施类别和校巴站列表作为实地采集 checklist；
- 每条 CUpedia fact 必须来自独立实测、用户提交后审核、获许可数据，或另一个明确开放的数据源；
- 保存 `sourceUrl`、`observedAt`、evidence、reviewer 和 confidence；
- 发现 CUHK 官方地图与实测冲突时，不自动覆盖，进入 reconciliation queue。

不要把 `cuhk_location_db.js` 直接变成 seed fixture，也不要从 CUHK raster 或 Google 背景描边生成建筑 polygon。

### 向 CUHK 申请数据合作时必须确认

1. CUHK 是否拥有 raster overlay、地点数据库、照片和路线线形的完整第三方授权；
2. 是否允许 CUpedia 复制、修改、转换为 GeoJSON/PMTiles、缓存、公开展示和再分发；
3. 是否允许长期保存历史版本和修订 diff；
4. attribution、CUHK 名称/logo/trademark 的准确要求；
5. 可提供的正式 API/export 格式、schema、稳定 ID、WGS84 精度和更新周期；
6. 建筑、设施、房间/楼层、入口、无障碍和校巴资料的覆盖范围；
7. 删除、更正、紧急下线和责任联系人；
8. CORS、rate limit、SLA、版本弃用和故障回退安排；
9. 数据与 Google Maps Content 的边界，确保授权材料可在非 Google basemap 上合法显示。

只有这些问题得到书面答案，CUHK 内容才可从“参考来源”升级为“正式数据源”或“底图 provider”。

## 最终选择

| 决策                         | 结论                                                 |
| ---------------------------- | ---------------------------------------------------- |
| 直接使用 CUHK Google key     | 禁止                                                 |
| 直接使用 CUHK raster tiles   | 不采用，除非取得书面授权与正式技术契约               |
| 批量导入 CUHK 静态 JS 数据库 | 不采用，除非取得明确数据许可                         |
| iframe 官方地图              | 仅可考虑普通外链，不作为核心地图或嵌入依赖           |
| CUHK 官方地图的当前角色      | 人工事实参考、实测 checklist、合作需求样本           |
| CUpedia MVP basemap          | LandsD Vector；高倍显示需要时切换 LandsD Topographic |
| CUpedia 稳定版 basemap       | 自托管 CUHK/Hong Kong OSM 派生 PMTiles               |
| 校园设施与楼层               | CUpedia 自有、可追溯、按数据质量逐栋开放             |

CUHK 地图最有价值的部分不是可偷接的 tile URL，而是它证明校方已经维护一套中英建筑、设施、校巴站与地点分类。CUpedia 应争取正式合作或把它转化为实地采集清单；在此之前，选择许可明确且可替换的底图，才能真正实现“一个事实平台，多种地图表现”。
