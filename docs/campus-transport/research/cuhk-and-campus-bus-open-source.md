# CUHK 校巴与同类校园巴士开源实现调研

调研日期：2026-08-08

范围：公开可检索的 CUHK 校巴代码，以及能为 CUpedia 校巴功能提供架构参考的校园/小型公交开源项目。本文只评估公开实现，不把第三方项目中的数据视为 CUHK 官方数据。

## 结论先行

公开代码中确实有三个可用来理解 CUHK 校巴产品逻辑的项目，但没有一个适合直接接入 CUpedia：

- [CUHK-bus-clock](https://github.com/CCheukKa/CUHK-bus-clock) 是最有参考价值的实现。它将发车时刻和个人采集的分站行车时间组合成中途站预计到站时间，但这不是实时车辆数据；样本量也不足以直接作为生产数据。
- [cuhk-bus-android](https://github.com/seventhmoon/cuhk-bus-android) 展示了“教学日/非教学日/公众假期决定当天路线”的早期做法，但数据停留在 2015–2016 年，且无许可证。
- [CU-BUS-NEW](https://github.com/Winniehyww/CU-BUS-NEW) 展示了地图、站点搜索、换乘搜索和日期模式，但路线、校历、假期、站间偏移都硬编码在一个前端页面里，无法长期维护；仓库也无许可证。

因此，建议是：**借鉴产品和数据建模思路，不复制上述代码或数据；先建立 CUpedia 自己的、可追溯的“当天班次”数据管道。** 第一版将所有结果明确标注为“按时刻表推算”，不要称为“实时到站”。只有 CUHK 将来提供车辆位置或实时到站接口后，才把 realtime 作为独立数据源加入。

## 调研方法与检索边界

检索了 GitHub、GitLab 和公开网页中与 `CUHK bus`、`CU Bus`、`中大校巴`、`CUHK shuttle bus`、CU Bus 应用名称及包名相关的仓库和代码。GitHub 仓库搜索中，与 `CUHK` 和 `bus` 同时相关的公开仓库共 7 个；其中 3 个是校巴时刻/路线应用，另外 4 个分别为空仓库、CUHK Shenzhen 项目、校巴证生成器和无关商业项目。

这不能证明互联网中绝对不存在未索引或私有源码，但截至调研日，没有找到公开索引、可对应到现有 [CU Bus Android 应用](https://play.google.com/store/apps/details?id=com.carsonwah.cubus) 或 [CU Bus iOS 应用](https://apps.apple.com/hk/app/cu-bus-for-cuhk-shuttle-bus/id1434225006?l=en-GB) 的源码仓库。两者商店页面也没有声明开源。

## CUHK 相关公开实现

### 1. CUHK-bus-clock：时刻表加经验站间耗时

[仓库](https://github.com/CCheukKa/CUHK-bus-clock)是 Expo/React Native 应用，采用 GPL-3.0。其核心数据和算法分别位于 [`constants/BusData.ts`](https://github.com/CCheukKa/CUHK-bus-clock/blob/main/constants/BusData.ts)、[`utils/Bus.ts`](https://github.com/CCheukKa/CUHK-bus-clock/blob/main/utils/Bus.ts) 和 [`scripts/processing.ts`](https://github.com/CCheukKa/CUHK-bus-clock/blob/main/scripts/processing.ts)。

它的做法是：

1. 在代码中维护路线变体、站点顺序、站点坐标、服务星期、首末班和每小时发车分钟。
2. 用户选择起终点后，在有序站点列表中找可达路线，并优先选择站数较少的路线。
3. 以路线起点的计划发车时间为基准，累加历史采样得到的相邻站点平均行车时间，形成中途站 ETA。
4. 若某一站间没有采样，回退到固定的约 120.5 秒。

仓库中的处理后日志共 154 条，日期从 2025-02-21 到 2025-04-25，覆盖 1A、1B、2、3、4、5、8、H、N。由此得到 54 个站间组合、合计 113 个有效耗时样本；5 个组合没有样本，很多组合只有 1–3 个样本，最高为 16 个。这说明该算法适合作为“如何从计划发车推算中途站”的原型证据，但不足以支持可靠的生产 ETA，也不能被描述为实时。

另一个值得注意的失败模式是公众假期加载。[`PublicHolidayScraper.ts`](https://github.com/CCheukKa/CUHK-bus-clock/blob/main/utils/PublicHolidayScraper.ts) 从香港 1823 JSON 获取假期，但首次判断时异步请求没有被等待，可能先返回“非假期”。这提醒我们：服务日历必须在生成当天班次前完成加载，并且要有失败和过期状态，不能在展示过程中隐式异步更新。

可借鉴：路线变体、站点顺序、计划发车与经验偏移分离；中途 ETA 的推算模型。

不可直接用：GPL 代码；来源和授权未独立确认的数据；低样本经验耗时；固定缺失值回退。

### 2. cuhk-bus-android：显式服务日历，但已经失效

[仓库](https://github.com/seventhmoon/cuhk-bus-android)是 2015–2016 年的原生 Android 应用，无许可证。路线和班次被编译进 [`bus_route.xml`](https://github.com/seventhmoon/cuhk-bus-android/blob/master/app/src/main/res/xml/bus_route.xml) 与 [`bus_time.xml`](https://github.com/seventhmoon/cuhk-bus-android/blob/master/app/src/main/res/xml/bus_time.xml)，运行时根据星期、公众假期和非教学日决定路线是否运行。

它能显示某条路线的上一班、下一班和再下一班，但没有中途站 ETA、车辆位置或在线更新机制。教学日和假期日期均硬编码，日期表很快就失效。作者另有一个旧的 [CUHK Campus Map Data gist](https://gist.github.com/seventhmoon/8234c5bbde540c2c33da)，包含站点坐标、路线段和编码折线，可作为“地图层与班次层分开”的历史 schema 参考，但同样没有许可证，也不是当前官方数据。

可借鉴：把服务日历作为路线是否运行的显式条件。

不可直接用：无许可证代码/数据；过期时刻表和校历；静态编译更新方式。

### 3. CU-BUS-NEW：完整 UI 原型，但数据全在客户端硬编码

[仓库](https://github.com/Winniehyww/CU-BUS-NEW)是 Vite/Leaflet 单页应用，无许可证。主页面 [`index.html`](https://github.com/Winniehyww/CU-BUS-NEW/blob/main/index.html)同时保存站点、路线、发车规则、站间分钟偏移、2025–26/2026–27 学期范围和 2025–26 公众假期。

其“实时班次”实际是“计划发车时间 + 手工站间偏移”的前端计算。换乘搜索将路线相邻站构成图，再加入手工步行边，枚举少量换乘路径并按等待、乘车和步行时间排序。路线形状由 [`fetch_routes_geo.js`](https://github.com/Winniehyww/CU-BUS-NEW/blob/main/fetch_routes_geo.js) 调用 OpenRouteService 生成；但驾驶路线几何不等于校巴实际轨迹，也不能用于推算班次时间。

该实现暴露了几个应避免的问题：领域数据在多个脚本重复，容易漂移；校历把整段学期直接视为教学日，无法表达阅读周、临时停课和特别安排；没有来源快照、更新时间、差异审核或告示入口；路线服务仍被压缩成多个布尔条件。

可借鉴：站点/路线地图、按站查询下一班、有限换乘搜索的交互。

不可直接用：无许可证代码/数据；“实时”命名；硬编码日历和站间偏移；提交在脚本中的第三方凭据。

## 同类开源方案

| 项目                                                                                                                    | 许可证与状态                 | 有价值的实现                                                                                                    | 对 CUpedia 的适配判断                                                                           |
| ----------------------------------------------------------------------------------------------------------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| [AmesRide](https://github.com/patrickdemers6/AmesRide)                                                                  | GPL-3.0；前端最后活跃于 2024 | GTFS 形状的静态数据按 hash 缓存；WebSocket 只订阅当前路线/站点；静态缓存和实时数据分开                          | 适合借鉴缓存与订阅边界；后端未开源，且 GPL 不适合直接复制                                       |
| [UCITransit](https://github.com/robsterthelobster/UCITransit) / [旧版](https://github.com/tripleducke/Capstone-Project) | Apache-2.0 / MIT；2016–2017  | 把 Routes、Stops、Arrivals、Vehicles 分表；刷新时保留旧到站记录但标为非当前；多校园用 provider/config 分离      | 适合借鉴 provider 接口和 freshness 字段；依赖 Syncromatics，不能用于 CUHK                       |
| [AUST Travels](https://github.com/ali-ahnaf/aust_travels)                                                               | MIT；最后活跃于 2021         | 志愿者登录后每 30 秒向 Firebase 上传高精度位置，并显示最后上传者和时间                                          | 证明众包定位可行，但带来隐私、信任、耗电和运营责任，不建议第一版采用                            |
| [Transit Tracker API](https://github.com/tjhorner/transit-tracker-api)                                                  | MIT；2026 仍活跃             | 统一 GTFS/GTFS-Realtime、OneBusAway、HAFAS provider；静态 feed 校验/哈希；Redis/Postgres；输出显式 `isRealtime` | 若未来获得 GTFS 或实时 feed，可作为独立后端候选；当前对“解析 CUHK 网页/PDF”过重且没有现成适配器 |

同类项目给出的共同结论是：**静态服务定义、当天计划班次、预测到站、实时车辆和告示必须是不同的数据层。** 将它们混成一个“时间”字段，会让用户无法判断结果是官方时刻、模型预测，还是实时信号。

## 建议的数据模型

campus-map 尚未接入应用，不妨先共享稳定的领域 schema，而不是共享 UI 或某个项目的硬编码对象。建议最少包含：

- `stops`：稳定 ID、双语名称、坐标、可选 campus-map feature ID。
- `routes`：用户可识别的路线身份；不要把某一套站序直接塞进 route。
- `route_patterns`：方向/变体，以及适用的 route；1A、1B、2+ 这类差异可保留为公开名称或 alias。
- `pattern_stops`：有序站点、计划偏移秒数（可空）、偏移方法、证据样本数和来源。
- `service_rules` 与 `service_exceptions`：星期规则、教学期约束和某一具体日期的停驶/加班；“当天”结果由香港时区日期编译，不要求前端理解完整校历。
- `departures`：某日、某 route pattern 的起点发车时刻及职员专车等限制标注。
- `source_snapshots`：来源 URL、抓取时间、内容 hash、适用日期、解析器版本和审核状态。
- `service_alerts`：生效时间、影响路线/站点、原文链接和最近确认时间。
- `arrival_projections`：`scheduled_origin`、`estimated_intermediate` 或未来的 `realtime`；同时保存 `calculated_at`、依据来源、样本数/置信说明。

重点不是表名，而是保留三个事实：数据来自哪里、适用于哪一天、这个时间到底是计划还是预测。这样 campus-map 以后只需消费 stop、pattern 和 geometry，班次服务则消费同一组稳定 ID。

## 推荐实现路径

### 第一阶段：官方来源驱动的当天时刻表

1. 保存 CUHK 官方页面/PDF/告示的原始快照，不把第三方仓库当官方数据源。
2. 解析为独立于页面格式的 route、pattern、stop、service rule 和 departure。
3. 对抓取结果做结构校验和前后 diff；路线、站数或班次大幅变化时进入人工审核，不自动发布。
4. 每天按 `Asia/Hong_Kong` 生成当天有效班次，把教学日、公众假期、临时特别安排都折叠进结果。
5. UI 先显示“下一班计划发车”“职员专车”等确切信息，并展示来源和更新时间。

### 第二阶段：明确标注的中途站预测

可以采用 CUHK-bus-clock 证明可行的“起点时刻 + 站间偏移”方法，但需要重新采集或获得有授权的数据：

- 没有可靠偏移时，不给中途 ETA，不能用固定两分钟伪造精度。
- 展示为“预计”，同时保留计划依据、样本数、采集时间窗和误差评估。
- 不同路线变体、时段和星期分别建模；不能用一个全局站间平均值覆盖所有交通条件。
- 在真实到站样本足够前，不做复杂机器学习。简单、可解释、可校准的分段统计更适合第一版。

### 第三阶段：有正式 feed 后再增加 realtime

如果 CUHK 后续提供车辆位置或实时到站 feed，再通过 provider 接口接入，并将 `isRealtime`、观测时间、过期阈值和 fallback 规则公开给前端。此时可以评估 Transit Tracker API 这类 GTFS 后端；在没有 feed 之前部署它不会产生实时能力。

## 复用与许可证判断

- CUHK-bus-clock 和 AmesRide 为 GPL-3.0。除非整个分发方式和 CUpedia 的许可证策略经过确认，否则只借鉴公开思想，不复制实现。
- cuhk-bus-android、CU-BUS-NEW 和旧 Campus Map gist 没有许可证。公开可读不等于可复制；默认不复用代码、数据或路线几何。
- UCITransit、AUST Travels、Transit Tracker API 使用 MIT/Apache-2.0，可在保留许可证和 attribution 的前提下复用；但它们的技术栈或数据源均不直接匹配当前需求，重新实现小型接口通常比引入整个项目更安全。
- 第三方仓库中的 CUHK 时刻、路线和经验耗时还存在数据权利与来源问题，即使代码许可证允许，也应独立向官方来源验证。

## 最终建议

当前最好的下一步不是把某个开源 app 搬进 CUpedia，而是用真实的 2025–26/2026–27 CUHK 公布资料做一次可重复的 ingestion：保存来源快照、解析、校验并产出“今天运行的班次”。完成后再用实际数据反推最终 schema，并让 campus-map 共享 stop/route-pattern ID。

开源项目中最值得保留的三条设计原则是：

1. 从 CUHK-bus-clock 借鉴“计划时刻与经验偏移分离”，但所有中途时间只标为预测。
2. 从 AmesRide/UCITransit 借鉴“静态、预测、实时及 freshness 分离”。
3. 从这些 CUHK 项目的维护失败中吸取教训：不要把校历、班次、路线和来源全部硬编码进客户端。

这条路径符合目前的产品边界：只回答“今天有什么车”，职员专车明确标注，不建设通用校巴百科，也不在缺乏证据时承诺确切到站时间。
