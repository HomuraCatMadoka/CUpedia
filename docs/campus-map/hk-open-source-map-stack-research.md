# 香港开源地图项目技术栈调研

调研日期：2026-08-10

## 结论

本次核验了七个有明确开源许可证、与香港地图直接相关的项目。样本中没有项目把 Google Maps 或高德作为当前主地图栈：四个使用 MapLibre GL JS，两个使用 Leaflet，一个为 CUHK 场景直接使用 Three.js。更重要的共同点不是某个品牌，而是把以下四层拆开：

1. **渲染器**：MapLibre、Leaflet 或 Three.js，只负责把地图画出来。
2. **底图/瓦片**：地政总署 Vector Map API、OSM 派生 PMTiles、自建 OpenMapTiles/TileServer GL、OSM/CARTO 公共瓦片等。
3. **业务数据**：巴士站、交通标志、校园建筑和设施等，以 GeoJSON、PMTiles、PostGIS 或项目自己的 JSON 单独加载。
4. **搜索与路线**：本地索引、地政总署 Location Search API、项目自建图搜索、OSRM 等，均不是渲染器自动提供的能力。

对 CUpedia 最合适的路线是：

- 采用 **MapLibre GL JS** 作为网页渲染器，但通过一个很薄的 basemap adapter 让底图可替换。
- 初期可用地政总署官方底图；稳定版参照 `hkbus.app`，为 CUHK 周边定期生成并托管 OSM 派生 PMTiles，地政总署标签作为可选叠加层。
- 地点、设施、课室、楼层、申请、审批、评论和星级全部保存在 CUpedia 自己的事实平台中，绝不写进底图瓦片，也不依附 Google/高德的地点 ID。
- 搜索先查自己的校园索引，地政总署 Location Search 只作为香港通用地点的补充。
- 楼层图是 CUpedia 的自有 overlay：每层一组矢量要素，必要时另加一张原创/获授权的配准底图；没有数据就不解锁该楼层。
- 路线仅在入口、走廊、楼梯、电梯和楼层连接图完成 QA 后开放。公开 OSRM 不能补齐校园室内拓扑。

## 研究口径

“开源地图项目”在本报告中必须至少有公开源代码，并能从仓库中的包清单、配置或实现代码核验技术栈。README 的描述如果和实现冲突，以实现为准。代码许可证、数据许可证和在线服务条款分开记录；公开可访问的瓦片不等于可无限量使用。

以下均为截至调研日仍可访问、且在 2026 年有代码提交的香港相关项目。项目的业务规模和成熟度差异很大，因此这里只用它们回答“实际怎么组装地图栈”，不把任一项目直接当成完整产品模板。

## 项目对照表

| 项目                                                                                        | 渲染器/SDK                                 | 底图或瓦片                                                        | 业务数据                                                        | 搜索                                       | 路线                                                     | 许可证                                                    |
| ------------------------------------------------------------------------------------------- | ------------------------------------------ | ----------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------ | -------------------------------------------------------- | --------------------------------------------------------- |
| [hkbus.app](https://github.com/hkbus/hk-independent-bus-eta)                                | MapLibre GL JS，经 `react-map-gl/maplibre` | 自托管香港 OSM 派生 PMTiles；可选地政总署栅格标签                 | 自有巴士数据库、站点和路线 GeoJSON                              | 本地巴士站 + 地政总署 Location Search API  | 公交方案和已有路线线形；步行段只是直线，不是通用步行路由 | GPL-3.0-only；瓦片生成器 Unlicense；OSM 数据 ODbL         |
| [CUHK Campus 3D](https://github.com/PeterZh6/cuhk-campus-3d)                                | Three.js                                   | 不用第三方底图服务；由项目生成地形、建筑和地表纹理                | OSM、LandsD DTM/建筑高度、CUHK 校巴资料生成静态 JSON/二进制资产 | 本地建筑及 POI 索引                        | 自建 OSM 步行图上的 elevation-aware A\*                  | 代码 MIT；生成数据继承 ODbL、DATA.GOV.HK 等来源条款       |
| [BNBU Map](https://github.com/HaoTian22/BNBU-Map)                                           | MapLibre GL JS 3.6                         | 自建 OpenMapTiles/OSM Liberty，TileServer GL 托管 MBTiles         | OSM POI JSON；评论由 Waline 独立承载                            | 浏览器内搜索本地 POI                       | 未核验到路线引擎                                         | MIT；OSM 数据 ODbL，OpenMapTiles/OSM Liberty BSD-3-Clause |
| [Hong Kong Open Map](https://github.com/wangwailok/hong-kong-open-map)                      | MapLibre GL JS                             | 地政总署 WGS84 Vector Map API 与中英文 label style                | 组件调用者传入 markers                                          | 无                                         | 无                                                       | 组件 MIT；地图资料受 LandsD 条款约束                      |
| [HK Traffic Sign Map](https://github.com/williamchong/hk-traffic-sign-map)                  | MapLibre GL JS                             | 浅色直接用 OSM 标准栅格瓦片，深色用 CARTO；交通标志自托管 PMTiles | 运输署 Traffic Aids Drawings 数据生成两套 PMTiles               | 浏览器内搜索标志目录                       | 无                                                       | GPL-3.0；政府数据受 DATA.GOV.HK 条款约束；底图另行署名    |
| [HK Country Park Facilities Explorer](https://github.com/Machin001/hk-country-parks-webgis) | Leaflet 1.9.4                              | OSM 标准栅格底图 + GeoServer WMS                                  | 四个 CSDI 数据集进入 PostGIS/GeoServer                          | PostGIS `ILIKE` 跨图层搜索                 | 调用公共 OSRM endpoint                                   | MIT；数据及 OSM 分别按来源条款                            |
| [Should I Take Taxi?](https://github.com/williamchong/should-i-take-taxi)                   | Leaflet，经 `@nuxtjs/leaflet`              | CARTO light/dark 栅格瓦片                                         | 用户选择的起终点及估算结果                                      | LandsD Location Search；Nominatim 反向查询 | 公共 OSRM demo 的驾车路线                                | GPL-3.0；各公共服务另受使用政策约束                       |

## 逐项核验

### 1. hkbus.app：MapLibre + 自托管 OSM PMTiles + LandsD 标签

这是本次样本中最值得 CUpedia 借鉴的生产形态。

- [`package.json`](https://github.com/hkbus/hk-independent-bus-eta/blob/master/package.json) 明确依赖 `maplibre-gl`、`react-map-gl` 和 `pmtiles`；[`BaseMap.tsx`](https://github.com/hkbus/hk-independent-bus-eta/blob/master/src/components/map/maplibre/BaseMap.tsx) 通过 `react-map-gl/maplibre` 创建地图，并注册 `pmtiles://` protocol。
- [`style.ts`](https://github.com/hkbus/hk-independent-bus-eta/blob/master/src/components/map/maplibre/style.ts) 把矢量源指向 `https://pmtiles.hkbus.app/hong-kong.pmtiles`，同时允许用环境变量传入地政总署 raster label URL。底图、标签和公交业务图层是三个独立来源。
- 独立的 [`hk-pmtiles-generation` workflow](https://github.com/hkbus/hk-pmtiles-generation/blob/main/.github/workflows/generate-maptiles.yml) 每四天从 Geofabrik 下载香港 OSM PBF，使用 Protomaps basemaps 生成 `hong-kong.pmtiles`，再部署到静态托管。该仓库的 [README](https://github.com/hkbus/hk-pmtiles-generation/blob/main/README.md) 明确要求 OSM 署名，并把瓦片视为 ODbL 数据库的 Produced Work。
- [`AddressInput.tsx`](https://github.com/hkbus/hk-independent-bus-eta/blob/master/src/components/route-search/AddressInput.tsx) 先在本地站点列表中匹配，再请求地政总署 `locationSearch`，并将 HK1980 坐标转换为 WGS84。地政总署官方文档也把 [Location Search API](https://portal.csdi.gov.hk/csdi-webpage/apidoc/LocationSearchAPI) 定义为按地址、建筑、地点或设施名称查找位置的 HTTP API，并提示避免短时间大量请求。其 [What's New](https://portal.csdi.gov.hk/csdi-webpage/info/WhatsNew) 还说明该 API 自 2026-05-04 起已从 `geodata.gov.hk` 迁移到 `www.map.gov.hk`；配置必须集中管理，不能把旧 hostname 散落在组件中。
- [`useRoutePath.tsx`](https://github.com/hkbus/hk-independent-bus-eta/blob/master/src/hooks/useRoutePath.tsx) 加载预生成的公交路线 GeoJSON，缺失时按站点连线；[`SearchMap.tsx`](https://github.com/hkbus/hk-independent-bus-eta/blob/master/src/components/map/maplibre/SearchMap.tsx) 中接驳步行段也是两点直线。因此它展示的是公交方案，不应被误读为通用步行或室内路由引擎。

对 CUpedia 的启示：可以复用“香港 bbox 的 OSM → PMTiles → 静态托管”模式；搜索和路线仍应独立设计。PMTiles 既降低瓦片服务运维，也让供应商替换和缓存策略掌握在自己手里。

### 2. CUHK Campus 3D：不用在线底图，数据资产与路线完全自建

这是最直接的 CUHK 技术参照，但它解决的是室外 3D 与路由，不是楼层地图。

- [`package.json`](https://github.com/PeterZh6/cuhk-campus-3d/blob/main/package.json) 的运行时依赖只有 Three.js；项目的 [README](https://github.com/PeterZh6/cuhk-campus-3d/blob/main/README.md) 记录了 OSM、LandsD 5 m DTM、LandsD 建筑高度和 CUHK 校巴时刻等来源，并说明管线生成 `terrain.bin`、`buildings.json`、`graph.json`、`pois.json` 等静态资产。
- [`SearchIndex`](https://github.com/PeterZh6/cuhk-campus-3d/blob/main/src/ui/search.ts) 只搜索项目生成的建筑和 POI 数组，支持英文和中文；它不是对 Google、OSM Nominatim 或其他 geocoder 的转发。
- [`Router`](https://github.com/PeterZh6/cuhk-campus-3d/blob/main/src/routing/astar.ts) 在项目自己的 OSM 步行图上运行 A\*，以坡度步行时间和楼梯速度作为边权重。
- [`Minimap`](https://github.com/PeterZh6/cuhk-campus-3d/blob/main/src/ui/minimap.ts) 把已经生成的地面 canvas 缩放成小地图，并叠加路线与相机方向；它不请求第三方地图瓦片。
- [`LICENSE`](https://github.com/PeterZh6/cuhk-campus-3d/blob/main/LICENSE) 将代码置于 MIT 下，但明确生成数据仍分别受 OSM ODbL、DATA.GOV.HK 等来源条款约束。

对 CUpedia 的启示：校园搜索和路线可以完全基于自己的 canonical data，不需要由底图厂商提供。它也证明“路线质量取决于图数据”——当前项目已注明天桥会被贴到地形、部分高度和校巴时间是估计或快照，CUpedia 若对公众提供路线必须加入更严格的 QA 和可见置信度。

### 3. BNBU Map：MapLibre + 自建 TileServer GL 的大学校园案例

这是与“社区校园地图 + 评论”最接近的公开案例。

- [README](https://github.com/HaoTian22/BNBU-Map/blob/main/README.md) 列出 MapLibre GL JS、TileServer GL、OpenMapTiles、OSM Liberty 和 OSM 数据，并说明 POI 每日通过 Overpass 更新、地图瓦片每周更新。
- 实际 [`index.html`](https://github.com/HaoTian22/BNBU-Map/blob/main/index.html) 加载 `maplibre-gl@3.6.0`，地图 style 指向项目自己的 TileServer GL endpoint。README 早期段落仍写过 Mapbox GL JS，但当前实现是 MapLibre，说明选型不能只看说明文字。
- [`Tileserver-GL/config.json`](https://github.com/HaoTian22/BNBU-Map/blob/main/Tileserver-GL/config.json) 把 `BNBU.mbtiles` 和 `BNBU-3D.mbtiles` 暴露为 OpenMapTiles 数据源，并应用 OSM Liberty styles。
- 搜索从本地 `POI.json` 过滤名称和类别；地图数据贡献被引导至 OpenStreetMap。评论页使用独立的 [Waline API](https://github.com/HaoTian22/BNBU-Map/blob/main/comments.html)，所以“地图事实”和“用户留言”没有混进同一种数据结构。
- [LICENSE](https://github.com/HaoTian22/BNBU-Map/blob/main/LICENSE) 为 MIT，并单独列出 OSM、OpenMapTiles、OSM Liberty、MapLibre 的许可证及署名要求。

对 CUpedia 的启示：评论与事实分离是正确的，但 CUpedia 不应把审核流程外包给 OSM。CUHK 用户提交的是“变更申请”，管理员批准后更新 CUpedia 的 canonical place/facility/floor facts；如内容也适合 OSM，可另行贡献，不能把 OSM 变更状态当作内部审批状态。

### 4. Hong Kong Open Map：MapLibre 直接消费 LandsD Vector Map API

这个项目展示了最低运维成本的香港官方底图接入方式。

- [`package.json`](https://github.com/wangwailok/hong-kong-open-map/blob/main/package.json) 只有 `maplibre-gl` 作为地图依赖。
- [`config.ts`](https://github.com/wangwailok/hong-kong-open-map/blob/main/src/core/config.ts) 直接使用地政总署 WGS84 vector basemap、繁中/英文 label styles，并内置 LandsD logo 和 attribution；组件暴露 markers，但仓库中没有 geocoder 或 route engine。
- 地政总署 [Vector Map API 官方文档](https://portal.csdi.gov.hk/csdi-webpage/apidoc/VectorMapAPI) 说明它是 XYZ vector topographic tile service，提供 PBF 和 style JSON，支持 WGS84/HK80，zoom 9–15。文档要求地图正面显示 LandsD logo 和版权文字，并明确要求应用不要在短时间内发出大量请求。

项目 README 把服务描述为“无用量限制”，但正式方案应以地政总署的[服务条款](https://api.portal.hkmapservice.gov.hk/tc)、[版权声明](https://api.portal.hkmapservice.gov.hk/disclaimer)和官方限流提示为准，不能把第三方项目的宣传语当作 SLA。对校园级高倍缩放，z15 以上只能 overzoom，室内细节仍必须来自 CUpedia 自己的图层。

### 5. HK Traffic Sign Map：公共底图 + 自托管高密度业务 PMTiles

这个项目很好地说明“底图”和“大规模专题数据”可以采用不同托管策略。

- [`package.json`](https://github.com/williamchong/hk-traffic-sign-map/blob/master/package.json) 依赖 MapLibre GL JS 和 PMTiles。
- [`TrafficMap.vue`](https://github.com/williamchong/hk-traffic-sign-map/blob/master/app/components/TrafficMap.vue) 的浅色底图直接请求 `tile.openstreetmap.org`，深色底图请求 CARTO raster tiles；交通标志则从同站的两个 PMTiles archive 加载，一个用于抽稀总览，一个保留完整标志供筛选。
- [README](https://github.com/williamchong/hk-traffic-sign-map/blob/master/README.md) 说明运输署数据经 GDAL 和 tippecanoe 转换为静态 PMTiles，无需数据库或瓦片服务器。
- [`useSignSearch.ts`](https://github.com/williamchong/hk-traffic-sign-map/blob/master/app/composables/useSignSearch.ts) 搜索构建时生成的本地双语标志目录，不调用 geocoder；仓库中没有路线引擎。

这个实现证明 PMTiles 很适合静态、高密度 overlay；但不应复制它对 OSM 标准栅格服务器的直接依赖作为 CUpedia 的生产方案。OSMF 的 [Tile Usage Policy](https://operations.osmfoundation.org/policies/tiles/) 明确区分“OSM 数据免费”和“公共 tile server 容量有限”，不提供 SLA，禁止批量/离线抓取，并建议无法满足政策的应用改用其他提供者或自托管。

### 6. HK Country Park Facilities Explorer：传统 Leaflet/PostGIS/GeoServer 栈

这个项目代表另一条常见 GIS 路线，适合动态空间查询，但对 CUpedia 的 MVP 偏重。

- [README](https://github.com/Machin001/hk-country-parks-webgis/blob/main/README.md) 和 [`index.html`](https://github.com/Machin001/hk-country-parks-webgis/blob/main/index.html) 确认渲染器为 Leaflet 1.9.4，底图为 OSM 标准栅格，专题层由 GeoServer WMS 和 GeoJSON 提供；四个数据集来自香港 CSDI。
- [`app.js`](https://github.com/Machin001/hk-country-parks-webgis/blob/main/js/app.js) 将设施 GeoJSON 叠到底图上，并请求 `router.project-osrm.org/route/v1/foot/` 计算路线。
- [`search.php`](https://github.com/Machin001/hk-country-parks-webgis/blob/main/api/search.php) 通过 PostGIS 表上的双语 `ILIKE` 完成跨图层搜索，而不是地址 geocoding。

它说明 PostGIS/GeoServer 适合大量 WMS/WFS 和空间查询，但 CUpedia 已有 Next.js、PostgreSQL 和 Drizzle，不需要为了点位、楼层和评论再引入一整套 GeoServer。更值得借鉴的是“业务数据由自己的 API 返回 GeoJSON”。另外，仓库只是把公共 OSRM URL 写成 `foot` profile；这不能证明公共 demo 服务对 CUHK 校园和室内步行具有正确、稳定的 pedestrian graph，因此不能作为室内导航依据。

### 7. Should I Take Taxi?：Leaflet + 香港官方搜索 + 公共路线服务

这个项目适合核验“香港地点搜索”和“路线”如何独立于底图组合。

- [`package.json`](https://github.com/williamchong/should-i-take-taxi/blob/develop/package.json) 通过 `@nuxtjs/leaflet` 使用 Leaflet；[`MapDisplay.vue`](https://github.com/williamchong/should-i-take-taxi/blob/develop/app/components/MapDisplay.vue) 的浅色和深色底图均来自 CARTO raster tiles。
- [`useLocationSearch.ts`](https://github.com/williamchong/should-i-take-taxi/blob/develop/app/composables/useLocationSearch.ts) 把地政总署 Location Search、官方坐标转换、公共 Nominatim 反向查询和公共 OSRM 驾车路线组合在一起。这些是四个独立服务，并非 Leaflet 或 CARTO 自带能力。
- [LICENSE](https://github.com/williamchong/should-i-take-taxi/blob/develop/LICENSE) 是 GPL-3.0；代码许可证不替公共 Nominatim、OSRM 或 CARTO 端点提供生产 SLA。OSMF 的 [Nominatim Usage Policy](https://operations.osmfoundation.org/policies/nominatim/) 对公共实例另有容量、缓存和应用识别要求。

对 CUpedia 的启示：这种组合很适合快速原型，但稳定版要为每个外部能力定义 adapter、超时、限流、缓存和关闭开关。校园课室搜索与室内路线不能以公共 geocoder/route demo 作为唯一后端。

## 未纳入技术栈比较的项目

- [Hong Kong Access Map](https://geospatial.hk/hong-kong-access-map/) 的项目方说明它使用 CSDI 3D Pedestrian Network 比较一般路线和轮椅路线，但本次没有找到可核验的公开源代码仓库，因此不能确认其 renderer、底图、route engine 或许可证；不能把网页可访问等同于开源。
- [HK School Finder](https://github.com/scmlewis/hk_school_finder) 的源码显示 MapLibre + CARTO style + 本地学校搜索，但仓库没有 `LICENSE` 文件，README 虽称 MIT，法律上仍应视为未清晰授权。本报告不把它列为可复用开源组件。
- [Kai Tak Accessibility Map](https://github.com/AeolusAtHKU/Kai-Tak-Accessibility-Map) 的生成页面使用 Leaflet + CARTO raster，并展示预计算的步行等时圈 GeoJSON；仓库没有 `LICENSE`，而且生成路线的脚本没有入库，因此只能作为 source-available 的界面参考。
- [Hong Kong Trails GPX/KML](https://github.com/nicholas-fong/Hong-Kong-Trails-GPX-KML) 是 [CC0-1.0](https://github.com/nicholas-fong/Hong-Kong-Trails-GPX-KML/blob/main/LICENSE) 的 GPX/KML 数据仓库，不含 renderer、底图、geocoder 或 route engine。其 [README](https://github.com/nicholas-fong/Hong-Kong-Trails-GPX-KML/blob/main/README.md) 记录了 OSM/Overpass → JOSM 清理 → GPX/KML 的管线，恰好说明“开放地图数据集”不等于“可直接采用的地图技术栈”。
- 香港政府的 GeoInfo Map、MyMapHK 等服务可作为产品和数据能力参照，但没有发现其完整客户端源码仓库，因此也不用于回答“开源项目实际采用什么栈”。

## 可观察到的香港项目模式

### MapLibre 是主流渲染器，但不是底图

七个样本中四个用 MapLibre。它们分别接入 LandsD vector tiles、自托管 PMTiles、自建 TileServer GL、OSM/CARTO raster tiles，恰好证明 MapLibre 是 provider-agnostic renderer，而不是地图内容供应商。MapLibre GL JS 自身是一个浏览器端交互式矢量瓦片渲染库，采用 BSD-3-Clause 许可证；项目说明见其[官方仓库](https://github.com/maplibre/maplibre-gl-js)。

### 自托管静态瓦片正在替代公共瓦片依赖

`hkbus.app`、BNBU Map、HK Traffic Sign Map 都把主要数据做成 PMTiles 或 MBTiles，再从静态/CDN/TileServer 托管。对单一香港或校园 bbox，这比运营全球瓦片服务器简单，也能避免公共 OSM tile server 的 SLA 和批量下载限制。

### 搜索通常先查业务自己的数据

CUHK Campus 3D、BNBU Map、Traffic Sign Map 和 Country Park Explorer 都搜索自己的建筑、POI、标志或设施索引。只有 `hkbus.app` 在本地站点匹配后调用 LandsD Location Search 作为地址/地点补充。对 CUpedia，课室代码、饮水机和楼层必须进入自己的索引；通用 geocoder 无法替代校园术语和审核后的事实。

### 路线是一套独立数据产品

MapLibre 与 Leaflet 都不会自动提供路线。样本中有三种不同层次：

1. `hkbus.app` 展示已有公交路线与直线步行接驳；
2. Country Park Explorer 调用外部 OSRM；
3. CUHK Campus 3D 构建自己的 OSM 步行图并运行 A\*。

室内导航还要再增加 `building + floor + connector` 拓扑，所以 CUpedia 应采用第三种控制方式，但按楼栋逐步建立和验证数据。

### 代码、数据和在线服务必须分别审查

MIT/GPL/BSD 只说明代码能否复用，不自动授权底图、CUHK 楼层图、政府数据或评论内容。最典型的是 Hong Kong Open Map：组件是 MIT，底图仍受 LandsD 条款约束；CUHK Campus 3D 的 LICENSE 也明确把生成数据排除在代码 MIT 之外。

## 对 CUpedia 的具体设计建议

### 1. 地图栈

```text
MapLibre GL JS
├── BasemapProvider（可替换）
│   ├── LandsD vector/topographic style
│   └── 自托管 CUHK/HK OSM PMTiles
├── Campus facts（CUpedia API → GeoJSON）
│   ├── buildings / entrances / outdoor facilities
│   ├── rooms / public spaces / toilets / water / printers
│   └── verification status / source / observedAt
├── Indoor overlay（按 buildingId + floorId 切换）
│   ├── floor raster（可选，原创或获授权）
│   └── rooms / corridors / portals / vertical connectors
└── Route overlay（只有通过 QA 的图才加载）
```

底图配置至少应由 `styleUrl`、attribution、logo、max native zoom、请求策略组成，不把任何 provider URL 散落在 React 组件里。这样地政总署、OSM PMTiles 或其他合规服务可以在不迁移业务数据的情况下替换。

### 2. 推荐的底图上线顺序

1. **开发/MVP**：MapLibre + LandsD Vector/Topographic Map API。优点是香港官方、接入快；缺点是官方 vector tiles 原生只到 z15，且没有 SLA，应实施缓存、错误回退和可见署名。
2. **稳定版**：参照 `hkbus.app`，只为香港或 CUHK 周边生成 OSM 派生 PMTiles，放到支持 HTTP Range 的对象存储/CDN；定期重建并保留上一版本以便回滚。
3. **可选混合**：OSM PMTiles 提供道路/建筑，LandsD label layer 提供香港双语标签。任何一个来源故障时，CUpedia 的设施和楼层图仍可显示。

不建议生产环境直接依赖 `tile.openstreetmap.org`。Google 或高德可保留为“在外部地图打开”的跳转目标，但不作为 canonical facts、协作编辑或室内图的宿主。

### 3. 搜索

搜索顺序应为：

1. CUpedia 内部精确别名：课室代码、楼宇简称、中英文名；
2. CUpedia 内部模糊搜索：设施类别、公共空间和用户可见标签；
3. LandsD Location Search：只补充校园外或尚未收录的香港地址/地点；
4. 未审核的申请不进入默认结果，只在管理员界面或显式“待审核”筛选中出现。

这与已核验的香港项目一致：领域搜索由自己的数据承担，通用 geocoder 只是补充。

### 4. 协作编辑、审批、评论和星级

这些能力与地图 renderer 无关，应直接复用 CUpedia 的 CUHK 登录、管理员和修订思路：

- 游客只读取已发布事实和评论；
- CUHK 用户可以提交变更申请、评论和 1–5 星评价；
- 管理员可以批准/拒绝申请，也可以直接新增或修正事实；
- 申请保存 proposed patch、证据类型、观察时间、可选照片和提交者；
- 发布后的事实保留 revision，不覆盖来源和验证历史；
- 评论/评分只引用稳定 `placeId` 或 `facilityId`，不嵌入地点事实，也不随底图切换而丢失。

### 5. 楼层 overlay

没有任何被核验的香港项目能自动提供 CUHK 楼层资料。MapLibre 只解决显示：原创实测或获授权的数据仍需 CUpedia 建立。

地政总署的 [What's New](https://portal.csdi.gov.hk/csdi-webpage/info/WhatsNew) 于 2026-07-08 宣布 3D Pedestrian Route Search API 已支持室内外三维点到点路线。它值得另开 spike 核验，但目前只是政府在线服务，不是本报告核验到的开源路线引擎；在确认 CUHK 建筑覆盖、许可、配额、坐标/楼层语义和不可用时的降级方案前，不能把它写进必交付路径。

建议每栋楼定义稳定的局部坐标系和到 WGS84 的仿射/控制点变换：

- 原始编辑数据保存 `buildingId + floorId + localGeometry`，避免把室内厘米级编辑绑死在经纬度上；
- 发布时转换为 MapLibre 可绘制的 GeoJSON；
- 原创/获授权的平面底图可作为 image/raster source，以四个地理角点配准；
- 房间、走廊、入口、电梯、楼梯和设施保持矢量化，可搜索、点击、审核和版本化；
- 楼层切换只改变 floor overlay 的可见性，室外 basemap 不变。

### 6. 数据驱动的功能解锁

第一版不应承诺“全校园都有同样功能”，应按每栋楼、每类设施的可用数据解锁：

| 数据等级         | 最低数据                                               | 可开放能力                     |
| ---------------- | ------------------------------------------------------ | ------------------------------ |
| L1 室外地点      | 合法来源、可靠 WGS84 坐标、类别                        | 地图显示、附近设施、评论和星级 |
| L2 建筑/楼层定位 | 建筑身份、楼层、课室/设施别名                          | 搜索课室并显示“建筑 + 楼层”    |
| L3 简化室内图    | 原创实测或获授权的房间/公共区几何                      | 楼层切换、室内图钉和空间详情   |
| L4 普通路线      | 入口、走廊、楼梯、电梯、楼层连接及单向/开放条件完成 QA | 对外开放普通室内外路线         |
| L5 无障碍路线    | 坡度、台阶、门宽、电梯状态等独立核实                   | 对外开放无障碍路线             |

因此，能立即确定的产品目标是“室外设施、内部搜索、申请审批、评论和星级”；楼层图与路线的覆盖范围必须由实际采集和授权结果决定。

## 最终选型

| 决策             | 建议                                                        |
| ---------------- | ----------------------------------------------------------- |
| 网页 renderer    | MapLibre GL JS                                              |
| MVP 底图         | LandsD Vector/Topographic，经统一 adapter                   |
| 稳定版底图       | CUHK/HK bbox 的 OSM 派生 PMTiles，自托管                    |
| 香港通用地点搜索 | LandsD Location Search API，限流并仅作 fallback             |
| 校园搜索         | CUpedia 自有 PostgreSQL 搜索索引                            |
| 业务图层         | CUpedia API 输出 GeoJSON；高密度只读层可后续改 PMTiles      |
| 室内图           | 原创/获授权 raster + CUpedia 自有矢量 facts，逐楼开放       |
| 路由             | CUpedia 自建、经 QA 的室外/室内图；不依赖公共 demo endpoint |
| 协作治理         | CUHK 用户提交和评论，管理员审批/直接编辑，修订可追溯        |

这套选择既符合本次观察到的香港开源项目实践，也满足“一个事实平台、多种地图表现”：替换底图、增加楼层或未来增加另一种地图视图，都不需要迁移地点、评论和审批数据。
