# 可复用的开源巴士与公交软件调研

> 调研日期：2026-08-08。范围是仍有近期维护证据、能服务“CUHK 官方校巴今日出行”的开源软件；资料只引用项目官方文档、源代码仓库、发布记录和 GTFS 官方规范。

## 结论

不建议把任何完整开源公交产品直接嵌入 CUpedia。CUpedia 应继续以 Next.js 16 提供自己的“今日班次”界面与数据来源说明，并把开源项目分为三类使用：

1. **现在直接复用标准和工具**：以 GTFS Schedule 的实体和服务日历作为规范化 schema 的词汇，导入时运行 MobilityData GTFS Validator；如果未来得到实时源，则用官方 Node.js GTFS-Realtime bindings 解码并增加 realtime validator。GTFS 的最小模型已覆盖 `routes`、`trips`、`stops`、`stop_times`、`calendar`、`calendar_dates`，足够表达路线、站点、当天服务与例外日；GTFS-Realtime 则把 Trip Updates、Vehicle Positions、Alerts 分开，避免把“计划时间”“预测时间”“车辆位置”和“通告”混为一谈。[GTFS Overview](https://gtfs.org/documentation/overview/) [GTFS-Realtime Reference](https://gtfs.org/documentation/realtime/reference/) [MobilityData GTFS Validator](https://github.com/MobilityData/gtfs-validator) [GTFS-Realtime bindings](https://github.com/MobilityData/gtfs-realtime-bindings)
2. **完整行程需要时再试运行路由 sidecar**：首选比较 **MOTIS** 与 **OpenTripPlanner (OTP)**。两者都不应进入 Next.js 进程，而应独立容器化，通过 HTTP API 调用。MOTIS 的 MIT 许可证、单一可执行文件、OpenAPI/预生成 JS client 和“config → import → server”流程更适合先做低成本 CUHK 小数据集实验；OTP 的 GTFS/OSM/GTFS-RT 支持、GraphQL API、无障碍与换乘能力、生产生态更成熟，适合结果质量或复杂约束胜出时采用。[MOTIS repository](https://github.com/motis-project/motis) [OTP Product Overview](https://docs.opentripplanner.org/en/latest/Product-Overview/) [OTP APIs](https://docs.opentripplanner.org/en/latest/apis/Apis/)
3. **借鉴产品模式，不复用整套产品**：OneBusAway 值得借鉴“站点出发板明确区分 scheduled / predicted、显示更新时间与车辆距站”的模式；Digitransit 和 Trufi 值得借鉴移动优先的完整行程呈现；Navitia 值得借鉴 disruption 对正常班次的覆盖模型。它们的完整前端或平台与 CUpedia 的 Next.js 架构重叠，而且部分使用 AGPL/GPL/EUPL，直接改造会带来不必要的部署与许可证义务。[OneBusAway arrivals API](https://developer.onebusaway.org/api/where/methods/arrivals-and-departures-for-stop) [Digitransit UI repository](https://github.com/HSLdevcom/digitransit-ui) [Trufi Core repository](https://github.com/trufi-association/trufi-core) [Navitia documentation](https://doc.navitia.io/)

最重要的前置条件不是选择路由引擎，而是把 CUHK 官方网页/PDF/通告可靠转换为带来源、适用日期和版本的规范化班次。没有可验证的 Trip Updates 或车辆定位源时，产品只能展示“计划班次”，不能自行宣称“实时 ETA”。GTFS 官方明确指出：某班车没有 Trip Update 只表示没有实时数据，消费者不能据此假定车辆准点。[GTFS Trip Updates](https://gtfs.org/documentation/realtime/feed-entities/trip-updates/)

## 评估口径

“近期维护”以 2026-08-08 查询到的非归档仓库、最近 push 和 release 为证据，而不是 stars。下列候选均在 2026-08-04 至 2026-08-07 有仓库更新；OTP 最新稳定版为 v2.9.0（2026-03-18），OneBusAway 为 v2.7.1（2026-02-08），MOTIS 为 v2.11.1（2026-08-07），Navitia 为 v15.114.0（2026-07-29），Digitransit UI 为 20260624，Trufi Core 为 v5.20.0（2026-08-06）。这些日期来自各项目官方 GitHub 仓库和 release 记录。[OTP releases](https://github.com/opentripplanner/OpenTripPlanner/releases) [OneBusAway releases](https://github.com/OneBusAway/onebusaway-application-modules/releases) [MOTIS releases](https://github.com/motis-project/motis/releases) [Navitia releases](https://github.com/hove-io/navitia/releases) [Digitransit UI releases](https://github.com/HSLdevcom/digitransit-ui/releases) [Trufi Core releases](https://github.com/trufi-association/trufi-core/releases)

评分含义：**强**＝项目原生核心能力；**中**＝能表达或需组合其他组件；**弱/无**＝不应把它当作该能力的解决方案。

## 核心候选比较

| 项目                        | 今日路线、站点与班次                                | 行程、换乘、步行                                  | 通告、实时、ETA                                                                 | 导入与运维                                                             | UI、移动、无障碍                                            | 许可证与部署                                        | 对 CUpedia 的判断                                                      |
| --------------------------- | --------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------- | --------------------------------------------------- | ---------------------------------------------------------------------- |
| **OpenTripPlanner 2**       | 强：GTFS/NeTEx，GraphQL 可查询 stops、departures 等 | 强：公交 + OSM 步行，多条件、换乘、轮椅代价       | 强：GTFS-RT/SIRI 更新、通告、位置可参与重规划                                   | 构建 graph 后启动 Java 服务；官方 OCI image；需分配 JVM 内存           | 没有正式成品 UI；API 可供 Web/原生端，生态有 otp-ui         | LGPL-3.0；独立 Java 容器                            | **完整行程后端首选之一**；成熟但对 CUHK 小规模今日查询可能过重         |
| **MOTIS**                   | 强：GTFS/NeTEx，使用 service-day bitset             | 强：公交 + OSM 步行/骑行，换乘、地理编码          | 强：GTFS-RT、SIRI-ET/SX/FM，包括延误、取消、站台与通告                          | 单一二进制；`config/import/server`；REST + OpenAPI + JS client         | 带基础 Svelte UI、tiles/geocoder，但不是 CUpedia UI         | MIT；独立 C++ 服务/官方二进制和 Dockerfile          | **完整行程后端首选之一**；先用 CUHK feed 与 OTP 实测结果质量和资源     |
| **OneBusAway**              | 强：GTFS bundle、路线/站点/时刻/到离站 API          | 无：官方 API 明确已移除 trip planning，并指向 OTP | 强：GTFS-RT/SIRI 的 delay、alerts、vehicle positions；到站 API 同时给计划与预测 | Java/Tomcat 或官方 Docker；先构建 transit bundle；模块多               | Web、移动版、纯文本、iOS/Android、SMS、电话、站牌模式       | Apache-2.0；完整套件运维面大                        | **不作路由器**；实时源出现后可评估 departure/ETA 服务，当前主要借鉴 UX |
| **Navitia**                 | 强：线路时刻、next departures、数据浏览             | 强：公交、步行、骑行、汽车的 journeys/isochrones  | 强：disruptions，`data_freshness` 控制计划或 realtime 结果                      | 多服务平台（核心 C++、Python API 等）；支持 GTFS 导入和公开/自托管 API | 提供 API，不是适配 CUpedia 的轻量组件                       | AGPL-3.0；平台复杂度高                              | **不直接复用**；借鉴 base schedule / realtime / disruption 三层语义    |
| **Digitransit UI + otp-ui** | 强（经 OTP GraphQL）                                | 强，成熟的完整行程前端模式                        | 强（取决于部署的数据源）                                                        | Digitransit 是组合 OTP、地理编码、地图和数据容器的平台                 | Digitransit UI 移动友好；otp-ui 是可单独安装的 React 组件库 | Digitransit UI 双许可 EUPL-1.2/AGPL-3.0；otp-ui MIT | **只选择性评估 otp-ui 小组件**；不要移植整个 Digitransit UI            |
| **Trufi Core**              | 中（经 OTP/GTFS 后端）                              | 强，面向手机的 Flutter 完整行程                   | 中，能力依赖后端/配置                                                           | 需要 Flutter app、OTP 与地图/数据管线                                  | 移动端、国际化与低数据环境是核心经验                        | GPL-3.0；另建原生/Flutter 产品                      | **不直接复用**；CUpedia 是 Web，借鉴移动流程、地图与行程卡             |

表中依据：OTP 官方说明其以 GTFS/OSM 建图、接收实时更新，并提供 GraphQL、健康检查、地理编码与 vector tiles API；官方容器需要挂载 GTFS/NeTEx、OSM 和配置，再分别 build 与 serve。[OTP Product Overview](https://docs.opentripplanner.org/en/latest/Product-Overview/) [OTP APIs](https://docs.opentripplanner.org/en/latest/apis/Apis/) [OTP Container Image](https://docs.opentripplanner.org/en/latest/Container-Image/) MOTIS 官方列出 GTFS、NeTEx、GTFS-RT、SIRI 等输入、步行/共享交通组合、OpenAPI 和预生成 JS client，并给出三条命令启动流程。[MOTIS repository](https://github.com/motis-project/motis) OneBusAway 官方功能与 API 文档列出 Web/移动/纯文本/SMS/电话/站牌界面和 GTFS/GTFS-RT backend，而 REST API 明确说明不再支持 trip planning。[OneBusAway developer docs](https://developer.onebusaway.org/) [OneBusAway REST API](https://developer.onebusaway.org/api/where) Navitia 官方文档列出 journey、line schedules、next departures、autocomplete、isochrones 和 disruption/realtime 行为。[Navitia documentation](https://doc.navitia.io/) Digitransit 官方把平台描述为由 OTP 提供算法和 API 的开源高可用行程规划方案；其 UI 仓库声明移动友好和双许可证，otp-ui 仓库声明为 MIT React 组件库。[Digitransit API portal](https://portal-dev-api.digitransit.fi/) [Digitransit UI repository](https://github.com/HSLdevcom/digitransit-ui) [otp-ui repository](https://github.com/opentripplanner/otp-ui) Trufi Core 官方仓库将其定位为 Flutter 端并依赖 OTP，许可证为 GPL-3.0。[Trufi Core repository](https://github.com/trufi-association/trufi-core)

## 标准与数据模型建议

### 采用 GTFS 词汇，但不要让 GTFS 文件格式绑架应用 schema

CUpedia 的持久化模型应能无损映射以下概念：

- `Stop`：稳定的站点 id、官方中英文名、坐标；另用映射表关联未来 campus-map 的 `Place ID`，避免把建筑和上车点当成同一实体。
- `Route`：乘客看到的服务线；`Trip`：某服务日的一次具体运行；`StopTime`：按顺序的到/发时间。不要把“路线”和“某日某班车”压成同一张表。
- `ServiceCalendar` + `CalendarException`：决定某 `service_id` 在香港当天是否运行。官方 GTFS 将 `calendar.txt` 和 `calendar_dates.txt` 分开，正好支持教学日、公众假期或临时例外；UI 只投影“香港今天”，但底层不能只存一个扁平今日数组。[GTFS Schedule Reference](https://gtfs.org/documentation/schedule/reference/)
- `TransferRule`：站间/路线间建议换乘、最短换乘时间或禁止换乘。GTFS best practices 明确区分推荐、等待衔接、最低时间和不可换乘，适合校园坡道、过路和步行距离差异。[GTFS Schedule Best Practices](https://gtfs.org/documentation/schedule/schedule-best-practices/)
- `SourceSnapshot`：来源 URL、发布时间/适用日期、抓取时间、内容哈希、解析器版本、验证结果。CUHK 原始资料若不是 GTFS，先进入来源快照，再转换成 canonical rows；不要伪装成官方 GTFS feed。
- `ServiceAlertOverride`：用作用范围（route/trip/stop）、有效时段、effect、官方原文和来源表达当日停运/改道/特别班次。GTFS Alerts 本身就采用时间范围与实体选择器，并建议个别取消由 Trip Update 表达。[GTFS Service Alerts](https://gtfs.org/documentation/realtime/feed-entities/service-alerts/)

### 明确三种时间，不自行制造 ETA

界面和 API 至少区分：

- `scheduledTime`：官方固定/当日计划班次；
- `predictedTime`：只有可信实时源提供 Trip Update 时才存在；
- `observedAt` / `realtimeFreshness`：实时数据采集时间和新鲜度。

GTFS-Realtime best practices 要求 Trip Updates/Vehicle Positions 至少每 30 秒刷新，数据不应超过 90 秒；Alerts 不应超过 10 分钟。CUHK 若未来提供较慢或不稳定的源，CUpedia 应显示“最后更新”和 stale 状态，而不是延长预测的可信期。[GTFS-Realtime Best Practices](https://gtfs.org/documentation/realtime/realtime-best-practices/)

Vehicle Position 只有经纬度、时间戳、当前/下一站等事实；它本身不是 ETA。若只有车辆位置而没有官方 Trip Update，任何到站推算都应另立经过验证的预测服务，并在 UI 标为“估算”，不应称“实时班次”。[GTFS Vehicle Positions](https://gtfs.org/documentation/realtime/feed-entities/vehicle-positions/)

## 可直接复用的范围

### 建议现在采用

- **GTFS-shaped canonical model**：作为内部 schema 和导出/测试夹具的共同语言；这不要求 CUHK 原始源本身是 GTFS。
- **MobilityData GTFS Validator**：在生成或导出 GTFS 快照时作为 CI/摄取质量门；项目以 Apache-2.0 发布，并提供 CLI、Web service 和 Java library。[MobilityData GTFS Validator](https://github.com/MobilityData/gtfs-validator)
- **GTFS-Realtime Node.js bindings（未来条件采用）**：官方仓库提供 JavaScript/TypeScript/Node.js binding，Apache-2.0，适合 Next.js 后台摄取 protobuf；不要在浏览器直接轮询第三方实时 feed。[GTFS-Realtime bindings](https://github.com/MobilityData/gtfs-realtime-bindings)

### 需要原型后决定

- **MOTIS sidecar**：先用规范化 CUHK GTFS + 校园 OSM extract 试验站到站、换乘和步行段。记录导入时间、内存、冷启动、结果正确性、无路线原因、中文地名和步行坡度表现。
- **OTP sidecar**：使用相同 fixture 做对照。OTP 有更成熟的生产生态、无障碍与 realtime 重规划能力；但其 Java 25/JVM 容器和 graph 构建引入独立发布、监控和内存预算。[OTP v2.9.0 release](https://github.com/opentripplanner/OpenTripPlanner/releases/tag/v2.9.0)
- **otp-ui 的个别 MIT 包**：只在 API 和交互定型后检查与项目当前 React/Next.js 版本、SSR、Tailwind/shadcn、bundle size 和无障碍要求的兼容性；不要先引入整套设计系统。[otp-ui repository](https://github.com/opentripplanner/otp-ui)

### 不建议直接复用

- OneBusAway、Navitia、Digitransit UI 或 Trufi Core 的完整部署/前端。它们解决的是城市/地区级完整平台或独立移动应用问题，会与 CUpedia 的认证、导航、设计系统和部署栈重叠。
- 任一项目公开的 hosted demo/API 作为生产依赖。公共实例的 coverage、配额、SLA 和 CUHK 数据都不受 CUpedia 控制；应自托管选定的路由服务。
- 仅凭静态时刻表生成“实时 ETA”。OneBusAway 的 departure board 很适合借鉴，是因为其 API 明确同时返回 `scheduledArrivalTime`、`predictedArrivalTime`、`predicted` 和 `lastUpdateTime`，不是把二者合成一个不透明时间。[OneBusAway arrivals API](https://developer.onebusaway.org/api/where/methods/arrivals-and-departures-for-stop)

## 产品模式值得借鉴

1. **默认就是今天与现在**：首页先给附近/选择站点的下一班车，而不是要求理解线路表。末班后显式写“今日服务已结束”，不自动把明日称为今日。
2. **计划、预测、通告三层并列**：正常班次是 base schedule；官方临时变更覆盖结果；预测只在 realtime freshness 合格时显示。Navitia 的 `base_schedule` 与 `realtime` 参数是清晰先例。[Navitia documentation](https://doc.navitia.io/)
3. **出发板保留证据**：每一项显示计划/预测标签、最后更新时间、受影响通告和来源链接。实时消失时回退到计划班次并说明“暂无实时数据”，不能显示“准点”。
4. **完整行程以腿（leg）组成**：起点地点 → 步行到站 → 一至多段校巴 → 换乘步行 → 终点地点；每一段保存 mode、起终点、时间、来源/置信状态。这样 campus-map 尚未集成时可先提供站到站，未来再通过 `Place ID` 补上两端步行，而不用改写校巴核心实体。
5. **职员专车是服务属性，不是另一个产品**：保留线路/班次但显著标注 eligibility；不因匿名访问而隐藏。无障碍字段也应保留 unknown，而不是默认可达。GTFS 支持 stops/trips 的轮椅可达标记，OTP 也支持基于无障碍约束的路径成本。[GTFS Schedule Reference](https://gtfs.org/documentation/schedule/reference/) [OTP releases](https://github.com/opentripplanner/OpenTripPlanner/releases)

## 对实现规划的具体建议

### Phase 1：今日班次，不部署路由引擎

- 在 CUpedia 数据库保存规范化 Stop/Route/Trip/StopTime/ServiceCalendar/Alert/SourceSnapshot。
- 摄取过程按 `Asia/Hong_Kong` 计算今日有效 trips，并让官方当日通告覆盖固定时刻表。
- Next.js server action/API 只返回今天；UI 提供路线浏览、站点出发板、职员专车标识、来源与最后核对时间。
- 对解析结果生成 GTFS fixture 并运行 validator。这同时为后续路由原型建立输入契约。

### Phase 2：完整行程 sidecar 原型

- 用同一份 CUHK fixture 和同一份校园 OSM extract 对比 MOTIS 与 OTP。
- 预先定义 15–30 个真实 golden journeys，覆盖直达、换乘、无服务、末班后、同名/邻近站、受限线路和坡道/步行连接。
- 只有当“从地点到地点”的价值被验证时才长期部署 sidecar；纯站到站或直达推荐可由应用数据库查询完成，不必引入通用路由引擎。
- Next.js 通过内部 HTTP API 调用 sidecar，并缓存短时静态计划结果；sidecar 不访问用户 session，也不成为数据真源。

### Phase 3：有可信源才接实时

- 分别判断 CUHK 是否公开 Trip Updates、Vehicle Positions、Alerts 或自定义 API；每类能力单独启用。
- 记录 feed freshness、解析错误率、trip 匹配率和覆盖率；实时过期自动降级为计划班次。
- 如果只有车辆 GPS，先展示带时间戳的位置；ETA 另开验证票据，不从直线距离或静态时刻表猜测。

## 待后续票据决定

1. CUHK 近两年官方数据能否稳定映射到 GTFS 的 `service_id`、trip、stop sequence 和 calendar exception；如果只有 PDF/图片，摄取与人工复核成本可能决定 Phase 1 schema。
2. campus-map 的 Place/Entrance/Path schema 能否提供可步行的图，而不只是地点坐标；没有通行图时，OTP/MOTIS 即使能路由，也可能使用不符合校园实际的 OSM 步行路径。
3. 产品是否需要真正的多次换乘优化，还是“站点今日班次 + 直达线路匹配”已覆盖大多数用户任务。这决定是否承担 sidecar 运维成本。
4. CUHK 来源的使用条款是否允许缓存、规范化和再发布。开源软件许可证不等于输入数据有开放许可。

## 最终取舍

- **数据模型**：采用 GTFS 语义并增加 SourceSnapshot、官方中英文名、职员资格和 campus-map 映射；UI 只做香港今日投影。
- **Phase 1 软件**：CUpedia 原生 Next.js/Drizzle + MobilityData validator；不部署完整公交平台。
- **完整行程**：在数据与 campus-map 步行连接成熟后，对 MOTIS 与 OTP 做同输入原型；默认优先试 MOTIS 的轻量 MIT sidecar，OTP 作为成熟度/结果质量对照，不预先锁定。
- **实时**：只有 Trip Update 才显示预测到站；只有 Vehicle Position 就只显示带时间戳的位置；无可信 realtime 时明确降级为计划班次。
- **界面复用**：只可能选择性采用 otp-ui 的 MIT 组件；OneBusAway、Navitia、Digitransit、Trufi 主要作为产品与领域模式来源。
