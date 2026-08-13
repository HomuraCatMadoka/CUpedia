# CUHK 逐站 ETA 冷启动数据核验

状态：为 Wayfinder 决策票「确定今日服务的数据真值与实时降级模型」回答 Q7。核验日期：2026-08-09。

## 结论

现有公开数据不足以直接生成全线、可信的逐站时刻。第一版可以将三种东西组合，但不能混成一种“官方时刻表”：

1. CUHK Transport Office 当前页面用于生成官方起点发车时间，例如 Route 1A 的 `07:40–18:50` 及每小时 `10/20/40/50` 分发车。这是官方计划，不是中间站 ETA。
2. `CUHK-bus-clock` 中的 `station-times.json` 只能作为 **staging weak prior**：它有 49 个非空站间样本组，但总共只有 113 个时长样本，且 45/49 个非空站间的样本数少于 5。
3. 仍缺的区段应由一次性人工跟车校准补齐。不得使用“每站固定两分钟”或距离/假设速度填满缺失值。

因此，“6:00 起点发车，预计 6:02 善衡、预计 6:04 邵逸夫堂”的正确冷启动形式是：官方起点发车时间 + 经授权的历史站间先验/人工实测偏移。用户界面必须称为“预计”。

## 三档判断

| 数据                                                                                                                                                                                                                                                                                  | 判断                                           | 第一版用法                                                       | 限制/放行条件                                                                                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| [CUHK Transport Office 路线页](https://transport.cuhk.edu.hk/)                                                                                                                                                                                                                        | **Production**（需经已定义的摄取 review gate） | route、服务日规则、起点发车时间、当日公告                        | 页面没有中间站到站时间；运行状态也只是抓取时的 observation                                                               |
| [CUHK route/stop WordPress REST](https://transport.cuhk.edu.hk/wp-json/wp/v2/route?per_page=100) 及 [stop REST](https://transport.cuhk.edu.hk/wp-json/wp/v2/stop?per_page=100)                                                                                                        | **Production**（经 diff/review/activate）      | 机器可追溯的 route/stop 来源                                     | 当前 DOM 的多列布局不能无人复核地当作行车站序                                                                            |
| [当前 ingest spike](https://github.com/HomuraCatMadoka/CUpedia/tree/codex/campus-transport-ingest-prototype/docs/campus-transport/prototypes/cuhk-bus-ingest-spike)                                                                                                                   | **Staging，审核后部分可 Production**           | 为指定香港服务日编译路线级发车候选                               | 实际输出的 ordered patterns=false、intermediate arrivals 为 unavailable、arrival projections 为空、realtime feed 为 null |
| [`CUHK-bus-clock/data/station-times.json`](https://github.com/CCheukKa/CUHK-bus-clock/blob/575adc5475fc115001c30d9b5d5373384791c1f6/data/station-times.json)                                                                                                                          | **Staging weak prior**                         | 站间偏移的冷启动候选；每个值保留 source commit/pair/sample count | 数量少、无 trip ID/时段/学期周特征；数据授权须先澄清                                                                     |
| [`data/bus-log.json`](https://github.com/CCheukKa/CUHK-bus-clock/blob/575adc5475fc115001c30d9b5d5373384791c1f6/data/bus-log.json) 和 [`processed-bus-log.json`](https://github.com/CCheukKa/CUHK-bus-clock/blob/575adc5475fc115001c30d9b5d5373384791c1f6/data/processed-bus-log.json) | **Staging only**                               | 在获得授权后重跑更严格的 map matching/到站事件提取               | 包含精确时间和 GPS；不应原样进入 production 查询层或对外再发布                                                           |
| [`constants/BusData.ts` 中的 `busStationTimings`](https://github.com/CCheukKa/CUHK-bus-clock/blob/575adc5475fc115001c30d9b5d5373384791c1f6/constants/BusData.ts#L997)                                                                                                                 | **不可直接用**                                 | 无                                                               | 在 5 个 `station-times.json` 空数组上填入了手动/复制值，以 `//!` 标记；来源和测量方法不足以审计                          |
| [`DEFAULT_STATION_TIME_OFFSET_SECONDS = 120.5`](https://github.com/CCheukKa/CUHK-bus-clock/blob/575adc5475fc115001c30d9b5d5373384791c1f6/utils/Bus.ts#L250-L261)                                                                                                                      | **不可用**                                     | 无                                                               | 是缺值 fallback，不是观测数据；直接使用就会把“约两分钟”伪装成站间事实                                                    |
| 用户提供的 `deep-research-report.md`                                                                                                                                                                                                                                                  | **决策语境，不是数据证据**                     | 定义要解决的产品问题                                             | 本核验已将其中线索回溯至上述 primary sources；不引用报告内的 `turn...` 标记作为证据                                      |

## `CUHK-bus-clock` 实际数据量

以主分支当前 commit [`575adc5475fc115001c30d9b5d5373384791c1f6`](https://github.com/CCheukKa/CUHK-bus-clock/commit/575adc5475fc115001c30d9b5d5373384791c1f6) 为固定核验点：

- `bus-log.json`：154 条 GPS 记录，时间范围 `2025-02-21T02:06:13Z`–`2025-04-25T07:08:56.947Z`，分布在 25 个 UTC 日期。路线标签及记录数为 1A=40、1B=14、2=27、3=19、4=5、5=9、8=19、H=20、N=1。
- 原始字段：`route`、`timeStamp`、`location.coords.{accuracy,longitude,altitude,heading,latitude,altitudeAccuracy,speed}`、`location.mocked`和 `location.timestamp`。处理后数据额外添加 `station`。
- [`scripts/processing.ts`](https://github.com/CCheukKa/CUHK-bus-clock/blob/575adc5475fc115001c30d9b5d5373384791c1f6/scripts/processing.ts) 把 GPS 分配给该 route 中距离最近的站，再将相邻记录的时间差当作站间时长。它只确认 route 相同、时差为 1–300 秒且 pair 在白名单内；超过 2 个标准差只警告，仍会收录。没有 trip boundary、车辆、到站/发车事件、dwell 或人工复核字段。
- 处理结果是 113 条站间时长，来自 22 个日期、8 个路线标签（N 只有一条 GPS 点，没有形成站间样本）。
- `station-times.json` 有 54 个 pair key：5 个空数组，22 个只有 1 条样本，23 个有 2–4 条，只有 4 个达到 5 条或以上；最大样本数为 16。
- 这些数据完全集中在 2025 年 2–4 月，没有 2024 或 2026 的行车观测，也没有任何一个秋季学期开学首月的样本。它因此无法证明或拟合“开学后第一个月最拥挤，之后逐渐下降”。

### 路线覆盖

113 条可推导站间样本的分布很不均匀：

| route label | 站间样本 | 独立日期 | 不同 pair |
| ----------- | -------: | -------: | --------: |
| 1A          |       23 |       11 |         4 |
| 1B          |       10 |        2 |         7 |
| 2           |       20 |        6 |        12 |
| 3           |       14 |        2 |        14 |
| 4           |        4 |        1 |         4 |
| 5           |        8 |        1 |         8 |
| 8           |       16 |        2 |        14 |
| H           |       18 |        2 |        18 |

这个表也说明为什么不能按 `route × time-of-day × week-of-term` 直接拟合：多数 route 只有 1–2 天的可用站间数据，而且 `station-times.json` 连 route 维度都已丢失，相同 pair 可能混合多条 route。

## 许可和来源风险

- [README](https://github.com/CCheukKa/CUHK-bus-clock/blob/575adc5475fc115001c30d9b5d5373384791c1f6/README.md) 说明这是个人项目，不获 CUHK 认可，数据是“公开可得或作者自行采集”，但没有逐文件标明哪些是作者实测、哪些来自其他公开源。
- 仓库根目录是 [GPL-3.0](https://github.com/CCheukKa/CUHK-bus-clock/blob/575adc5475fc115001c30d9b5d5373384791c1f6/LICENSE)，而 CUpedia 是 MIT。直接复制对方代码会带来明确的 copyleft 义务；数值观测和模型参数的边界不应由工程团队自行假定。
- 作者的 [Privacy Policy](https://github.com/CCheukKa/CUHK-bus-clock/blob/575adc5475fc115001c30d9b5d5373384791c1f6/PRIVACY.md) 说 app 仅在前台用 GPS 寻找附近车站，不上传也不在退出后保留用户位置。这不等于对仓库内精确 GPS 记录授予了独立的数据再发布许可。
- 上线前最稳妥的解锁方式是请作者书面确认：`station-times.json` 及其从 GPS 提取的站间时长可否用于 CUpedia 的 production 模型，并为这些数据指定明确的许可和 attribution 要求。获得答复前，只在隔离的 staging 中评估，不对用户发布由其直接导出的 ETA。

本节是数据发布风险记录，不是法律意见。

## 对 Q7 的决策建议

1. 官方 CUHK 数据只锁定 `scheduled origin departure`、route/pattern/service-day 骨架；绝不把它标成官方逐站时刻。
2. 将 `CUHK-bus-clock` 的 113 个站间时长导入隔离 staging，不合并其代码；每个样本带 commit、pair、sample index 和授权状态。
3. 不导入 `BusData.ts` 中的 `//!` 值或 120.5 秒 fallback。
4. 等待数据授权结论的同时，对每个发布 pattern 人工跟车至少一次，补齐全部连续站序和站间基准。人工数据必须保留 route/pattern、service date、官方发车时间、每站 observed-at 和观测方法。
5. 首版展示单点“预计 6:02”，但内部必须保留 `scheduledDeparture + nominalOffset + sourceKind + sourceVersion + sampleCount`。即使只有一个经审核的冷启动样本也可显示“预计”；完全无证据时不得用固定值伪造。
6. 现有公开样本不足以学习高峰、日内时段或开学后周数效应。这些只能由上线后的结构化到站反馈和新的人工观测逐步学习，不得从 2025 年春季的 113 个区段样本外推。

## 复现说明

数量核验直接读取 commit `575adc5` 的三个 JSON 文件，并按仓库的 `processing.ts` 相同条件重算相邻站间观测：相邻记录 route 相同、时差 `1..300` 秒、pair key 存在。重算得到 113 条，与 `station-times.json` 的非空值总数一致。
