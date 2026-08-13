# CUHK 尚未接入路线：现行班次、站序与接入优先级

核对日期：2026-08-12（Asia/Hong_Kong）
范围：当前 App 尚未接入的免费校巴 `6A / 6B / 7 / 8 / N / H`；另列公开收费穿梭小巴 `Up / Down` 的边界。
用途：决定下一批 cold-start 数据接入顺序。本文件只记录研究结论，不把任何第三方逐站时间称为官方数据。

## 结论

- 当前 `src/lib/campus-transport/routes-data.ts` 和 `docs/campus-transport/data/cold-start/` 实际接入 **6 条路线：1A、1B、2、3、4、5**。每条都有 cold-start dataset；除 2 号线外也各有一个 OSM geodata 文件。
- CUHK 交通处当前公开的免费校巴共有 **12 条**：1A、1B、2、3、4、5、6A、6B、7、8、N、H。故尚缺 **6A、6B、7、8、N、H**。官网 WordPress route collection 另有收费小巴 Up、Down，两者不应混进免费校巴列表。[CUHK route REST](https://transport.cuhk.edu.hk/wp-json/wp/v2/route?per_page=100&_fields=id,slug,modified,title,link)
- 2026-08-12 是星期三、不是香港公众假期，而且落在 2025–26 夏季学期结束和 2026–27 第一学期开始之间；因此按现有日历证据，它是**非教学日**。[CUHK 2025–26 teaching terms](https://www.res.cuhk.edu.hk/general-information/almanac/university-almanac-2025-26/full-time-undergraduate-programmes-teaching-terms/)、[CUHK 2026–27 teaching terms](https://www.res.cuhk.edu.hk/general-information/almanac/university-almanac-2026-27/full-time-undergraduate-programmes-teaching-terms/)、[GovHK 2026 公众假期](https://www.gov.hk/tc/about/abouthk/holiday/2026.htm)
- 所以今日尚未接入路线中，免费校巴只有 **8 和 N 有服务**：8 号线采用非教学日 pattern，N 运行晚间班次；H、6A、6B、7 今日无服务。
- 官网仍然只公开**起点发车**，没有逐站计划到站、逐站 offset、实时车辆或实际到站历史。CU Bus App / Anson 的逐站秒数只能合并为一个相关的 `community_schedule_prior`；所有中间站时间必须显示“预计”。
- 推荐下一批优先做 **N + H**，再做 **6B + 7 + 6A**，最后做 **8**。N/H 的官方班次和两个条件 pattern 已完整，且能复用一套长环线；但 N 的逐站 offset 置信度最低。8 虽然今日有服务，却仍缺非教学日末段的独立 OSM route shape，不能静默借用教学日终点。

## 当前实现盘点

| 路线 | cold-start dataset      | 地图来源                                  | pattern 数 | 逐站 `p50Seconds` | 当前状态 |
| ---- | ----------------------- | ----------------------------------------- | ---------: | ----------------- | -------- |
| 1A   | `route-1a.staging.json` | `route-1a.osm.json`                       |          1 | 6/6 有值          | 已接入   |
| 1B   | `route-1b.staging.json` | `route-1b.osm.json`                       |          1 | 8/8 有值          | 已接入   |
| 2    | `route-2.staging.json`  | `src/lib/campus-transport/route-2-map.ts` |          2 | 19/19 有值        | 已接入   |
| 3    | `route-3.staging.json`  | `route-3.osm.json`                        |          1 | 15/15 有值        | 已接入   |
| 4    | `route-4.staging.json`  | `route-4.osm.json`                        |          1 | 15/15 有值        | 已接入   |
| 5    | `route-5.staging.json`  | `route-5.osm.json`                        |          1 | 9/9 有值          | 已接入   |

代码证据：[routes-data.ts](../../../src/lib/campus-transport/routes-data.ts)；数据目录：[cold-start](../data/cold-start/)、[geodata](../data/geodata/)。

## 尚未接入路线的官方运营骨架

“今日”一栏专指 2026-08-12。官网没有专门的巴士教学日 feed；非教学日判断来自 CUHK Almanac，实施时仍应保留可审计的日历来源。

| 路线                  | 官网服务日与起点班次                                                  | 今日                                           | 官方 pattern                                                            | 第一方来源                                                                                                                                      |
| --------------------- | --------------------------------------------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **6A 下行线（敬文）** | 教学日；周一至五 09:10–17:10、周六 09:10–13:10；每小时 `10` 分        | 无服务                                         | 固定 10 站                                                              | [路线页](https://transport.cuhk.edu.hk/tc/route/6a/)、[转堂校巴 PDF](https://transport.cuhk.edu.hk/wp-content/uploads/documents/Meet-class.pdf) |
| **6B 下行线（新联）** | 教学日；周一至五 12:20–17:20；每小时 `20` 分；周六无服务              | 无服务                                         | 固定 6 站                                                               | [路线页](https://transport.cuhk.edu.hk/tc/route/6b/)、[转堂校巴 PDF](https://transport.cuhk.edu.hk/wp-content/uploads/documents/Meet-class.pdf) |
| **7 下行线（逸夫）**  | 教学日；周一至五 08:18–17:50、周六 08:18–13:18；每小时 `18、50` 分    | 无服务                                         | 固定 8 站                                                               | [路线页](https://transport.cuhk.edu.hk/tc/route/7/)、[转堂校巴 PDF](https://transport.cuhk.edu.hk/wp-content/uploads/documents/Meet-class.pdf)  |
| **8 西部线**          | 周一至六，公众假期除外；07:40–18:40；每小时 `00、20、40` 分           | **有服务，34 班**：07:40，之后每 20 分至 18:40 | 教学日 16 站；非教学日 17 站                                            | [路线页](https://transport.cuhk.edu.hk/tc/route/8/)、[穿梭校巴 PDF](https://transport.cuhk.edu.hk/wp-content/uploads/documents/Shuttle.pdf)     |
| **N 晚间线**          | 周一至六，周日及公众假期停驶；19:00–23:30；每小时 `00、15、30、45` 分 | **有服务，19 班**：19:00 起每 15 分至 23:30    | `15/30/45` 分 19 站；`00` 分经 PGH1 去回各一次，共 21 occurrence        | [路线页](https://transport.cuhk.edu.hk/tc/route/n/)、[晚间／假日校巴 PDF](https://transport.cuhk.edu.hk/wp-content/uploads/documents/NH.pdf)    |
| **H 假日线**          | 周日及公众假期；08:20–23:20；每小时 `00、20、40` 分                   | 无服务                                         | `20/40` 分 19 站；`00` 分经 PGH1 去回各一次并经 39 区，共 22 occurrence | [路线页](https://transport.cuhk.edu.hk/tc/route/h/)、[晚间／假日校巴 PDF](https://transport.cuhk.edu.hk/wp-content/uploads/documents/NH.pdf)    |

### 官网站序

HTML 的 DOM 顺序服务于左右两栏排版，不等于行车顺序；以下顺序来自当前官方 PDF 的视觉路线图，并与 repo 的 `officialMapEvidence.routePatterns` 人工审核结果一致。

#### 6A

> 敬文书院（下行） → 联合苑 → 陈震夏宿舍 → 伍宜孙书院（下行） → 新亚书院 → 联合书院（下行） → 大学行政楼 → 善衡书院 → 大学站广场 → 崇基教学楼

第一方证据：[6A 路线页](https://transport.cuhk.edu.hk/tc/route/6a/)、[转堂校巴 PDF](https://transport.cuhk.edu.hk/wp-content/uploads/documents/Meet-class.pdf)。

#### 6B

> 新亚书院 → 联合书院（下行） → 大学行政楼 → 善衡书院 → 大学站广场 → 崇基教学楼

第一方证据：[6B 路线页](https://transport.cuhk.edu.hk/tc/route/6b/)、[转堂校巴 PDF](https://transport.cuhk.edu.hk/wp-content/uploads/documents/Meet-class.pdf)。

#### 7

> 逸夫书院（下行） → 伍宜孙书院（下行） → 新亚书院 → 联合书院（下行） → 大学行政楼 → 善衡书院 → 大学站广场 → 崇基教学楼

第一方证据：[7 路线页](https://transport.cuhk.edu.hk/tc/route/7/)、[转堂校巴 PDF](https://transport.cuhk.edu.hk/wp-content/uploads/documents/Meet-class.pdf)。

#### 8

共同前 15 站：

> 39区（上行） → 敬文书院（下行） → 联合苑 → 陈震夏宿舍 → 逸夫书院（下行） → 伍宜孙书院（下行） → 大学行政楼 → 科学馆 → 新亚坊 → 联合书院（下行） → 伍宜孙书院（上行） → 逸夫书院（上行） → 39区（下行） → 环回北站 → 环回东站（下行）

- 教学日终点：`→ 大学站`。
- 非教学日终段：`→ 大学站广场 → 崇基教学楼`，**不停大学站**。

第一方证据：[8 路线页](https://transport.cuhk.edu.hk/tc/route/8/)、[穿梭校巴 PDF](https://transport.cuhk.edu.hk/wp-content/uploads/documents/Shuttle.pdf)。

#### N

`15/30/45` 分 pattern：

> 大学站 → 大学体育中心 → 邵逸夫堂 → 新亚坊 → 联合书院（下行） → 伍宜孙书院（上行） → 逸夫书院（上行） → 39区（上行） → 敬文书院（下行） → 十五苑 → 联合苑 → 陈震夏宿舍 → 逸夫书院（下行） → 伍宜孙书院（下行） → 新亚书院 → 联合书院（下行） → 大学行政楼 → 善衡书院 → 大学站

`00` 分 pattern 在离站后和回站前各加入一次研究生宿舍一座：

> 大学站 → **研究生宿舍一座** → [上述中间站] → 善衡书院 → **研究生宿舍一座** → 大学站

第一方证据：[N 路线页](https://transport.cuhk.edu.hk/tc/route/n/)、[晚间／假日校巴 PDF](https://transport.cuhk.edu.hk/wp-content/uploads/documents/NH.pdf)。同一个 `stopId` 在一圈内出现两次，必须保留两个 `stop_sequence`，不可去重。

#### H

`20/40` 分 pattern：

> 大学站 → 大学体育中心 → 邵逸夫堂 → 新亚坊 → 联合书院（下行） → 伍宜孙书院（上行） → 逸夫书院（上行） → 敬文书院（下行） → 十苑 → 十五苑 → 联合苑 → 陈震夏宿舍 → 逸夫书院（下行） → 伍宜孙书院（下行） → 新亚书院 → 联合书院（下行） → 大学行政楼 → 善衡书院 → 大学站

`00` 分 pattern 在离站后和回站前各加入一次研究生宿舍一座，并在逸夫书院（上行）后加入 39 区（上行）：

> 大学站 → **研究生宿舍一座** → [至逸夫书院（上行）] → **39区（上行）** → [其余 H 站点] → 善衡书院 → **研究生宿舍一座** → 大学站

第一方证据：[H 路线页](https://transport.cuhk.edu.hk/tc/route/h/)、[晚间／假日校巴 PDF](https://transport.cuhk.edu.hk/wp-content/uploads/documents/NH.pdf)。

## 多源交叉验证与 offset 边界

交叉验证读取的是原始上游或本 repo 保存的固定研究快照，不把已有 handoff 当成第二票。详细复现路径见 [数据源 handoff](./cu-bus-data-sources-handoff.md) 和 [多源补全审计](./cu-bus-multi-source-route-completion-audit.md)。

| 路线 | 站序／地图交叉验证                                                                                                                                                                                                                                                                               | 逐站时间证据                                                                      | 可发布结论                                                              |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| 6A   | CU Bus App、[Anson CUBus](https://github.com/AnsonCheng03/CUBus) 和 [Flippy CU_v1.1](https://github.com/Megumi-B/Flippy_Routes_Addon/releases/tag/CU_v1.1) 都与官方 10 站一致；OSM relation 有一个重复的联合书院 occurrence，导入时须按[官方 6A](https://transport.cuhk.edu.hk/tc/route/6a/)删重 | App + Anson 有全线秒数，但两者高度相关；Bus Clock 无 6A 路线样本                  | 可接官方骨架与地图；offset 只能是低置信度预计                           |
| 6B   | 三个社区源均与[官方 6B](https://transport.cuhk.edu.hk/tc/route/6b/)的 6 站一致；OSM shape 连续                                                                                                                                                                                                   | App + Anson 有全线秒数；Bus Clock 无 6B 路线样本                                  | 六条中结构最简单，适合先做验证模板                                      |
| 7    | 三个社区源均与[官方 7](https://transport.cuhk.edu.hk/tc/route/7/)的 8 站一致；OSM shape 连续                                                                                                                                                                                                     | App + Anson 有全线秒数；Bus Clock 无 7 路线样本                                   | 可接官方骨架；offset 为低置信度预计                                     |
| 8    | App、Anson、Flippy 都分教学／非教学两个 pattern，与[官方 8](https://transport.cuhk.edu.hk/tc/route/8/)规则一致；教学日 OSM shape 完整，非教学日缺 `大学站广场 → 崇基教学楼` 的独立 route shape                                                                                                   | App + Anson 两变体完整；Bus Clock 只有稀疏且 pattern 身份不可靠的观测             | 班次可接；非教学日地图末段需独立审核，不能复制 App 的 Google Directions |
| N    | App、Anson、Flippy 都能还原普通和 `00` 分两个 pattern；OSM 路线可用                                                                                                                                                                                                                              | App + Anson 两变体完整；Bus Clock 仅 1 个 N GPS 点、0 个站间样本                  | 可上线“预计”，但为六条中 offset 置信度最低                              |
| H    | App、Anson、Flippy 都能还原普通和 `00` 分两个 pattern；OSM 有一个重复 WYS Downward occurrence，须按[官方 H](https://transport.cuhk.edu.hk/tc/route/h/)删重                                                                                                                                       | App + Anson 两变体完整；Bus Clock 对普通 H 有少量弱验证，但无法证明 `00` 分条件段 | 可上线“预计”；条件 pattern 不可声称已实测                               |

CU Bus App v1.18 的固定研究快照见 [`cu-bus-app/README.md`](../data/third-party/cu-bus-app/README.md) 与 [`provenance.json`](../data/third-party/provenance.json)。它有完整 `arrival_schedule` 和 `route_segment`，但没有公开采集方法或开放数据许可。App 与 Anson 可对齐的 125 条边中 113 条相差不超过 2 秒，因此工程上只算**一个**社区先验来源，不能把一致性当作两份独立实测。

### 无法确认的逐站 offset

对 6A、6B、7、8、N、H，CUHK 第一方资料均未公开：

- 起点以外各站的计划到达时间；
- 相邻站标准行驶秒数；
- 车辆、Trip 或到站事件身份；
- 按高峰、开学月份、天气拆分的延误分布。

因此下一批 cold-start 若采用 CU Bus App / Anson 数值，应保存为：

```text
sourceKind = community_schedule_prior
publicationStatus = staging_only
displayLabel = 预计
sampleCount = unknown
routeScopedObservation = false
```

不能使用 `official_stop_time`、`observed_arrival` 或“实测”等标签。Bus Clock 的 GPS 数据同样没有 trip identity，详见 [Bus Clock 校准数据审计](./bus-clock-calibrated-data-audit.md)。

## 近两年有效性

本轮在 2026-08-12 重新下载并核验 CUHK 第一方 PDF：

| 资产                                                                                        | 当前文件 SHA-256  | 当前 PDF 修改时间 | 2024–25 归档及明确生效日                                                                                                 | 数字班次比较                                               |
| ------------------------------------------------------------------------------------------- | ----------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| [Shuttle.pdf](https://transport.cuhk.edu.hk/wp-content/uploads/documents/Shuttle.pdf)       | `b3262eae…14d09d` | 2026-02-04        | [Shuttle_24-25.pdf](https://transport.cuhk.edu.hk/wp-content/uploads/documents/Shuttle_24-25.pdf)，2024-09-03 生效       | 8 的时段、分钟及非教学日终点规则一致                       |
| [Meet-class.pdf](https://transport.cuhk.edu.hk/wp-content/uploads/documents/Meet-class.pdf) | `fd85c6d5…b58439` | 2026-02-04        | [Meet-class_24-25.pdf](https://transport.cuhk.edu.hk/wp-content/uploads/documents/Meet-class_24-25.pdf)，2024-09-02 生效 | 6A、6B、7 数字班次一致；当前版明确扩写阅读周／大学假期停驶 |
| [NH.pdf](https://transport.cuhk.edu.hk/wp-content/uploads/documents/NH.pdf)                 | `4238b6a1…24b854` | 2026-02-04        | [NH_24-25.pdf](https://transport.cuhk.edu.hk/wp-content/uploads/documents/NH_24-25.pdf)，2024-08-26 生效                 | N、H 时段、分钟与条件站规则一致                            |

这证明 2024–25 归档版与 2026 当前版的关键运营数字相同，**不能证明两次快照之间每一天都从未临时调整**。当前 PDF 也没有业务 `validFrom`；WordPress `modified` 只是内容更新时间。路线页 REST 截至本轮核对显示：N 最后修改 2025-11-17，8 为 2026-03-30，6A/6B/7 为 2026-04-21，H 为 2026-07-26。[官方 route REST](https://transport.cuhk.edu.hk/wp-json/wp/v2/route?per_page=100&_fields=id,slug,modified,title,link)

上线后仍需同时抓取[交通处最新消息](https://transport.cuhk.edu.hk/tc/whats-new/)；临时停站或停驶不会自动回写到静态路线 pattern。

## 推荐下一批路线

### P0：N + H，同批接入

理由：

- 用户明确优先关注；N 今日有服务，H 覆盖周日及公众假期，合起来补齐夜间／假日空档。
- 两条路线共享大部分环线站点和地图 geometry，可共用 geodata 审核。
- 官方两个 pattern 都已明确，并可由 `departureMinutes` 选择；现有 2 号线已经证明实现层能表达“某些发车分钟不经此站”。

上线门槛：

1. `00` 分必须选择特殊 pattern，而非在 UI 写死条件站；
2. PGH1 在一圈中保留两次 occurrence；
3. N/H offset 全部标“预计”，N 采用比 H 更宽的先验不确定性；
4. 加 H 周日／公众假期、N 周一至六／公假停驶的日期测试。

### P1：6B + 7 + 6A

- 6B 最简单，可先作为教学日路线的模板；然后 7、6A。
- 官方站序固定，地图大致完整，没有按发车分钟切换 pattern。
- 主要风险是教学日判断和低置信度 offset；当前 2026-08-12 无服务，产品即时收益低于 N/H。

上线门槛：同时接入周一至五／周六不同服务 band，并明确排除阅读周和大学假期；不可直接信 CU Bus App 自带的 `operating_day`，它与当前 CUHK Almanac 有已知冲突。

### P2：8

- 官方班次和两个 pattern 都已确认，且今天实际需要非教学日 pattern。
- 但它需要以服务日选择 pattern，且非教学日末段缺独立、可再发布的贴路 shape。若 geometry 未完成，可以先隐藏该路线地图或明确标 provisional；不能让 marker、路线和道路再次错位。

### 暂不纳入免费校巴批次：Up / Down

Up、Down 是 HK$5.5 收费穿梭小巴，产品分类、乘客提示和条件停站均不同。[Up 官方页](https://transport.cuhk.edu.hk/tc/route/up/)、[Down 官方页](https://transport.cuhk.edu.hk/tc/route/down/)、[收费小巴 PDF](https://transport.cuhk.edu.hk/wp-content/uploads/documents/PSLB_2025.pdf)

更重要的是，Down 的 `08:45–21:15` 服务日存在第一方冲突：路线页写“星期日及公众假期”，PDF 写“星期一至日及公众假期”。在交通处澄清前不应静默选边，故本轮不建议接入。

## 接入验收清单

1. 计划发车只来自 CUHK 路线页／当前 PDF；保存 URL、抓取时间、hash 和 parser version。
2. 站序只来自人工审核后的官方路线图，不使用 HTML DOM 顺序。
3. 每个条件服务生成独立 `RoutePattern`，并保留重复 stop occurrence。
4. 当天无服务时直接显示“今日无服务”，不生成到下一服务日的巨型分钟数。
5. 所有中间站 ETA 显示“预计”，并保留 community prior provenance。
6. 站点坐标和 OSM shape 分开审核；不平均道路两侧或相距较远的同名点。
7. 路线页之外定期检查交通处最新消息，给临时安排设置有效期。
