# CU Bus App `arrival_schedule` 平移不变性审计

审计日期：2026-08-12。结论只针对 CU Bus App v1.18 内嵌数据库的固定副本，不把既有 research 文档当成独立证据。

## 结论

**是：库中的 5,069 行不是 5,069 次观测，而是 404 个预展开发车，逐班套用 route variant 唯一的一条累计 offset 向量。**19 个 variant 的每个站都只有 1 个 relative offset，每个 variant 也都只有 1 个完整 offset vector；全日没有第二套高峰期或离峰期模板。再扣除三个完全重复的 weekday/Saturday 模板，实际只有 **16 个不同的「站序 + offset」模板**。

因此这些数据适合充当冷启动的静态 prior，不能让贝叶斯模型把 404 班、5,069 行当作 404 班独立运行样本。未来反馈到站数据应拟合 `route pattern × segment` 的基础时间，再叠加可学习的 `time bucket`、学期阶段和 trip-level 延误；只有真实反馈积累后才有证据决定是否需要高峰/离峰多模板。

## 固定输入与复现定义

- 主输入：[内嵌 `cubus.db`](../data/third-party/cu-bus-app/raw/cubus.db)，SHA-256 `c0d045c980aee48e66e3d81a88f22eed227bae29a9f56c38ca2320705704cd2d`。其相邻 [provenance](../data/third-party/cu-bus-app/provenance.json) 将该文件定位为 `com.carsonwah.cubus` v1.18 / versionCode 18 的 `assets/cubus.db`，DB schema version 7。
- `arrival_schedule(route_id, stop_id, arrival_time)` 没有日期、车辆、trip id 或 observed 标记；`route` 提供有序 `stops_json`；`route_segment` 提供同一 variant 内任意前站到任意后站的 `expected_duration_sec`。这些是原库 schema 本身可见的事实。
- 对每个 `route_id`，按 `arrival_schedule.id` 排序，以 `json_array_length(stops_json)` 连续切块。每块首站是该班的 origin；第 `i` 站 relative offset 定义为 `(arrival_time_i - arrival_time_origin) mod 86400`。
- 检查四项：每块站序是否等于 `stops_json`；每站 offset 的 unique 数；完整 offset vector 的 unique 数；`route_segment(from_i,to_j)` 是否等于 `offset_j-offset_i`。

核心复现命令：

```bash
sqlite3 docs/campus-transport/data/third-party/cu-bus-app/raw/cubus.db \
  'select count(*) from route; select count(*) from arrival_schedule; select count(*) from route_segment;'

python3 - <<'PY'
import json, sqlite3

db = sqlite3.connect(
    "docs/campus-transport/data/third-party/cu-bus-app/raw/cubus.db"
)
db.row_factory = sqlite3.Row

def seconds(value):
    h, m, s = map(int, value.split(":"))
    return h * 3600 + m * 60 + s

for route in db.execute("select * from route order by id"):
    stops = [x["id"] for x in json.loads(route["stops_json"])]
    rows = db.execute(
        "select * from arrival_schedule where route_id=? order by id",
        (route["id"],),
    ).fetchall()
    trips = [rows[i:i + len(stops)] for i in range(0, len(rows), len(stops))]
    vectors = []
    for trip in trips:
        assert [x["stop_id"] for x in trip] == stops
        origin = seconds(trip[0]["arrival_time"])
        vectors.append(tuple(
            (seconds(x["arrival_time"]) - origin) % 86400 for x in trip
        ))
    print(route["id"], len(rows), len(stops), len(trips),
          [len({v[i] for v in vectors}) for i in range(len(stops))],
          len(set(vectors)))
PY
```

## 全部 19 个 variant 的结果

`origin/any max Δ` 左边比较 origin→各站，右边比较所有 `i<j` 的 forward pair。每个 route 的 `route_segment` 数都恰为 `n(n-1)/2`，即完整上三角。

| route_id        | `arrival` 行 | 站数 | 推断 trips | 每站 unique offsets |   unique vectors | `segment` 行 | origin/any max Δ |  异常 |
| --------------- | -----------: | ---: | ---------: | ------------------: | ---------------: | -----------: | ---------------: | ----: |
| `1A`            |          276 |    6 |         46 |                 1–1 |                1 |           15 |            0/0 s |     0 |
| `1B`            |          176 |    8 |         22 |                 1–1 |                1 |           28 |            0/0 s |     0 |
| `2`             |          198 |    9 |         22 |                 1–1 |                1 |           36 |            0/0 s |     0 |
| `2_sir_run_run` |          230 |   10 |         23 |                 1–1 |                1 |           45 |            0/0 s |     0 |
| `3`             |          450 |   15 |         30 |                 1–1 |                1 |          105 |            0/0 s |     0 |
| `4`             |          525 |   15 |         35 |                 1–1 |                1 |          105 |            0/0 s |     0 |
| `5`             |          243 |    9 |         27 |                 1–1 |                1 |           36 |            0/0 s |     0 |
| `5_sat`         |          135 |    9 |         15 |                 1–1 |                1 |           36 |            0/0 s |     0 |
| `6A`            |           90 |   10 |          9 |                 1–1 |                1 |           45 |            0/0 s |     0 |
| `6A_sat`        |           50 |   10 |          5 |                 1–1 |                1 |           45 |            0/0 s |     0 |
| `6B`            |           36 |    6 |          6 |                 1–1 |                1 |           15 |            0/0 s |     0 |
| `7`             |          160 |    8 |         20 |                 1–1 |                1 |           28 |            0/0 s |     0 |
| `7_sat`         |           88 |    8 |         11 |                 1–1 |                1 |           28 |            0/0 s |     0 |
| `8`             |          544 |   16 |         34 |                 1–1 |                1 |          120 |            0/0 s |     0 |
| `8_non_teach`   |          578 |   17 |         34 |                 1–1 |                1 |          136 |            0/0 s |     0 |
| `H`             |          589 |   19 |         31 |                 1–1 |                1 |          171 |            0/0 s |     0 |
| `H_area_39`     |          330 |   22 |         15 |                 1–1 |                1 |          231 |            0/0 s |     0 |
| `N`             |          266 |   19 |         14 |                 1–1 |                1 |          171 |            0/0 s |     0 |
| `N_postgrad`    |          105 |   21 |          5 |                 1–1 |                1 |          210 |            0/0 s |     0 |
| **合计**        |    **5,069** |    — |    **404** |              全部 1 | variant 内全部 1 |    **1,606** |           全部 0 | **0** |

这里的 404 是 `Σ(arrival rows / route stops)`，不是由数据库保存的 trip identity。`5,069 = Σ(trips_route × stops_route)` 精确成立，所有余数为 0。

## 模板重复、共享前缀与条件 variant

19 个 variant 中：

- `5 == 5_sat`：9/9 站、全部 offset 完全相同；只有适用日期和展开的班次数不同。
- `6A == 6A_sat`：10/10 完全相同。
- `7 == 7_sat`：8/8 完全相同。
- `8` 与 `8_non_teach`：前 15 个站及 offset 完全相同。非教学日 variant 在原 15 站之后增加 `piazza_terminal`（1,349 s）与 `chung_chi_teaching_blocks`（1,419 s）；教学日第 16 站是 `uni_station_terminal`（1,324 s）。
- `2_sir_run_run` 在 `2` 的第二站后插入 `sir_run_run`；其后 7 个共享站全部统一晚 10 秒（`+10 s`），不是另一套时段模板。
- `H_area_39` 与 `H`、`N_postgrad` 与 `N` 是不同条件路线：都在首站后插入 postgrad 等条件站，后续共享站呈分段常数平移，而不是同一路径的高峰/离峰变化。H common-stop delta 的主组是 `+129 s` 与 `+217 s`；N 是 17 个共享站 `+129 s`，另有终点前条件段。

所以「独立模板」有两种计数，必须明确语义：

1. 按完整 `route_id`：19 个 variant，各自 1 个模板。
2. 按完全相同的 `(ordered stop ids, offsets)` 去重：**16 个模板**，因为三组 weekday/Saturday 重复。

`8`/`8_non_teach` 等共享前缀可以做分层参数共享，但它们不是完全相同模板；不能把两个 pattern 的尾段混成同一条 trip。

## `route_segment` 不是第二票

1,606 条 `route_segment` 与 5,069 条 `arrival_schedule` **逐项代数相同**：每个 variant 的全部 forward stop pair 都存在，且每个 `expected_duration_sec == offset(to)-offset(from)`，最大差 0 秒、缺 pair 0、额外 forward pair 0。

这证明数据库内部生成一致，但也证明 `route_segment` 和 `arrival_schedule` 不是两组独立观测。它们是同一套 16 个去重模板的两种表示：一个是累计逐站时钟展开，另一个是所有累计差值的上三角物化。因此：

- 不能把 1,606 个 segment row 当成 1,606 个训练样本；
- 不能同时用二者并把一致性称作交叉验证；
- 最小不可重复信息可保存为每个 pattern 的 `n-1` 个相邻 segment baseline，其他累计 offset 和跨站 segment 都可确定性重建。

## 合理性：内部一致不等于独立真实性

### 内部一致性很强

固定库没有发现站序错位、缺块、跨午夜负 offset、同一 variant 多模板或 `route_segment` 差异。作为「某个 app 作者选择的一条静态行程轮廓」，它在工程上是完整且自洽的。

### 但不能由该库证明真实车辆合理

它没有日期、trip identity、车辆、GPS、实际到站或误差字段；全天每班完全平移不变，反而排除了拥堵、上落客、学期阶段与随机延误。数据库本身只能证明“作者预展开了同一模板”，不能证明模板在任何时段接近真实到站。

作为敏感度检查，可对 repo 中另一份固定上游源码快照 [Anson CUBus `Route.json`](../data/third-party/cubus-anson/Route.json)（SHA-256 `3cb4089358f41a0e1ff74a9f5e22189890f41a42885cb070bbffd53ebcb41002`）累加其 `stations.time`。1A、1B、5、6A、6B、7、8 的所有累计站点均在 App offset 的 5 秒内；但 2、3、H 等出现大段常数或明显异常差。这个结果只说明部分模板高度相似，**不能视为独立真实性验证**：两者可能共享路线规划/生成方法，且 Anson 源码本身也不是实到观测；例如其 H 在 `UC` 后含 937.8 秒 segment，明显会污染累计比较。

repo 的固定 Bus Clock 合并快照记录 154 个 GPS row、113 个 segment sample / 49 个非空 pair，但 `segmentTravelTimePriors.routeScope` 为 `null`，且站点标签由 GPS 近邻推断。它可作为弱的外部敏感度参考，不能给 16 个模板逐 route、逐 trip 背书，也不能建立高峰/离峰效应。

## 对未来贝叶斯模型的含义

### 1. 当前有效独立样本量

- `arrival_schedule`：不是 5,069；也不是 404。用于运行时间参数时，最多是 **16 条去重的社区模板 prior**。
- 对某一个 `route × pattern`：当前只有 **1 条静态累计轮廓**，没有任何由该库提供的时段重复观测。
- 若拆成相邻 segment baseline，信息量是每个去重 pattern 的相邻边，而不是全部跨站 pair；共享前缀应采用同一或层级收缩的参数，避免重复计权。

### 2. 建议拟合层次

一条用户反馈 `(route, stop, observed_at)` 需要先候选匹配到当天某个 scheduled origin / pattern。预测可写成：

```text
observed_arrival(trip, stop)
= scheduled_origin(trip)
+ baseline_cumulative(route_pattern, stop)
+ trip_shift(trip)
+ cumulative_segment_delay(route_pattern, time_bucket, term_phase, stop)
+ noise
```

- `baseline_segment[route_pattern, segment]`：当前 16 模板只作为宽方差 prior mean；这是最适合拟合的基础层。
- `trip_shift[trip]`：解释整班车整体早发/晚发。若同一班收到多个站点反馈，不能把这些反馈当独立全程样本；它们共享同一个 trip shift。
- `segment_delay[route_pattern, segment, time bucket, term phase]`：解释“过了某段后开始累积”的拥堵/上落客延误。数据少时向 route/pattern 总体收缩，不能预先硬编码每班各自模板。
- `time bucket` 和“开学初期”效应只有真实反馈覆盖多个时段、日期后才可辨识；CU Bus App 的全天平移不能提供这两个效应的证据。

### 3. 是否只 fit 一班车而非全天所有车次

对这份冷启动数据，**是**：每个 `route × pattern` 只应导入一次 offset prior，全天 departure 只是把它平移到不同 origin time。对真实反馈则不是“永远只 fit 一班”：模型应共享 segment baseline，同时保留 trip-level shift，并在数据足够时学习 time-bucket/term-phase 修正。这样既不把静态展开伪装成大样本，又允许未来发现高峰期并非平移不变。

## 数据边界

- CU Bus App XAPK/DB 无开放数据许可声明；这里报告聚合审计结果，不新增或重打包原始数据。
- 该审计没有官方 AVL 或人工标注实到真值，无法计算 MAE、bias 或覆盖率。
- `arrival_schedule` 的 404 个 origin 时刻是否与当前 CUHK 官方班次一致，是另一项 schedule freshness 问题，不影响本报告对平移不变性的结论。
