# CUHK 校巴 offset 跨来源一致性审计

审计日期：2026-08-12。本文直接计算固定来源，不把既有 research 文档作为证据：

- CU Bus App v1.18 [`cubus.db`](../data/third-party/cu-bus-app/raw/cubus.db)，SHA-256 `c0d045c980aee48e66e3d81a88f22eed227bae29a9f56c38ca2320705704cd2d`；
- Anson CUBus [`Route.json`](../data/third-party/cubus-anson/Route.json)，SHA-256 `3cb4089358f41a0e1ff74a9f5e22189890f41a42885cb070bbffd53ebcb41002`；
- CUHK Bus Clock commit `575adc5475fc115001c30d9b5d5373384791c1f6` 的 `bus-log.json`、`processed-bus-log.json`、`station-times.json` 与 `BusData.ts`。下载后 SHA-256 分别为 `7f4e2e…519f4f`、`b554d3…1b5c0c`、`cd377a…2dc9`、`a681a5…64900`，与 merge provenance 记录一致。

## 结论

1. **App 与 Anson 几乎肯定高度相关，而不是两票独立证据。**16 个可映射 variant 的 194 条相邻边中，182 条（93.8%）误差不超过 2 秒；median absolute difference 只有 0.69 秒。5 条极大异常足以把 MAE 拉到 10.67 秒，形态更像少数录入/路径错误，而不是两套独立观测恰好一致。
2. **Bus Clock 才是较接近外部观测的弱验证，但很稀疏。**从 route-labelled processed log 重建114个原始相邻 interval，其中107个 interval 可严格对齐 App 相邻边，并按 route-specific pair 聚合为75个 median；余下7个 interval（也是7个各出现一次的 pair）不可比。这75个 pair median 与 App 的 median absolute difference 为15秒、MAE 18.1秒，31/75 ≤10秒，13/75 ≥30秒。它说明 App 模板的量级常合理，却也显示路线/路段偏差不可忽略。
3. 官网只给起点发车规则，没有逐站 offset；Flippy 固定数据库提供路线/公告材料但没有可比的逐站耗时字段。因此二者不能成为 offset 的独立验证票。

## App 与 Anson

Anson `stations.time[i]` 是第 `i` 站到下一站的秒数；App 使用同 route variant 的 `route_segment` 相邻边。比较前确认两边站数和位置顺序一致；`#` 映射为 App 条件 variant，weekday/Saturday 共用 Anson 一条路线。

| Anson route | App variant     |  可比边 |       MAE | median abs |     ≤2s |    ≤10s |  ≥30s |        max |
| ----------- | --------------- | ------: | --------: | ---------: | ------: | ------: | ----: | ---------: |
| `1A`        | `1A`            |       5 |      0.69 |       1.04 |       5 |       5 |     0 |       1.24 |
| `1B`        | `1B`            |       7 |      0.66 |       0.73 |       7 |       7 |     0 |       1.39 |
| `2`         | `2`             |       8 |     19.19 |       0.50 |       7 |       7 |     1 |     148.81 |
| `2#`        | `2_sir_run_run` |       9 |     17.08 |       0.44 |       8 |       8 |     1 |     148.81 |
| `3`         | `3`             |      14 |     45.11 |       0.58 |      13 |      13 |     1 |     623.19 |
| `4`         | `4`             |      14 |      0.85 |       0.94 |      14 |      14 |     0 |       1.44 |
| `5`         | `5`             |       8 |      0.61 |       0.56 |       8 |       8 |     0 |       1.33 |
| `6A`        | `6A`            |       9 |      0.54 |       0.54 |       9 |       9 |     0 |       1.04 |
| `6B`        | `6B`            |       5 |      0.47 |       0.38 |       5 |       5 |     0 |       0.88 |
| `7`         | `7`             |       7 |      0.76 |       0.71 |       7 |       7 |     0 |       1.32 |
| `8`         | `8`             |      15 |      0.70 |       0.65 |      15 |      15 |     0 |       1.47 |
| `8#`        | `8_non_teach`   |      16 |      3.15 |       0.89 |      14 |      14 |     0 |      25.02 |
| `H`         | `H`             |      18 |     47.06 |       0.81 |      17 |      17 |     1 |     832.81 |
| `H#`        | `H_area_39`     |      21 |      2.62 |       0.93 |      18 |      18 |     0 |      15.92 |
| `N`         | `N`             |      18 |      1.31 |       0.49 |      17 |      17 |     0 |      14.18 |
| `N#`        | `N_postgrad`    |      20 |      5.37 |       0.67 |      18 |      18 |     1 |      81.97 |
| **合计**    | —               | **194** | **10.67** |   **0.69** | **182** | **182** | **5** | **832.81** |

5 条 ≥30 秒异常是：`2`/`2#` 的 FKHB→UC 均 `+148.81s`、`3` 的 FKHB→RESI34 `+623.19s`、`H` 的 UC→UADM `+832.81s`、`N#` 的 MTR→JCPH `-81.97s`。此外 `8#` 的 CCEE→MTRP 与 MTRP→CCTEA 分别 `-25.02s/-14.91s`。Anson H 的 937.81 秒 UC segment 尤其明显是异常值。

没有因长度导致的整条不可比路线；但 Anson 站码会合并方向或同地点身份（如 `UC`、`RESI34`、`SHAWC`、`JCPH`），审计以 route 中的位置顺序消歧。这种近乎逐边到小数秒一致的结果不应作为独立真实性佐证。

## App 与 route-specific Bus Clock

### 重建方法与边界

将 `processed-bus-log.json` 全局按 timestamp 排序，对相邻记录保留：route label 相同、站名改变、时间差 `1..300s`。这得到114个候选值；比发布的 `station-times.json` 113值多1，是因为发布生成逻辑还要求 pair 存在于全局 timing key 集合。

随后只比较“Bus Clock from/to 经方向化站名映射后，确实是 App 同 route/pattern 的相邻边”的 pair。条件 route 允许在该 route 的两个 App pattern 中寻找。107个可比原始 interval 聚合成75个 route-specific pair median；不能对齐的7个 interval（7个各出现一次的 pair）保持不可比，不做最近站硬配。

| route label | raw n / pairs |                          可比 n / pairs |                  不可比 pairs | pair MAE | median abs |   ≤10s |   ≥30s |
| ----------- | ------------: | --------------------------------------: | ----------------------------: | -------: | ---------: | -----: | -----: |
| `1A`        |        23 / 4 |                                  23 / 4 |                             0 |     18.9 |       15.8 |      0 |      1 |
| `1B`        |        10 / 7 |                                  10 / 7 |                             0 |     14.1 |        6.5 |      5 |      2 |
| `2`         |       20 / 12 |                                 18 / 10 |                             2 |     17.8 |       14.8 |      4 |      1 |
| `3`         |       15 / 15 |                                 14 / 14 |                             1 |     16.9 |       16.0 |      6 |      1 |
| `4`         |         4 / 4 |                                   2 / 2 |                             2 |     15.0 |       15.0 |      1 |      0 |
| `5`         |         8 / 8 |                                   8 / 8 |                             0 |     17.2 |       16.0 |      1 |      0 |
| `8`         |       16 / 14 |                                 16 / 14 |                             0 |     28.1 |       21.5 |      4 |      6 |
| `H`         |       18 / 18 |                                 16 / 16 |                             2 |     13.2 |        7.5 |     10 |      2 |
| **合计**    |       **114** | **107 raw intervals / 75 pair medians** | **7 raw intervals / 7 pairs** | **18.1** |   **15.0** | **31** | **13** |

表中 MAE/median 与阈值按每个 route-specific pair 的 Bus Clock median 比较 App 秒数；不是按所有 raw point 加权。部分 pair 有多个 raw sample，例如1A Station→Sports `n=10, median=123.5s` 对 App `111s`，Sports→SRR `n=10, median=141.5s` 对 `110s`；8 Circuit North→Circuit East `n=2, median=166s` 对 `86s`。绝大多数其它 pair 只有1个样本，所以不能估稳定分布。

典型差异：

- 较接近：2 Piazza→Sports `161 vs 164s`；H Station→Sports `91 vs 99s`；1B Admin→SHHO `140 vs 145s`。
- 显著偏离：2 Admin→SHHO `95 vs 152s`；8 Area39 Down→Circuit North `138 vs 75s`；8 Circuit North→Circuit East `166 vs 86s`；8 CWC→UC Staff Residence `140 vs 80s`。
- 不可比主要来自 Bus Clock pair 不是 App 该 pattern 的相邻站，例如2 Sports→Science、3 SHHO→Sports、4 YIA→Circuit East、H New Asia Circle→UC。它可能表示 GPS 标签/路线演化/站序分支，不应强行写进同段误差。

### `station-times.json` 丢失 route scope

发布的 `station-times.json` key 只有 `"from>>to"`，数组值没有 route、日期、timestamp 或 trip identity。相同站段若来自不同路线会混合；因此不能从该文件直接声称“某条路线有 n 个样本”。本报告的 route-specific n 是从带 route label 的 `processed-bus-log.json` 相邻记录重建的，且仍不等同于真实到站事件。

## 哪些能算验证

- **App ↔ Anson：相关社区先验。**182/194 边在2秒内且保留小数级近似，强烈提示共同来源或同一距离/路线生成管线。它能发现少数异常录入，不能显著提高“真实车程正确”的置信度。
- **App ↔ Bus Clock：弱外部验证。**Bus Clock 来自 GPS/time 序列，生成路径不同，因而是更有价值的一票；但样本稀疏、最近站标签和相邻记录不等同开门到站，且许多 pair `n=1`。适合宽方差 prior 检查，不适合作硬校准真值。
- **CUHK 官网：只验证站序、服务条件和起点发车。**公开页面未给中途站 offset，不能验证逐站秒数。
- **Flippy：无可比 offset。**固定 SQL/DB 材料没有逐站运行秒数，不纳入数值一致性票。

## 对模型的建议

1. App/Anson 合并时只保留一票；App 可作 `route_pattern × adjacent_segment` prior mean，Anson 只用于异常审查。
2. Bus Clock route-specific pair median 可作低权重 sensitivity check；不要使用已丢 route scope 的 `station-times` 给多条路线重复加权。
3. 用户反馈到站才是后续更新的主要数据。模型应分别学习 trip-level 整体平移和 segment-level 累计延误；不要因 App 与 Anson 高度一致就收窄 prior 方差。
4. 当前数据无法识别高峰/离峰、开学初期或 weekday/Saturday 的真实差异；这些效应必须等跨日期、跨时段反馈后再启用。

## 复现命令

```bash
shasum -a 256 \
  docs/campus-transport/data/third-party/cu-bus-app/raw/cubus.db \
  docs/campus-transport/data/third-party/cubus-anson/Route.json

sqlite3 docs/campus-transport/data/third-party/cu-bus-app/raw/cubus.db \
  'select route_id, count(*) from route_segment group by route_id order by route_id;'

jq -r 'group_by(.route)[] | [.[0].route,length,(map(.station)|unique|length)]|@tsv' \
  /tmp/cuhk-bus-clock-575adc5/processed-bus-log.json
```

具体统计由 Python 标准库读取上述 JSON/SQLite：App↔Anson 按有序相邻边比较；Bus Clock 按 timestamp 重建 route-specific 相邻记录，按 pair 取 median 后比较 App。审计没有写回任何生产数据。
