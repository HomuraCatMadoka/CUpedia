# CUHK 协作式 Campus Map 调研

- 调研日期：2026-08-10
- 范围：免费底图、CUHK 官方资料、楼层图、设施点、协作编辑、评论、搜索和室内外导航
- 结论性质：产品与数据方案调研，不代表 CUHK 对数据重用或楼层图矢量化的授权

## 结论先行

建议把产品分成三个彼此独立的部分：

1. **底图与渲染器**：采用开源的 [MapLibre GL JS](https://maplibre.org/maplibre-gl-js/docs/)。MVP 可先接 [OpenFreeMap](https://openfreemap.org/) 的免费公开实例；同时保留香港地政总署 [Topographic Map API](https://portal.csdi.gov.hk/csdi-webpage/apidoc/TopographicMapAPI) 作为香港官方底图选项。底图供应商必须可以替换，不能拥有或决定 CUpedia 的设施、评论和路线数据。
2. **CUHK 事实数据库**：建筑、课室、饮水机、厕所、打印机、休息区、入口、楼层及路线均由 CUpedia 自己维护，保留来源、采集日期、验证状态和修订历史。不要把 Google 或高德的地点结果复制成自己的数据库。
3. **社区内容**：事实修订和评论分开。厕所是否存在、位于哪一层是可审核事实；“干净”“晚上很挤”是带作者和时间的评论，不能直接覆盖事实字段。

CUHK 已公开了足以启动原型的建筑、课室、饮水机、校巴、无障碍设施和部分楼层图资料；但未发现全校园室内路网、CAD/BIM、正式开放数据 API 或允许复制及矢量化楼层图的开放许可证。最稳妥的落地顺序是：先做室外设施与课室搜索，再选一至两栋楼做获授权或原创实测的楼层试点，最后才发布逐步导航。

## 1. 仓库内已有基础

现有 [Campus Map Context](./CONTEXT.md) 已把事实、入口、物理路网和显示几何分离；[source registry](../../assets/campus-map/SOURCES.md) 已登记 CUHK、OpenStreetMap 和香港政府数据来源。这与协作地图需要的“事实先于画面”原则一致。

现有试点数据 [pilot-gold-set.json](../../src/lib/campus-map/generated/pilot-gold-set.json) 含 2,009 条香港政府 3D 行人网络线段，其中 118 条标为室内，但只有 3 条室内线段有非空 `floorId`；全图仍分成 16 个连通分量，并被 QA 标为不可发布。它可以继续作为候选路网来源，但目前不能支撑可靠的逐步导航，尤其不能据此承诺无障碍路线。

## 2. CUHK 官方资料盘点

### 2.1 校园地图和机器可读资料

[CUHK Campus Map](https://www.cuhk.edu.hk/english/campus/cuhk-campus-map.html) 当前以 Google Maps 呈现建筑、设施、校巴站和步行路线。网页直接加载公开的静态 JavaScript 数据库 [cuhk_location_db.js](https://www.cuhk.edu.hk/english/js/campus/cuhk_location_db.js?20161006)。本次读取到：

| 数据          |    数量 | 可用字段/用途                               |
| ------------- | ------: | ------------------------------------------- |
| 建筑          |     159 | 中英文名、编码、坐标，可作建筑目录种子      |
| 设施点        |     382 | 分类、建筑、楼层/位置说明、坐标、开放时间等 |
| 设施类型      |      37 | 可建立初始分类映射                          |
| 饮水机        |      51 | 建筑、楼层/位置和坐标                       |
| 校巴站 / 路线 | 51 / 19 | 站点次序和路线分段                          |
| 地标          |      26 | 搜索别名和定位参考                          |
| 步行路线      |       2 | 只适合参考，远不足以做任意两点导航          |

CUHK 地图本身提示地图可能不按比例、资料并非实时更新；该 JavaScript 文件也没有正式 API 文档、版本承诺或开放许可证。因此可以先用它核对产品模型和制作原型，但正式批量导入坐标与文字前应向 CUHK 取得书面许可，并为每条导入记录保存来源版本和抓取日期。CUHK 的 [Disclaimer](https://www.cuhk.edu.hk/english/disclaimer.html) 也说明网页内容可能变更。

[Campus Walking Routes（2025 年 8 月）](https://www.scu.cuhk.edu.hk/wp-content/uploads/useful-information/Campus-Map-Walking-Routes-Aug-2025.pdf) 提供 5 条典型步行连接和预计时间；[Transport Office](https://transport.cuhk.edu.hk/) 则提供当前校巴路线、站序、服务时间和临时状态。这些资料适合做路线候选和交通入口，不等同于可计算的通用路网；服务状态也应视为高时效数据，不应永久抄进静态表。

### 2.2 课室搜索

[Registry 的 Communal Classrooms 列表](https://www.res.cuhk.edu.hk/teaching-timetable-classroom-booking/classroom-booking/list-of-communal-classrooms/) 提供建筑、课室代码、楼层、容量、座位类型，并链接校园地图和 AVSU 详情。本次页面快照可解析出 254 个不同的 AVSU 房间详情链接；[AVSU 教室目录](https://www.avsu.cuhk.edu.hk/en/classroom_service/classroom_list/) 还提供课室设备，例如 [Lee Shau Kee Building 课室页](https://www.avsu.cuhk.edu.hk/en/classroom_service/middle_level_rooms/8/)。

这已足够做“房间代码或别名 → 建筑 + 楼层”的搜索。它通常不能给出门口坐标或完整楼层走廊，因此搜索结果要允许降级：精确到楼层时显示“已定位楼层，房门尚未测绘”，路线先终止在该楼入口或目标楼层的垂直交通节点。

[Teaching Timetable](https://www.res.cuhk.edu.hk/undergraduate-students/teaching-timetable/) 的公众查询需要验证码，没有发现适合批量调用的“课程 → 课室”公开 API。CUHK Mobile 的学生时间表可连接课室位置，但需要校内身份；[CUHK Mobile 说明页](https://www.itsc.cuhk.edu.hk/all-it/phone-mobile/cuhk-mobile/) 也没有授予其数据的开放重用权。

### 2.3 可找到的楼层平面图

CUHK Library 是当前最完整的公开楼层资料来源。图中通常能看到厕所、无障碍厕所、楼梯、电梯、讨论/安静区、电脑、打印或复印设备等：

- [University Library（LG、G、1、2、3、4、8、9/F）](https://www.lib.cuhk.edu.hk/wp-content/uploads/2025/05/ul-20250527.pdf)
- [Chung Chi Library](https://www.lib.cuhk.edu.hk/wp-content/uploads/2025/05/ccl-20250508-en.pdf)
- [New Asia College Ch'ien Mu Library](https://www.lib.cuhk.edu.hk/wp-content/uploads/2025/05/nal-20250530-en.pdf)
- [United College Wu Chung Library](https://www.lib.cuhk.edu.hk/wp-content/uploads/2026/01/uc-20251231-en.pdf)
- [WMY Learning Commons 6/F](https://www.lib.cuhk.edu.hk/wp-content/uploads/2025/05/wmylc-20250508-en.pdf)
- [Architecture Library 3–4/F](https://www.lib.cuhk.edu.hk/wp-content/uploads/2025/08/arl-20250821-en.pdf)
- [Lee Quo Wei Law Library 3–4/F](https://www.lib.cuhk.edu.hk/wp-content/uploads/2026/01/law-20251231-en.pdf)
- [Medical Library 2/F](https://www.lib.cuhk.edu.hk/wp-content/uploads/2026/01/mel-20251231-en.pdf)
- [Legal Resources Centre 2/F](https://www.lib.cuhk.edu.hk/wp-content/uploads/2025/05/LRC-20250507-en-v2.pdf)

其他可公开查看的室内资料包括 [Henry Cheng International Conference Centre 房间布局](https://www.conferencecentre.cuhk.edu.hk/en/facilities/explore-room-layout/) 及其 [1/F](https://www.conferencecentre.cuhk.edu.hk/wp-content/uploads/floor-plans/editable-floorplan-level1.pdf)、[2/F](https://www.conferencecentre.cuhk.edu.hk/wp-content/uploads/floor-plans/editable-floorplan-level2-1.pdf) PDF，以及 [Sir Run Run Shaw Hall 场地资料](https://www.srrsh.cuhk.edu.hk/en/hiring-information)。这些资料的用途和更新周期各异，不能视为统一的校园楼层图库。

[Space Inventory User Guide](https://srsdo.cuhk.edu.hk/images/documents/siug.pdf) 说明最新空间清单和楼层图位于需授权的 CUHK SharePoint 系统。这说明校内存在更完整的原始资料，但正确取得方式是向 Campus Development Office／空间资料负责人申请许可和可重用导出，而不是抓取受限系统。

未发现覆盖主要教学楼和宿舍的公开统一楼层图库，也未发现公开 CAD、BIM、建筑剖面或室内导航路网。公开 PDF 的可见性不等于有权复制图像、切瓦片或沿图描线生成矢量几何。

### 2.4 无障碍资料

[Campus Accessibility 总入口](https://wacc.osa.cuhk.edu.hk/sen-service/campus-accessibility-other-resources/campus-accessibility/) 汇总了各校园分区的无障碍入口、厕所、停车位、触觉引路带和图书馆设施。尤其有价值的是：

- [下校园无障碍入口](https://wacc.osa.cuhk.edu.hk/accessibility-accessible-entrance-lower/)、[中央校园无障碍入口](https://wacc.osa.cuhk.edu.hk/accessibility-accessible-entrance-central/) 和 [上校园无障碍入口](https://wacc.osa.cuhk.edu.hk/wp-content/uploads/SENS/accessibility-accessible-entrance-upper.pdf)
- [下校园无障碍厕所](https://wacc.osa.cuhk.edu.hk/accessibility-disabled-toilet-lower/)、[中央校园无障碍厕所](https://wacc.osa.cuhk.edu.hk/accessibility-disabled-toilet-central/) 和 [上校园无障碍厕所](https://wacc.osa.cuhk.edu.hk/wp-content/uploads/SENS/accessibility-disabled-toilet-upper.pdf)
- [触觉引路带清单](https://wacc.osa.cuhk.edu.hk/accessibility-tactile-path_new/)

这些资料包含具体入口楼层、经其他建筑进入的连接关系，以及某些课室不可由轮椅到达的限制，适合生成“待核实的无障碍边与约束”。部分文件标示 2014 或 2018 年，必须现场复核；“没有记录”不能推断为可达，“有记录”也不能在复核前升级成导航承诺。

### 2.5 饮水机、厕所、打印机和休息空间

- [CUHK Waste Reduction](https://www.srsdo.cuhk.edu.hk/en-gb/sd/work/waste-reduction) 确认 CUHK Mobile 和在线校园地图提供饮水机图层；另有 [官方饮水机清单 PDF](https://infoday.cuhk.edu.hk/storage/files/List-of-easily-accessible-water-dispensers-in-CUHK.pdf)，但文件标示最后更新于 2021-11-01，且声明并非穷尽。
- 未发现普通男女厕所的全校园官方清单；当前最可靠的官方候选来自图书馆楼层图和无障碍厕所目录。
- [ITSC 自助打印说明](https://www.itsc.cuhk.edu.hk/all-it/it-facilities/learning-commons/self-service-printing-in-learning-commons-user-areas/) 列出部分打印站；图书馆楼层 PDF 也标示打印/复印设备。
- [Library Places to Study](https://www.lib.cuhk.edu.hk/en/use/places/) 和 [WMY Learning Commons](https://www.itsc.cuhk.edu.hk/all-it/it-facilities/learning-commons/) 可作学习/休息空间候选，但准入对象和开放时间必须作为结构化条件展示，不能统一标成“免费公共区域”。

### 2.6 消防疏散图不应成为捷径

[CUHK Fire Warden 指引](https://useo.cuhk.edu.hk/storage/media/Policy%20and%20Organisation/Policy/Role%20of%20Safety%20Coor%20Firev2026.pdf) 要求楼层公共区域展示最新疏散图，并在需要时向 Estates Management Office 取得更新版。这证明楼层疏散资料存在，但没有发现公开集中下载库。此类图纸可能过时或包含安全敏感细节；未经明确授权，不应拍摄、抓取或转作公开室内地图。

## 3. 香港政府和开放数据能补多少

### 3.1 官方底图与搜索

香港地政总署提供：

- [Topographic Map API](https://portal.csdi.gov.hk/csdi-webpage/apidoc/TopographicMapAPI)：WGS84/HK80 的 XYZ PNG，缩放级别最高到 20；文档中的调用 URL 不需要 API key，但要求显示地政总署标志和“Map from Lands Department”。
- [Vector Map API](https://portal.csdi.gov.hk/csdi-webpage/apidoc/VectorMapAPI)：WGS84/HK80 PBF 瓦片和样式，缩放级别 9–15。
- [Map Label API](https://portal.csdi.gov.hk/csdi-webpage/apidoc/MapLabelAPI)：繁体、简体和英文标签瓦片。
- [Imagery Map API](https://portal.csdi.gov.hk/csdi-webpage/apidoc/ImageryMapAPI)：香港影像底图。
- [Location Search API](https://portal.csdi.gov.hk/csdi-webpage/apidoc/LocationSearchAPI)：地址、建筑、地点和设施搜索，但不是 CUHK 房间级搜索。

[CSDI Terms and Conditions](https://static.csdi.gov.hk/csdi-webpage/doc/TNC) 允许在署名等条件下浏览、下载、分发和重用资料。各 Map API 仍有各自的标志、署名和请求量要求，实施时要逐项遵守，不能只写一个笼统的“政府数据”署名。

### 3.2 室内和行人路网

[3D Indoor Map API](https://portal.csdi.gov.hk/csdi-webpage/apidoc/3d-indoor-map-api) 一般可提供场地、楼层、房间、门窗、设施和使用者点等 GeoJSON 要素；但本次读取其公开 [venue_polygon WFS 列表](https://mapapi.hkmapservice.gov.hk/ogc/wfs/indoor/venue_polygon?service=WFS&version=1.1.0&request=GetFeature&outputFormat=application%2Fjson) 共 689 个场地，只找到位于威尔斯亲王医院的 CUHK Jockey Club School of Public Health and Primary Care，没有发现 CUHK 沙田主校园的 University Library、Yasumoto、Lee Shau Kee Building、WMY、Mong Man Wai、New Asia 或 Chung Chi 场地。这是 2026-08-10 的实测快照，不应被解释为永久不会覆盖。

[3D Pedestrian Route Search API](https://portal.csdi.gov.hk/csdi-webpage/apidoc/3d-pedestrian-route-search) 支持室内外及无障碍候选路线，但仓库试点已显示 CUHK 范围的楼层属性和连通性不足。它适合提供候选线段，不适合作为未经人工审核即可发布的路线真相。

室内数据模型可借鉴 [OGC IndoorGML 2.0](https://www.ogc.org/announcement/ogc-publishes-indoorgml-2-0-part-1-conceptual-model-standard/) 的空间、连通关系和导航网络概念；MVP 不必直接采用复杂的 IndoorGML XML 格式。

## 4. 免费底图方案比较

“免费地图”需要拆成四件事：渲染库是否免费、瓦片是否免费、地理编码/路线是否免费，以及是否允许把结果存进自己的数据库。

| 方案                              | 免费条件                                                                                            | 适合程度                       | 关键限制                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MapLibre + OpenFreeMap            | 开源渲染器；公开实例无需 key、无公开请求/浏览量上限                                                 | **推荐作 MVP 默认**            | [OpenFreeMap 条款](https://openfreemap.org/tos/) 不提供 SLA，并可停止服务；必须保留 OSM 等署名                                                                                                                                                                                                                                                                                                                                |
| MapLibre + LandsD Topographic     | 香港官方、文档 URL 无 key                                                                           | **推荐作香港官方图层/后备**    | 必须显示指定 logo/署名；不应高并发突发抓取                                                                                                                                                                                                                                                                                                                                                                                    |
| 自托管 OSM 派生瓦片/PMTiles       | 软件和开放数据可控                                                                                  | **推荐作稳定版方向**           | 需要生成、更新和存储运维；遵守 ODbL                                                                                                                                                                                                                                                                                                                                                                                           |
| 直接使用 `tile.openstreetmap.org` | 无 key                                                                                              | **不用于正式产品**             | [OSM 瓦片政策](https://operations.osmfoundation.org/policies/tiles/) 无 SLA，禁止批量/离线下载，可封禁不合规流量                                                                                                                                                                                                                                                                                                              |
| Google Maps JavaScript API        | [Dynamic Maps 每月首 10,000 次免费](https://developers.google.com/maps/billing-and-pricing/pricing) | 仅在必须依赖 Google 生态时考虑 | [生产必须配置 key 与 billing](https://developers.google.com/maps/documentation/javascript/get-api-key)；缓存和重用 Google 内容受 [政策](https://developers.google.com/maps/documentation/javascript/policies) 限制                                                                                                                                                                                                            |
| Google Maps Embed                 | [免费且请求量不限](https://developers.google.com/maps/documentation/embed/usage-and-billing)        | 不适合                         | iframe 无法承担自定义协作图层、多楼层切换和自有路线交互                                                                                                                                                                                                                                                                                                                                                                       |
| 高德 JS API                       | 需 Web key；免费配额取决于账号和当前技术服务授权方案，并非无条件不限量                              | 不推荐作 CUHK 主方案           | 需核对[服务协议](https://lbs.amap.com/pages/terms/)和[基础服务价格](https://lbs.amap.com/pages/base_service_price)；[自定义图层还需安全密钥](https://lbs.amap.com/api/javascript-api-v2/guide/layers/customlayer)；[海外路线属于需授权的高级服务](https://lbs.amap.com/api/web-service/guide/routes)；[IndoorMap](https://lbs.amap.com/api/javascript-api-v2/guide/layers/official-layers) 也不会自动补齐 CUHK 缺失的楼层数据 |

OpenFreeMap 以 OSM 数据为基础。使用时必须遵守 [OpenStreetMap ODbL 与署名要求](https://www.openstreetmap.org/copyright)；若生成并公开衍生数据库，还要评估 ODbL 的同方式共享义务。绝对不能从 Google 地图或其他受版权保护的图上描摹进 OSM 或 CUpedia 数据库。

因此，建议现在就定义 `BasemapProvider` 边界：应用只依赖样式 URL、瓦片源、bounds、最大缩放级别和署名，不让地点 ID、搜索或评论绑定到某个商业地图 SDK。稳定版可以把 CUHK 周边裁剪成自托管瓦片或 PMTiles，存入现有对象存储体系；这是架构建议，实际 range request、缓存头和更新流水线仍需单独验证。

## 5. 建议的数据模型

### 5.1 地点和楼层

- `building`：稳定 ID、中英文名、别名、室外 WGS84 轮廓/中心点、来源与状态。
- `floor`：所属建筑、`levelOrdinal`（用于排序和计算）、`levelRef`（LG、G、UG、1 等现场标牌）、本地二维坐标系或 SVG viewBox、可选的地理配准变换、来源与版本。
- `place`：厕所、饮水机、打印机、休息区、课室等；位置可以是室外 WGS84 点，或 `buildingId + floorId + localPoint`，不要强迫室内点使用假精度的经纬度。
- `place_access`：开放时间、CUHK 身份要求、性别/无障碍属性、临时关闭和验证日期。它与几何位置分开更新。

楼层图的显示几何和导航几何也要分开：漂亮的房间轮廓不代表可走；可走的走廊中心线也不应反过来当建筑图稿。

### 5.2 室内外统一路网

- `graph_node`：室外路口、建筑入口、走廊节点、门、楼梯/电梯/扶梯端点。
- `graph_edge`：方向、长度/时间成本、楼层、通行方式、开放条件、台阶/坡度、来源、置信度和审核状态。
- `portal`：把室外节点连接到某栋楼的具体楼层入口。
- `vertical_connector`：把楼梯、电梯或扶梯在不同楼层的端点连接起来。

路线计算形成一张“超级图”：室外图 → portal → 楼层图 → vertical connector → 目标楼层。路线模式可包括最快、少楼梯和轮椅候选；只有当路径上每条关键边都经过无障碍审核时，才可以对外称为无障碍路线。路线指示必须明确说出“从哪一个入口进入、上到哪一层、使用哪一部电梯/楼梯”。

### 5.3 事实、修订和评论

- `place_revision` / `route_revision`：记录建议变更、旧值、新值、来源、证据、作者、审核人、结果和时间。
- 事实状态：`official_imported`、`community_verified`、`community_reported`、`stale`、`disputed`、`retired`。
- `comment`：正文、回复关系、作者、创建/编辑时间、赞同或“有帮助”、举报和 moderation 状态。
- 设施的聚合评价应保留时间维度，例如“过去 30 日有 5 人报告缺水”，不要把主观结论写成地点名或官方属性。

现有 wiki 已具备身份、角色、乐观锁、修订、回滚、软删除和讨论能力。Campus Map 应复用这些行为规则，但地点和图路网应是独立的结构化领域模型，不要把每个图钉塞进 Plate JSON。

## 6. 搜索、附近设施和路线策略

### 搜索

1. 建立中英文名、建筑缩写、旧称、房间代码和常见输入变体的别名表。
2. 先导入获准使用的 Communal Classroom 目录，结果至少能定位到建筑和楼层。
3. 延续仓库现有的模糊搜索体验；数据增长后可用 PostgreSQL trigram。若未来加入 PostGIS，再用 [`ST_DWithin`](https://postgis.net/docs/ST_DWithin.html) 和 [KNN 距离排序](https://postgis.net/docs/geometry_distance_knn.html) 做附近查询。
4. Google/高德只可作为用户主动打开的外部地图，不能成为房间搜索的 canonical 数据源。

### 附近设施

- 浏览器定位只在用户明确同意后读取，默认不持久化精确轨迹。
- MVP 可用直线距离排列室外候选，但 UI 必须写明“直线距离”；在山地校园，最近的经纬度点未必最快到达。
- 路网通过 QA 后，改用实际步行成本排序，并把开放时间、楼层、门禁和无障碍条件纳入过滤。

### 路线发布门槛

1. 起点和终点能匹配到已审核节点或 portal。
2. 整条路径位于同一连通分量。
3. 所有楼层切换都有明确 connector。
4. 所有需要门禁或限时开放的边都有条件提示。
5. 无障碍模式不经过未知坡度、未知门槛或未经核实的楼梯替代路线。

在现有 16 个连通分量和大量缺失 `floorId` 的情况下，应继续显示设施与候选线，而不是给出可能误导的逐步导航。

## 7. 协作编辑和治理

建议工作流：

1. 登录用户新增图钉或提出变更；必须选择来源类型：官方链接、本人现场观察、本人拍摄照片或其他获授权资料。
2. 低风险信息先以 `community_reported` 展示；删除建筑入口、修改楼层或改变路网连通性等高风险操作必须审核。
3. 多人独立确认后升级为 `community_verified`；超过设定周期或被多人举报后转为 `stale` / `disputed`。
4. 每个事实都显示“最后核实时间”和来源类别；每次变更可比较、回滚和软删除。
5. 评论另走举报、折叠和管理员处理流程。不得让评论投票自动改变路线可达性或官方设施字段。

贡献条款应要求用户只提交本人原创、现场观察或获授权资料，并授予平台保存、编辑和公开展示所需的许可。评论版权、隐私与地点数据库授权应分别说明。图片继续经应用的受控资源路由提供，不直接暴露对象存储地址。

## 8. 楼层图获取建议

按风险从低到高的取得顺序：

1. 向 Campus Development Office／Space Inventory 负责人申请可公开重用的楼层范围、房间编号、入口和垂直交通数据，明确是否允许矢量化、修改和再发布。
2. 向 CUHK Library、ITSC 和相关场地管理者申请现有 PDF 的 SVG/CAD 或专为公开地图准备的简化版本，并取得书面许可证。
3. 在没有图纸授权时，由贡献者现场原创测绘设施点、入口、楼梯、电梯和走廊拓扑；不要沿公开 PDF 或 Google/高德影像描线。
4. 以无障碍清单、饮水机清单和课室目录产生“待现场核实”任务，不直接把旧资料标为已验证。
5. 先测 University Library / WMY Learning Commons 一类公开资料丰富、使用频率高的地点；第二栋建筑只有在第一栋的数据、审核和路线 QA 流程跑通后再扩展。

## 9. 分阶段路线图

### Phase 0：权利与数据协议

- 确认 CUHK 官方地图数据库、课室目录和楼层 PDF 的重用范围。
- 定义贡献许可、来源字段、验证状态和撤下流程。
- 选定 MapLibre，完成 OpenFreeMap 与 LandsD 的视觉、署名和性能对比。

### Phase 1：室外 MVP

- 建筑与课室搜索。
- 饮水机、厕所、打印机、休息/学习区图钉。
- 附近设施直线距离、设施详情、评论、修订和举报。
- 只显示已验证入口和候选步行线，不发布逐步导航。

### Phase 2：单楼室内试点

- 选择一至两栋已获数据授权或完成原创实测的建筑。
- 楼层切换、本地坐标图层、设施点、入口和垂直交通节点。
- 建立“房间已定位 / 只到楼层 / 只到建筑”三级精度提示。

### Phase 3：室内外导航

- 人工修复连通分量和 portal，完成线路 QA。
- 发布最快/少楼梯路线；无障碍模式在独立审计后上线。
- 附近查询从直线距离升级为真实路线成本。

### Phase 4：高时效资料

- 经正式接口或授权接入校巴服务状态、临时封路、设施停用和开放时间。
- 为过期资料自动创建复核任务，避免把评论或旧 PDF 当实时状态。

## 10. 仍需 CUHK 回答的问题

1. `cuhk_location_db.js` 中建筑、设施、路线和坐标是否允许批量导入、修改及公开再发布？要求何种署名？
2. Registry / AVSU 的课室代码、楼层、容量、照片和设备字段分别可以怎样重用？
3. Library 和其他单位能否提供获授权的 SVG/CAD/简化楼层数据，而不是让项目描摹 PDF？
4. Campus Development Office 能否为公开导航提供简化后的入口、楼层、楼梯、电梯、走廊和房间编号数据？
5. 哪个单位负责持续核实厕所、饮水机、打印机、无障碍通道和临时封路？社区报告应通过什么机制反馈给校方？
6. 校巴是否有稳定的机器可读接口，以及是否允许 CUpedia 缓存和展示实时/准实时状态？

这些授权和责任边界没有确认前，公开资料应被标为“参考来源／原型种子”，不应被包装成 CUHK 官方地图或已获校方认可的导航服务。
