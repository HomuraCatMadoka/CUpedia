# CUHK Bus Clock 数据准确性审计

状态：为 Wayfinder 决策票「确定今日服务的数据真值与实时降级模型」回答 Q15。审计日期：2026-08-09。固定上游版本：[`575adc5475fc115001c30d9b5d5373384791c1f6`](https://github.com/CCheukKa/CUHK-bus-clock/commit/575adc5475fc115001c30d9b5d5373384791c1f6)。

## 结论

**现有材料不能证明 `CUHK-bus-clock` 的逐站时间准确。**它能证明的是：`station-times.json` 可以由仓库已经提交的 `processed-bus-log.json` 按当前脚本规则精确重现。但没有官方 AVL/逐站实到记录、人工标注的真实到站事件或 trip identity，因此无法计算相对真值的 MAE、偏差方向或「误差在几秒内」的比例。

更严重的是，产物并不能由原始 GPS 加固定版本代码稳定重建：

- 用已提交的 processed station labels 重跑，113 个时长样本与 [`station-times.json`](https://github.com/CCheukKa/CUHK-bus-clock/blob/575adc5475fc115001c30d9b5d5373384791c1f6/data/station-times.json) **逐值一致**。
- 用同一 commit 当前的路线和坐标从 [`bus-log.json`](https://github.com/CCheukKa/CUHK-bus-clock/blob/575adc5475fc115001c30d9b5d5373384791c1f6/data/bus-log.json) 重新分配最近站，154 条中有 20 条 station label 会改变；fresh rebuild 只保留 85 个时长，54 个 pair 中有 25 个数组与发布文件不同。
- 原因之一是 [`processing.ts`](https://github.com/CCheukKa/CUHK-bus-clock/blob/575adc5475fc115001c30d9b5d5373384791c1f6/scripts/processing.ts#L27-L39) 只处理不在旧 processed log 中的新 timestamp，不会在路线/坐标变化后重算旧标签。因此已发布结果隐含依赖未版本化的历史分类状态。

对 Q15 的判断应是：**accuracy 未知，internal consistency 部分成立，不能把 113 个值直接当作已验证的 ETA 冷启动真值。**这些 GPS 仍可留在 staging，供逐条复核和重新标注；未经 ground-truth audit 不进入 production 模型。

## 三层质量分开看

| 层       | 审计结果                                                                                    | 能说明什么                             | 不能说明什么                                                                                |
| -------- | ------------------------------------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------- |
| 原始 GPS | 154 条均非 mocked、timestamp 唯一；但 reported horizontal accuracy 中位数 23.4m，P90 124.3m | 确实存在一批带时间和位置的设备观测     | reported accuracy 是设备自报，不是独立测得的真实误差；不能证明点就在站内                    |
| 站点匹配 | 当前路线内最近站距离中位数 19.8m；20/154 个现有 label 无法由当前代码重现                    | 多数点在校园站点附近，适合人工复核     | 最近站不等于真实到站；方向、路线变体和经过但不停站都可能误分                                |
| 站间耗时 | committed processed log 可精确重现 113 个差值                                               | JSON 没有抄写/汇总误差，脚本行为可复核 | 差值是两个 GPS timestamp 之差，不是经验证的 departure-to-arrival 或 arrival-to-arrival 真值 |

## 1. 原始 GPS 质量

[`bus-log.json`](https://github.com/CCheukKa/CUHK-bus-clock/blob/575adc5475fc115001c30d9b5d5373384791c1f6/data/bus-log.json) 有 154 条记录。设备报告的 horizontal accuracy 分布为：

| 指标             |            数值 |
| ---------------- | --------------: |
| median           |          23.38m |
| P75              |          47.88m |
| P90              |         124.35m |
| P95              |         498.49m |
| max              |           1000m |
| `accuracy > 20m` | 85/154（55.2%） |
| `accuracy > 50m` | 38/154（24.7%） |

即使选择每条 route 内的**最佳最近站**，仍有 30/154 个点离最近站超过 50m，19/154 超过 100m；最远 337.6m。已有 processed label 到其站点的距离 P90 为 117.3m，最大 580.8m。

最近站与次近站的距离差有 46/154 小于该点自身 reported accuracy。这个量不是「46 条一定分错」，但说明其 GPS 精度不足以靠最近距离消除站点歧义。另有 70/154 个点到最近站的距离大于设备报告的 accuracy radius。

顶层 `timeStamp` 与 `location.timestamp` 的绝对差 median 0.407 秒、P95 5.381 秒、最大 19.667 秒。脚本使用顶层 timestamp 算时长；通常差异较小，但最差记录可给一段差值带来秒级至十几秒偏移。

站点坐标本身也不是校验真值。[`BusData.ts`](https://github.com/CCheukKa/CUHK-bus-clock/blob/575adc5475fc115001c30d9b5d5373384791c1f6/constants/BusData.ts#L196-L229) 将 8 个坐标以 `???` 标注，其中 Area 39 上/下行共用同一点，Campus Circuit North 与多个 CW Chu stop identity 也共用同一点。方向判断因此不能只靠这些坐标。

## 2. 站点匹配与路线站序

[`processing.ts`](https://github.com/CCheukKa/CUHK-bus-clock/blob/575adc5475fc115001c30d9b5d5373384791c1f6/scripts/processing.ts#L89-L101) 的 map matching 只有一步：在所选 route 的 stops 中取 Haversine 距离最近者。它没有距离上限、GPS accuracy gate、heading、道路轨迹、停留检测或人工标签。

固定 commit 下的具体问题：

- 20/154 个 committed station labels 与当前最近站算法不同；其中 4 个 committed station 已不在该 raw route 的当前 stop list 中。
- 115 对「全局相邻、同 route、相隔不超过 300 秒」记录中，当前 route station order 判断为 108 对正常相邻、1 对同站、6 对回跳或绕回。
- 脚本只检查 pair 是否存在于**全局** `busStationTimings` key 集合，不检查它是否是当前 route 的相邻 stops。[收录的 113 对](https://github.com/CCheukKa/CUHK-bus-clock/blob/575adc5475fc115001c30d9b5d5373384791c1f6/scripts/processing.ts#L54-L82) 中有 5 对不是当前 route 的相邻站，但因该 pair 在其他路线合法而被放行。
- `BusData.ts` 区分 Route 2 与 2+（后者停邵逸夫堂），而 raw log 只有 route `2`，没有 pattern/variant identity。CUHK 对观测期有效的 [2024–25 官方表](https://transport.cuhk.edu.hk/wp-content/uploads/documents/Shuttle_24-25.pdf) 同样说明 Route 2 只有部分分钟的班次停邵逸夫堂。仅凭 `route=2` 无法判断该 GPS 点来自哪个 pattern。

数据也没有 vehicle ID 或 trip ID。审计以 route change 或相隔超过 300 秒切分，得到 39 个推断 fragment，长度 median 3 点、最大 17 点；这只能说明短序列大致连续，不能排除两辆同路线车辆或相邻班次被连在一起。

## 3. 站间耗时的离散度与稳定性

113 个时长分布在 49 个非空 pair：

| 覆盖                      | pair 数 |
| ------------------------- | ------: |
| 只有 1 个样本             |      22 |
| 2–4 个样本                |      23 |
| 至少 5 个样本             |       4 |
| 至少 2 个服务日           |      27 |
| 混合至少 2 个 route label |      21 |

因此 45/49 个 pair 没有 5 个样本，22/49 连留一法都无法执行。21 个 pair 把多个 route 的观测合并到同一 station-pair 数组，无法估计路线、班次或载客量差异。

对每个非空 pair 计算 median、leave-one-observation-out、leave-one-service-date-out，以及固定 seed 的 5,000 次 non-parametric bootstrap median：

- leave-one-observation 与 leave-one-date 的最大 median 移动均为 24 秒。这不是准确性保证，只说明在现有极小样本集合内 median 没有再移动 30 秒以上。
- `Sir Run Run Shaw Hall → University Admin Building` 只有 3 个值 `90/113/157` 秒，median 的 bootstrap 95% 区间为 `[90,157]`，宽 67 秒。
- `University Admin Building → S.H. Ho College` 有 5 个值，范围 `83–140` 秒，bootstrap median 区间也是 `[83,140]`；MAD rule 标出 1 个异常值。脚本的 2-SD 检查只 `warn`、仍然收录，而且多数 pair 太小，无法可靠估异常。
- 样本相对最多的两个 pair 内部较稳定：`University Station → University Sports Centre` 的 n=11、median=123 秒、bootstrap `[107,131]`；`University Sports Centre → Sir Run Run Shaw Hall` 的 n=16、median=142.5 秒、bootstrap `[129.5,147]`。但前者混合 2 条 route，后者混合 5 条 route；内部稳定仍不等于对某一具体班次准确。

Bootstrap 把现有值当作 iid，且无法反映 station misclassification、同一次 trip 内相关性或未覆盖的高峰/学期周，因此这些区间是**偏乐观的内部抽样稳定性**。singleton 的 bootstrap 宽度虽为 0，实际是不确定性不可识别，不是完美准确。

## 4. `station-times.json` 的重现边界

审计按当前 [`processing.ts`](https://github.com/CCheukKa/CUHK-bus-clock/blob/575adc5475fc115001c30d9b5d5373384791c1f6/scripts/processing.ts) 的条件重算：全局时间排序、相邻记录 route 相同、时差 `1..300` 秒、pair key 存在。以 committed [`processed-bus-log.json`](https://github.com/CCheukKa/CUHK-bus-clock/blob/575adc5475fc115001c30d9b5d5373384791c1f6/data/processed-bus-log.json) 为输入时，54 个数组和全部 113 个值都精确重现。

但 `BusData.ts` 的 runtime timing table 与 generated JSON 有 5 个 key 不同：它为 generated 空数组手工填了 7 个值（源码以 `//!` 标记）。这些值不能算作 GPS audit 通过的样本。重建还说明：raw log、station classifier version、route-pattern version 和 processed labels 必须一起不可变版本化；否则同一个 source commit 内也不存在唯一派生结果。

## 与官方资料能比较到哪里

对观测期有效的 CUHK [Shuttle School Bus 2024–25 timetable](https://transport.cuhk.edu.hk/wp-content/uploads/documents/Shuttle_24-25.pdf) 给出服务时间、每小时起点发车分钟、路线图和条件停站。它没有每一班的实际起点发车时刻，也没有中间站真实到站 timestamp。由此可以检查 route/pattern 是否合理，却不能验证某个 `station-times.json` 值是 123 秒还是 140 秒。

要回答真正的 accuracy，最小验证集必须另行采集：

1. 固定一个 route pattern 和 scheduled origin trip；
2. 人工确认车辆身份，并在连续站点记录 arrival/departure truth；
3. 将同一次 ride 的 Bus Clock 原始 GPS 逐点重新匹配；
4. 分别报告 station-classification confusion matrix、arrival timestamp error、segment/累计 ETA 的 MAE、median absolute error 和 P90 absolute error；
5. 至少跨高峰/非高峰、多个服务日和多个 `weekOfTerm`，不能只拿同一趟车的相邻点当独立样本。

在这组 truth set 出现前，最诚实的产品结论是「这批数据提供了一些可能合理的站间量级，但准确度未知」。

## 可复现命令

分析脚本位于 [`bus-clock-accuracy-audit/analyze.ts`](./bus-clock-accuracy-audit/analyze.ts)，不修改上游仓库：

```bash
git clone https://github.com/CCheukKa/CUHK-bus-clock.git /tmp/CUHK-bus-clock-audit
git -C /tmp/CUHK-bus-clock-audit checkout 575adc5475fc115001c30d9b5d5373384791c1f6
pnpm exec tsx docs/campus-transport/research/bus-clock-accuracy-audit/analyze.ts \
  /tmp/CUHK-bus-clock-audit > /tmp/cuhk-bus-clock-accuracy-audit.json
```

脚本输出原始分布、station assignment diff、fresh rebuild diff、route-order 检查及全部 pair 的 LOO/bootstrap 指标。Bootstrap 使用由 pair name 固定生成的 seed，重复运行结果一致。
