# Bus Clock 第三方“校准数据”回溯审计

状态：2026-08-11 完成。本文回答“之前是不是已经抓过别人校准的部分数据，以及这些数据能否直接用作逐站 offset”。固定审计版本为 [`575adc5475fc115001c30d9b5d5373384791c1f6`](https://github.com/CCheukKa/CUHK-bus-clock/commit/575adc5475fc115001c30d9b5d5373384791c1f6)。截至本次审计，GitHub `main` 仍指向这个 commit，公开数据量没有增加。

## 结论

**是，之前确实抓过，而且当前 mockup 的预计时间已经在使用它。**但“别人校准的数据”这个叫法容易高估其质量：它不是校方 AVL、人工确认的逐站实到，也不是一份按班次整理好的时刻表；它是个人开源项目 [CUHK Bus Clock](https://github.com/CCheukKa/CUHK-bus-clock) 收集的 154 个 GPS 点，经“路线内最近站 + 相邻记录时间差”自动生成的 113 个站对时长样本。

当前仓库已经完成三层处理：

1. [`merged.snapshot.json`](../data/cuhk-public-data/merged.snapshot.json) 保存固定 commit、四个源文件的 URL、SHA-256、数据量和 pair 的 p10/p50/p90；出于再发布边界，没有复制第三方原始 GPS 正文。
2. [`cuhk-bus-cold-start.ts`](../../../scripts/cuhk-bus-cold-start.ts) 将官方复核后的站序与 Bus Clock 的站对 p50 连接并累加，生成 1A、1B、2、4 的 staging offset。
3. [`routes-data.ts`](../../../src/lib/campus-transport/routes-data.ts) 把这些 `p50Seconds` 交给当前 UI。因此页面上的“预计”并不是每站拍脑袋加两分钟，而是这批公开弱先验的累计中位数。

这仍不等于“已经校准准确”。最明显的例子是 Route 4：生成文件虽然有 15/15 个 stop occurrence 可显示，但 14 个相邻段中只有前 4 段含 Route 4 自身观测，后 10 段来自路线 2、3、8、H 在相同站对上的观测。它能给出冷启动量级，不能声称 Route 4 全线实测完成。

## 1. 来源究竟是什么，是否公开

上游是公开可访问的个人 GitHub 仓库，不是 CUHK 官方服务，也不是持续更新的实时 API。仓库没有文档化的 backend/feed；公开入口实际就是 GitHub 的静态 JSON、源码和 GitHub API。上游 [`README`](https://github.com/CCheukKa/CUHK-bus-clock/blob/575adc5475fc115001c30d9b5d5373384791c1f6/README.md) 明确称其为个人项目，并说明资料来自公开来源或作者自行收集；它没有逐条说明具体 GPS 由谁、以什么到站判定方法采集。

本仓库的 merge 脚本固定抓取以下内容：

| 数据层                    | 上游文件                                                                                                                                              | 固定快照 SHA-256                                                   | 实际含义                                        |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------- |
| 原始 GPS                  | [`data/bus-log.json`](https://github.com/CCheukKa/CUHK-bus-clock/blob/575adc5475fc115001c30d9b5d5373384791c1f6/data/bus-log.json)                     | `7f4e2e36410b33752379b2b1c3e4b172e59b62a8934e814187ae4ecd8e519f4f` | 154 个带路线标签、UTC 时间和设备位置的点        |
| 自动站点标签              | [`data/processed-bus-log.json`](https://github.com/CCheukKa/CUHK-bus-clock/blob/575adc5475fc115001c30d9b5d5373384791c1f6/data/processed-bus-log.json) | `b554d3c7f9cdea922701cb21a5c0c56113208bad0c8b89d221a020021577ace2` | 在原始点上增加最近站 `station`                  |
| 汇总站间耗时              | [`data/station-times.json`](https://github.com/CCheukKa/CUHK-bus-clock/blob/575adc5475fc115001c30d9b5d5373384791c1f6/data/station-times.json)         | `cd377a27107543c97f74e2ea1efe98298dcb9f2d624558b868daea1a5bea2dc9` | `from>>to -> seconds[]`，路线、日期和时段已丢失 |
| 路线、站点及运行时 timing | [`constants/BusData.ts`](https://github.com/CCheukKa/CUHK-bus-clock/blob/575adc5475fc115001c30d9b5d5373384791c1f6/constants/BusData.ts)               | `a681a50220639f5a61c6e05a367d33621a6e1f04b7e3383a9075f59cf1364900` | 路线/站点常量，并混有非 GPS 的手工 timing       |

这些哈希与 [`cuhk-bus-public-data-merge.ts`](../../../scripts/cuhk-bus-public-data-merge.ts) 和 merged snapshot 中记录的一致。固定版本当前也仍是上游 `main`；三个 JSON 最后一次数据更新是 [2025-04-25 的 `aedb150`](https://github.com/CCheukKa/CUHK-bus-clock/commit/aedb15004ce6713e79921a6108f2e315cf8536c4)，所以不存在“我们只抓了旧数据、上游已经有大量新样本”的情况。这是一份静止的历史校准快照，不是持续 feed。

merged snapshot 的 provenance 也有一个待补项：它已保存三个 JSON 与 `BusData.ts` 的内容哈希，但没有把 `processing.ts` 本身登记成独立 `sourceSnapshot`。派生结果实际上同时依赖处理脚本版本和旧 `processed-bus-log.json` 的历史状态；生产级可重放记录应补上脚本 URL/hash 和处理版本。

## 2. 字段与样本语义

原始 GPS 一条记录的核心字段是：

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
      "speed": 0.5965909361839294,
      "heading": 203.39356994628906
    }
  }
}
```

处理后的文件只多一个 `station`。这个字段不是人工按下“到站”产生，也不是车辆开门事件；[`scripts/processing.ts`](https://github.com/CCheukKa/CUHK-bus-clock/blob/575adc5475fc115001c30d9b5d5373384791c1f6/scripts/processing.ts) 会在该路线的站点中选择 Haversine 距离最近者。脚本只分类旧 processed log 中还没有的 timestamp，路线/坐标改变后不会重算历史标签。随后它对全局时间排序后的相邻记录做差，满足以下条件就收入 `station-times.json`：

- 两条记录的 `route` 字符串相同；
- 时间差为 `1..300` 秒；
- `from>>to` 在全局 timing key 表中存在；
- 超过既有均值 2 个标准差只警告，不剔除。

它没有 `vehicleId`、`tripId`、路线 pattern、班次起点发车时间、到站/离站事件、停站时长或人工审核结果。因此一个秒数的严格语义是：**两个被自动标为不同站点的相邻 GPS 点的 timestamp 差**，不是经确认的 arrival-to-arrival 真值。

## 3. 覆盖范围

### 总量与时间

- 原始/处理后均为 154 行，时间范围为 `2025-02-21T02:06:13Z` 至 `2025-04-25T07:08:56.947Z`，覆盖 25 个 UTC 日期。
- 54 个站对 key 中 49 个非空，共 113 个秒数；22 个非空 pair 只有 1 个样本，23 个只有 2–4 个，只有 4 个达到至少 5 个样本。
- 113 个可重建样本只落在香港时间 08、10–18 时；09 时没有样本。它们集中于 2025 年春季，完全没有秋季开学首月，也不能从中识别“开学一个月后逐渐变松”的效应。
- 21/49 个非空 pair 混合至少两条路线。另有 5 个被脚本接受的样本并不是其 route 常量中的真实相邻站，只是该 pair 在另一条路线的全局白名单中存在。

### 可重建的路线维度

`station-times.json` 本身已经丢掉 route，但利用固定版本的 `processed-bus-log.json` 和相同处理规则，可以重建以下来源分布：

| route label | 站间样本 | 香港服务日期 | 不同 pair | 样本所在香港时间 |
| ----------- | -------: | -----------: | --------: | ---------------- |
| 1A          |       23 |           11 |         4 | 10、12–14、16–18 |
| 1B          |       10 |            2 |         7 | 08、12、18       |
| 2           |       20 |            6 |        12 | 10、12–15        |
| 3           |       14 |            2 |        14 | 11、17           |
| 4           |        4 |            1 |         4 | 13               |
| 5           |        8 |            1 |         8 | 13               |
| 8           |       16 |            2 |        14 | 13、14、18       |
| H           |       18 |            2 |        18 | 14、16           |

原始 GPS 另有 N=1 个点，但无法形成站间时长。没有 6A、6B、7、Up、Down 的实测站间样本。

### 当前已接入路线的真实“本路线覆盖”

| 当前 pattern    | 相邻段数 | 有任意共享 pair prior | 含本 route label 的段数 | 判断                                              |
| --------------- | -------: | --------------------: | ----------------------: | ------------------------------------------------- |
| 1A default      |        5 |                     5 |                       4 | 可冷启动；其中一段完全借用其他路线                |
| 1B via PGH1     |        7 |                     7 |                       7 | 每段至少有 1B 样本，但每段通常只有 1–2 条         |
| 2 default       |        8 |                     8 |                       8 | 每段至少有 Route 2 样本，仍大量混入其他路线       |
| 2 via Shaw Hall |        9 |                     9 |                       9 | 同上                                              |
| 4 default       |       14 |                    14 |                       4 | 只有前四段是 Route 4 自身观测，后十段是跨路线借用 |

例如 `University Station → University Sports Centre` 有 11 个值，中位数 123 秒，其中 10 个来自 1A、1 个来自 H；`University Sports Centre → Sir Run Run Shaw Hall` 有 16 个值，中位数 142.5 秒，却混合 1A、1B、2、5、H 五条路线。当前生成器选择后者时只看 canonical stop pair，无法让中位数随 route 改变。

## 4. 有没有 trip、route、time-of-day 维度

| 维度         | 原始/processed GPS                        | `station-times.json` | 当前 merged prior                                | 能否用于模型                                             |
| ------------ | ----------------------------------------- | -------------------- | ------------------------------------------------ | -------------------------------------------------------- |
| route        | 有一个粗 route label                      | 无                   | 明确写成 `routeScope: null` / `mixed_or_unknown` | 可从 processed 重建，但需重新产出 observation provenance |
| 日期/时间    | 有 UTC timestamp，可转 HKT                | 无                   | 无                                               | 可以重建日内小时和服务日，现有汇总不可直接拟合           |
| trip/vehicle | 无                                        | 无                   | 无                                               | 无法可靠对应哪一班车或哪辆车                             |
| pattern      | 无；如 Route 2 没有 `2`/`2+` 实际观测身份 | 无                   | 无                                               | 不能学习条件停站变体差异                                 |
| 学期周/高峰  | 未编码                                    | 无                   | 无                                               | 可事后连接校历，但样本量和季节覆盖不足                   |
| GPS 质量     | 有设备报告 accuracy/heading/speed         | 无                   | 只留 accuracy 分位数                             | 可做过滤，但不是独立真值                                 |

因此，“数据里其实有时间，为什么不能拟合高峰”需要分两层回答：原始点确实有 timestamp；但是公开汇总表和当前 merged prior 都没有时段。我们可以重建这 113 条的 route/date/hour，但不能恢复不存在的 trip identity，而且大部分路线只有 1–2 个服务日，直接按 `route × hour × weekOfTerm` 切分会过拟合。

## 5. 能否直接作为逐站 offset

### 工程上

可以作为 **staging weak prior**，当前 mockup 就是这样使用的：对官方复核后的每个相邻 stop pair 取公开样本 p50，再逐段累加成 `cumulativeOffsetSeconds`。这比统一写死每站 120.5 秒更有依据。

不能把它作为“准确的固定逐站时刻”直接发布，原因包括：

1. 最近站标签并非到站真值；现有准确性审计发现 154 条中 20 条不能由同 commit 当前的站点常量重新产生同一标签。
2. 没有 trip boundary，可能把不同车辆或相邻班次连接起来。
3. route/pattern/time-of-day 在最终数组中丢失，Route 4 的完整覆盖尤其是跨路线借来的。
4. 49 个非空 pair 中 45 个少于 5 条样本；单样本的“中位数”只是那一个值。
5. 累加各段 p10/p90 不是整段行程的联合不确定区间。

### 不应混入的两个数值层

[`BusData.ts`](https://github.com/CCheukKa/CUHK-bus-clock/blob/575adc5475fc115001c30d9b5d5373384791c1f6/constants/BusData.ts#L997-L1053) 的运行时 `busStationTimings` 与生成的 `station-times.json` 并不完全相同。[上游 `ed84d1` commit](https://github.com/CCheukKa/CUHK-bus-clock/commit/ed84d11483acc42ea6a67d04cdc5997bd0d99915) 的提交说明就是为缺失数据增加 timing estimates。五个在生成文件中为空的 pair 被运行时代码填入数值，其中四行以 `//!` 标注，另一个也是复制已有 178 秒值：

- Campus Circuit East (Downward) → University Station Piazza：`94, 84`
- Chan Chun Ha Hostel → Wu Yee Sun College (Downward)：`60`
- Shaw College (Upward) → Area 39 (Upward)：`178`
- S.H. Ho College → University Station Piazza：`128, 93`
- University Station Piazza → Chung Chi Teaching Building (Terminus)：`40`

这些值没有原始 GPS observation provenance，当前 CUpedia cold-start 生成器正确地没有导入它们。上游 [`utils/Bus.ts`](https://github.com/CCheukKa/CUHK-bus-clock/blob/575adc5475fc115001c30d9b5d5373384791c1f6/utils/Bus.ts#L250-L261) 对仍缺失的 pair 使用 `120.5` 秒 fallback；这只是程序默认值，也不应当作实测数据。

## 6. 授权与署名

仓库是公开的，根目录声明 [GPL-3.0](https://github.com/CCheukKa/CUHK-bus-clock/blob/575adc5475fc115001c30d9b5d5373384791c1f6/LICENSE)。但 `data/*.json` 没有单独的数据许可证、数据提供者声明或署名格式；README 中“公开可得或作者自行收集”的描述也没有解决逐文件权利来源。根 LICENSE 直到 [2025-03-29 的 `6b08e49`](https://github.com/CCheukKa/CUHK-bus-clock/commit/6b08e49ee68b7790f23f6af1f16e1f93ea21ce7e) 才加入，而部分 GPS 数据更早已经提交，这进一步说明不应擅自推断数据文件的独立授权意图。

因此要区分：

- **可公开读取和审计：是。**固定 URL、commit 和 hash 都可以复核。
- **可不经确认直接复制进 MIT 产品并再发布：不能由现有材料确认。**特别是复制 GPL 源码会带来明确的 copyleft 问题；数值事实、数据文件及派生模型参数的许可边界也不应由工程团队自行假定。
- **最稳妥的生产解锁方式：**请作者书面确认 `station-times.json` 和从 GPS 重建的聚合统计可否用于 CUpedia 的 production ETA，以及所需 attribution；未经确认继续维持 `staging_only`。这不是法律意见。

## 7. 建议的安全使用方式

1. 保留当前 `预计` 文案，不向用户称为官方或实时到站。
2. 继续固定 commit、源 URL、文件 hash 和生成器版本；不要抓 `main` 后静默覆盖。
3. 不复制或对外暴露原始精确 GPS；内部若获授权重建样本，应保存 `route + pair + HKT timestamp + source row ids + processing version`，而不是只留下 pair 数组。
4. 重跑 station matching：以官方 pattern 为边界，增加距离/accuracy gate、方向与停留检测，并剔除对该 route 非相邻的 pair。
5. 模型使用分层先验：优先本 route/pattern 的样本；样本不足时才收缩到共享 physical segment，并显式扩大不确定性。Route 4 后十段不得伪装成本路线完整实测。
6. 不导入 `//!` 手工 timing，也不用 120.5 秒 fallback 填满缺口。
7. 将这批数据只作为反馈模型的初始 prior。上线后的匿名到站反馈经过质量控制和统计更新后，应逐步压低其权重，而不是直接覆盖或永久锁死 timetable。

## 可复核入口

- 上游处理逻辑：[`scripts/processing.ts`](https://github.com/CCheukKa/CUHK-bus-clock/blob/575adc5475fc115001c30d9b5d5373384791c1f6/scripts/processing.ts)
- 上游静态汇总：[`data/station-times.json`](https://github.com/CCheukKa/CUHK-bus-clock/blob/575adc5475fc115001c30d9b5d5373384791c1f6/data/station-times.json)
- 本仓库来源目录与保守合并边界：[`data/cuhk-public-data/README.md`](../data/cuhk-public-data/README.md)
- 既有独立准确性审计：[`bus-clock-accuracy-audit.md`](./bus-clock-accuracy-audit.md)
- 冷启动生成边界：[`data/cold-start/README.md`](../data/cold-start/README.md)
