# 准确冷启动数据与开源交通推断项目

日期：2026-08-10
范围：回答“早期有准确数据是否更容易修正”以及“交通领域是否已有可借鉴的开源实现”。本报告只把有公开代码或一手项目材料的方案列为证据，并区分生产系统、数据工具和算法样例。

## 结论

**是，冷启动阶段主动取得一批经审核的实际到站数据，会显著降低后续修正难度。**它们不应只是与匿名反馈混在一起增加样本数，而应承担三个不同职责：

1. **informative prior**：校准第一版各 `RoutePattern × Stop` 的累计运行时间和先验强度，而不是凭感觉填写“6:02、6:04”；随着真实服务日增加，旧先验逐步衰减。
2. **online anchor**：估计并约束不同观测来源的偏差、噪声与单事件最大影响，避免大量同车匿名点击淹没一个高质量锚点。
3. **protected evaluation**：保留从未参与拟合的 benchmark，并持续补充新的 gold shadow set，作为模型能否发布的独立证据。

开源证据分别支持“轨迹处理、历史运行时间、当前车辆状态、标准化发布”等环节，但**没有项目验证过 CUHK 的 `teachingDay × weekOfTerm` 特征组合**。以下是基于这些先例为 CUpedia 设计的组合，不是照搬后即可成立的现成答案：

```text
随车 GPS + 人工到站标记
        ↓
轨迹与 RoutePattern 对齐，产出可信 ArrivalEvent
        ↓
长期模型：学习时段、教学日、weekOfTerm 的规律
        +
当前 Trip 层：有足够新鲜且可匹配的观测时短期修正
```

同口径核对后，[TheTransitClock](https://github.com/TheTransitClock/transitime) 是本轮最接近完整 ETA 引擎的候选，[Transitcast 的 Go module 存档](https://pkg.go.dev/github.com/OpenTransitTools/transitcast) 最接近所需的观测管线，[gps2gtfs](https://github.com/aaivu/gps2gtfs) 则最接近前期随车 GPS→到站事件的离线工具。这个排名只针对本项目当前问题；三者都假设有连续车辆位置或可识别 Trip，不能直接把“路线 + 站点 + 到站时间”的匿名单击变成可靠实时 ETA。

> **产品约束更新（2026-08-10）**：项目方无法主动随车采集，也没有运营方 AVL/逐站日志。因此 gold/reference collection 只保留为“未来若出现外部数据时的增强方案”，不再是当前实施前置。当前正式路线是：公开数据生成 Cold-start offset → UI 收集匿名 Arrival observations → 重建 Arrival events → 每 1–3 天验证并发布模型。详见 [`feedback-first-eta-rollout.md`](../feedback-first-eta-rollout.md)。

## 准确数据应怎样进入模型

### 什么才算准确数据

不能只按来源名称预先排质量。候选包括校方 AVL/GPS、项目组随车连续 trace + 人工到站锚点、站点人工观察、普通匿名反馈，以及 Bus Clock 派生样本。每一种都必须通过同一组 gate：

- 设备和服务器时钟是否同步；
- 能否匹配 `serviceDate × RoutePattern × Trip`；
- 到站定义是进入 geofence、停车、开门还是人工点击；
- GPS accuracy、采样间隔、缺点率和重复物理事件如何；
- 与人工抽检锚点相比是否存在系统性早/晚偏差。

因此，运营方 AVL 可能覆盖最好，却不天然是真值；带人工站点锚点的受控采集反而更适合成为首批 gold。只有通过上述审计的数据才升级为 gold。

“可信用户提交”本身不自动等于 gold。连续轨迹、人工到站锚点、GPS 精度、采集方法和审核状态都应作为 provenance 保存。主动采集可进一步评估 [Traccar Client](https://github.com/traccar/traccar-client) 的开源后台定位客户端，或 [NREL OpenPATH](https://e-mission.readthedocs.io/) 的同意式移动轨迹采集架构；它们适合受控志愿者研究，不应被扩展成对普通乘客的被动追踪。

### 不要给所有来源相同权重

一种可审计的表示是：

```text
observedArrivalAt_i ~ Distribution(trueArrivalAt, sourceNoise_i)
```

在高斯近似下，观测对后验的影响与 `1 / sourceNoise²` 成正比，但这只处理随机噪声。实际模型还需要来源偏差项、重尾或污染分布，以及单个 ArrivalEvent 的影响上限；否则大量相关点击、系统性晚报或恶意极值仍会破坏结果。`sourceNoise` 和 `sourceBias` 只能用“与 gold 配对的同一物理到站事件”估计，不能提前拍脑袋写死。

原始提交仍可全部保存，但统计模型应先把同一物理到站的多个观测聚合为一个 `ArrivalEvent`。否则十个人同时看到一辆车，会被错误解释成十次独立到站。gold data 与普通反馈可以共用 ArrivalEvent schema，但必须保留 `sourceKind`、`collectionMethod`、`traceId`、`gpsAccuracy`、`reviewStatus` 和数据集用途。

### 训练集和验收集必须分开

准确数据不能全部拿来拟合，否则只能证明模型记住了它见过的记录。建议按完整服务日或完整 Trip 划分：

- calibration/train：建立初始 stop offset 和来源误差；
- rolling validation：每次按时间前推调参与选择候选；
- benchmark：低频、受控复用，用于版本间一致比较；反复查看后不再宣称 untouched；
- fresh gold shadow：持续新采、此前未见，用于最终发布 gate。

覆盖比一个固定样本数更重要。pilot 至少要刻意覆盖主要 RoutePattern、早晚高峰与非高峰、教学日类型，以及开学前几周和之后的周次。何时“够了”由留出集的 MAE、P90、区间覆盖率和分片稳定性决定，而不是仅由点击数决定。

## 开源项目比较

“活跃”依据截至 2026-08-10 的仓库提交或发布记录，只说明仍在维护，不代表适合本项目。`—` 表示仓库未提供可安全复用的许可证，而不是默认允许使用。

### 会生成 ETA 或训练观测的项目

| 项目                                                                                                                                     | 状态 / 许可证                                | 实际输入→输出与算法代码                                                                                              | 部署形态                                     | 对稀疏站点反馈的迁移性 / 结论                                             |
| ---------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------- |
| [TheTransitClock](https://github.com/TheTransitClock/transitime)                                                                         | 最后提交 2024-07；GPL-3.0                    | GTFS + GTFS-RT VehiclePositions→GTFS-RT TripUpdates；仓库含完整 Java 系统，官方文档说明自适应 Kalman                 | Maven、数据库、Core/API/Tomcat webapp        | 输入必须是连续车辆位置；**研究 prediction/fallback/API seam，不整体移植** |
| [Transitcast module 存档](https://pkg.go.dev/github.com/OpenTransitTools/transitcast)                                                    | v0.1.4，2021-10；MPL-2.0；原 GitHub 现为 404 | GTFS + 高频 VehiclePositions→`observed_stop_time`/trip deviation；有 Go monitor 代码，尚无成熟 ML predictor          | Go executables + PostgreSQL/container        | **最值得借 observation schema 与事件提取阶段**，不能作为活跃依赖          |
| [gps2gtfs](https://github.com/aaivu/gps2gtfs)                                                                                            | 最后提交 2024-06；MIT                        | 原始 GPS + 空间线路/站点→trip sequence、到发时刻、dwell/travel duration；有 Python 处理代码                          | 离线 Python/package                          | **适合 gold pilot 原型**；输出仍需用人工锚点在 CUHK 站序上验收            |
| [TransitNetworkModel](https://github.com/tmelliott/TransitNetworkModel)                                                                  | 最后提交 2018-08；—                          | GTFS-RT→粒子滤波车辆状态→Kalman 路段速度→剩余站 ETA；有 C++ 代码，但 README 的 indefinite runner 仍是 TODO           | C++/原型                                     | 只支持连续 Trip 位置；**算法参考，不能部署或复制代码**                    |
| [bus_kalman](https://github.com/cmoscardi/bus_kalman)                                                                                    | 最后提交 2017-09；—                          | 约 30 秒 GPS 测量→5 秒位置插值；算法只有 notebook                                                                    | Jupyter notebook                             | 只解释 Kalman measurement update；**教学参考，不是 ETA 系统**             |
| [Tiramisu field trial](https://www.cmu.edu/traffic21/pdfs/zimmermanetalchi2011.pdf) / [V3](https://github.com/CMU-RERC-APT/tiramisu3-pr) | V3 最后提交 2022-01；MIT                     | 原研究用乘客连续 trace、trip id 同时构建 30 秒实时层与每日历史层；公开 V3 的 ML 实际预测用户路线筛选，并消费机构 ETA | 原系统 iOS/backend；V3 Ionic/Java/Python/AWS | **众包与两层产品先例**；公开代码不是原众包 ETA 实现，不能直接复用         |

### 能处理轨迹、路网或标准，但不会替我们生成 ETA

| 项目                                                                                      | 状态 / 许可证                                                                               | 实际输入→输出与代码                                                                                         | 部署形态                             | 本项目结论                                                                                                           |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| [OpenTripPlanner](https://github.com/opentripplanner/OpenTripPlanner)                     | 2026-08 活跃；LGPL-3.0-or-later                                                             | GTFS/OSM + 已有 realtime updates→考虑扰动的多模式 itinerary；完整 Java routing engine                       | JVM unified JAR/API                  | **消费者，不是预测器**；未来有跨校园行程规划才考虑                                                                   |
| [OneBusAway](https://github.com/OneBusAway/onebusaway-application-modules)                | 2.7.1 发布于 2026-02；Apache-2.0                                                            | GTFS + 上游 AVL arrival estimates/GTFS-RT→站点页、API、app、GTFS-RT export                                  | Java/Tomcat/Docker 社区配置          | **UI/API 产品参考**；官方步骤明确 ETA 必须来自上游，不能解决当前推断问题                                             |
| [Navitia](https://github.com/hove-io/navitia#readme)                                      | 2026-08 仍有提交；AGPL-3.0；仓库 README 的 Hove 公告称将于 2026-09 前逐步关闭其 GitHub 仓库 | GTFS/OSM + realtime data→journeys、schedules、departures、isochrones；C++/Python/Postgres                   | 多服务自托管或 API                   | **旅程规划器，不是 ETA learner**；源仓库即将关闭进一步降低采用价值                                                   |
| [MobilityData GTFS-RT Validator](https://github.com/MobilityData/gtfs-realtime-validator) | 2026-04 活跃；Apache-2.0；README 称 early alpha                                             | GTFS + GTFS-RT feed→逐规则错误/警告报告；Java validator 代码                                                | JAR、webapp、batch/Docker            | 未来发布 GTFS-RT 时作为 **CI/质量 gate**，不参与拟合                                                                 |
| [Valhalla](https://github.com/valhalla/valhalla)                                          | 3.7.0 发布于 2026-04、2026-08 活跃；MIT                                                     | OSM + noisy GPS trace→map-matched road edges/route/matrix；完整 C++ 引擎                                    | C++ server、Docker/API               | 连续轨迹 map matching 很成熟，但校园专用道路/站点语义仍需自建；pilot 才评估是否值得部署                              |
| [OSRM](https://github.com/Project-OSRM/osrm-backend)                                      | 2026-08 活跃；BSD-2-Clause                                                                  | OSM + noisy GPS trace→Match/Route/Table 等；完整 C++ 引擎                                                   | C++ backend、Docker/HTTP             | 与 Valhalla 同类；可做道路匹配，**不能判定哪一班车或哪次到站**                                                       |
| [MovingPandas](https://github.com/movingpandas/movingpandas)                              | 2026-08 活跃；BSD-3-Clause                                                                  | 点时序→trajectory、stop detection、split/analysis；完整 Python library                                      | 离线 Python/notebook                 | 轻量、适合 pilot QA/可视化；不含 GTFS Trip 匹配与 ETA 模型                                                           |
| [OpenTraffic OTv2 overview](https://github.com/opentraffic/otv2-platform)                 | overview 仓库最后提交 2017-10；LGPL-3.0                                                     | 文档描述匿名 probe positions→map matching→分路段实时/历史速度统计；Reporter、Datastore 等代码分散在独立仓库 | 分布式 reporter/datastore + Valhalla | overview 已停滞且系统面向道路速度；**只借 raw→aggregate→historical/live 的分层，不把 overview 日期外推到所有子仓库** |

### 可进一步评估的受控采集工具

| 项目                                                           | 状态 / 许可证                              | 实际输入→输出与部署                                                                | 本项目结论                                                                                         |
| -------------------------------------------------------------- | ------------------------------------------ | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| [Traccar Client](https://github.com/traccar/traccar-client)    | 2026-08 活跃；Apache-2.0                   | Android/iOS 后台位置→自托管 Traccar server；移动客户端代码可用                     | 适合快速验证连续 GPS 的耗电、权限和断网补传；不是到站/Trip 工具，正式采用前要做隐私与 SDK 集成评估 |
| [NREL OpenPATH / e-mission](https://e-mission.readthedocs.io/) | phone/server 2026-07/08 活跃；BSD-3-Clause | 同意式手机轨迹与用户标签→Python backend 的行程处理与研究数据；支持 Docker/手动部署 | 研究语义和 consent 边界更接近 gold pilot，但整套系统较重；先借采集协议与数据字段，不承诺整体集成   |

### 数据非常充分以后才可能比较的研究模型

| 项目                                                     | 状态 / 许可证                | 实际输入→输出                                                 | 对当前 CUHK 数据的结论                                         |
| -------------------------------------------------------- | ---------------------------- | ------------------------------------------------------------- | -------------------------------------------------------------- |
| [LibCity](https://github.com/LibCity/Bigscity-LibCity)   | 最后提交 2024-12；Apache-2.0 | 多种稠密轨迹/传感器数据→交通状态、ETA、map matching benchmark | 可作为未来 model zoo，不是当前生产管线                         |
| [DCRNN](https://github.com/liyaguang/dcrnn)              | 最后推送 2024-12；MIT        | METR-LA/PEMS-BAY 道路传感器图→多步速度预测                    | 原始 TensorFlow 研究代码；站点点击既不稠密也不是固定道路传感器 |
| [Graph WaveNet](https://github.com/nnzhan/Graph-WaveNet) | 最后提交 2019-12；MIT        | METR-LA/PEMS-BAY 的规则时空张量→交通状态预测                  | 只有训练/测试研究代码；当前数据形状不成立，首版排除            |

### 与高德红绿灯预测的相同点和不同点

相同的核心不是某个神奇神经网络，而是先把噪声轨迹变成可比较的事件，再跨天学习重复结构，并用当天的新观测修正短期状态。公交 ETA、路况估计和信号周期推断都遵循这个模式。

不同点是红绿灯通常缺少公开 phase truth，要从车辆停止/启动轨迹反推周期；校园巴士有官方起点班次、明确站序，而且可以主动跟车取得到站 truth。因此本项目没有必要先复刻信号灯领域最困难的无监督问题，应利用能够直接取得的监督信号。

## 当前可执行路线

### 阶段 1：公开数据冷启动

1. 用 CUHK 官方资料确定 Route、Stop、RoutePattern、服务日和起点计划发车。
2. 经授权后把 Bus Clock 等公开站间样本作为 weak prior；没有样本的区段只使用经过遮蔽验证的透明 fallback，仍不可靠就显示“预计暂缺”。
3. 每个 Cold-start projection 保存来源、样本数、fallback 层级和 P10/P50/P90；页面只显示“预计”。
4. 这一阶段无法证明真实 MAE，不应把公开数据内部一致性称为准确率。

### 阶段 2：先做简单模型

用户反馈积累后，用重建的 Arrival events 拟合 `RoutePattern × Stop` 累计中位时间，再加入 `timeBand`、教学日和 `weekOfTerm` 的层级收缩。`weekOfTerm` 是本项目假设，必须由反馈数据证明。按更晚 ServiceDay/Trip 的 crowd-reconstructed events 比较：

- 官方计划加固定 offset；
- Bus Clock 初始值；
- 新模型 P50；
- 高峰、非高峰和开学周分片。

只有新模型在时间前推验证中稳定更好，才成为可见的“预计”。这能逐步评估 Bus Clock 与 cold-start 的相对表现，但因为验证标签本身来自众包事件，指标必须标明 `evaluationSource=crowd-reconstructed`；没有独立运营方真值时，不宣称绝对准确率。

### 阶段 3：众包反馈与当前班次修正

上线简单反馈后，每条匿名观测进入同一数据管线，但使用重尾误差、事件聚合与单事件影响上限。长期模型可按 1–3 天检查/重训，只有通过 time-forward validation 的候选才发布；cold-start prior 随独立 Arrival events 和 ServiceDay 覆盖增加逐步减弱。

当前 Trip 修正先在 shadow 中运行。只有观测能较可靠地匹配具体 Trip，且回放证明下游 ETA 优于长期基准时，才把短命 overlay 显示给乘客。未来若要发布 GTFS-RT，可遵循 [Trip Updates](https://gtfs.org/documentation/realtime/feed-entities/trip-updates/) 的具体 Trip 与下游 delay 传播语义；GTFS-RT 是输出契约，不是推断算法。

## 最终选择

- **现在可复用的思想**：Transitcast 的 observation/event 分层；Tiramisu 的众包、历史模型和实时层隔离。
- **现在应研究但不移植**：TheTransitClock 的预测/降级架构；它依赖项目当前没有的连续车辆位置。
- **当前不实施**：gps2gtfs、Traccar、OpenPATH、Valhalla/OSRM 轨迹链；除非未来出现运营方/志愿者连续 GPS 数据。
- **以后数据充分再比较**：Kalman/particle filter 当前 Trip 层，以及 LibCity/DCRNN 一类复杂 challenger。
- **明确不做**：把一条匿名反馈直接改成新的发车/到站时刻；把所有来源等权；用同一批 gold data 同时训练和证明自己准确；把只消费 GTFS-RT 的前端/规划器误当作 ETA 模型。

## 主要来源

- [TheTransitClock source and documentation](https://github.com/TheTransitClock/transitime)
- [Transitcast v0.1.4 Go module 存档](https://pkg.go.dev/github.com/OpenTransitTools/transitcast)
- [gps2gtfs source](https://github.com/aaivu/gps2gtfs) 与 [论文](https://arxiv.org/abs/2412.15221)
- [TransitNetworkModel source](https://github.com/tmelliott/TransitNetworkModel)
- [Tiramisu field trial](https://www.cmu.edu/traffic21/pdfs/zimmermanetalchi2011.pdf)
- [Traccar Client source](https://github.com/traccar/traccar-client)
- [NREL OpenPATH documentation](https://e-mission.readthedocs.io/)
- [GTFS Realtime Trip Updates](https://gtfs.org/documentation/realtime/feed-entities/trip-updates/)
- [OpenTripPlanner](https://github.com/opentripplanner/OpenTripPlanner)、[OneBusAway](https://github.com/OneBusAway/onebusaway-application-modules) 与 [Navitia](https://doc.navitia.io/)
- [MobilityData GTFS Realtime Validator](https://github.com/MobilityData/gtfs-realtime-validator)
- [Valhalla](https://github.com/valhalla/valhalla)、[OSRM](https://github.com/Project-OSRM/osrm-backend) 与 [MovingPandas](https://github.com/movingpandas/movingpandas)
- [OpenTraffic OTv2](https://github.com/opentraffic/otv2-platform)
- [LibCity](https://github.com/LibCity/Bigscity-LibCity)、[DCRNN](https://github.com/liyaguang/dcrnn) 与 [Graph WaveNet](https://github.com/nnzhan/Graph-WaveNet)
