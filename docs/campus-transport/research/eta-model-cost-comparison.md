# CUHK 校巴 ETA 模型：工程成本、数据等待时间与架构边界

日期：2026-08-09
范围：为 Wayfinder「确定今日服务的数据真值与实时降级模型」回答 Q16。本文比较算法路径，不决定 Bus Clock 数据能否采用、反馈 UI 或当前车次在线更新。

## 结论

不要把这些方法排成一条“越复杂越准确”的直线。它们实际上解决三类不同问题：

1. **固定累计偏移**回答“没有用户数据时，官方起点 06:00 后，大约几点到善衡”；
2. **层级稳健分位数、EWMA、qGAM、GBM**回答“这条路线在这个时段、星期和学期周通常会偏多少”；
3. **Kalman/state-space**回答“正在运行的这一班车此刻偏了多少”。LSTM 只有在拥有密集、连续的车辆轨迹后，才可能同时学习复杂的时空相关。

建议的分阶段路径是：

- **V0：固定累计偏移**随第一版发布，确保始终有“预计 06:02”；它是可替换的冷启动基准，不冒充拟合结果。
- **V1：层级稳健 P50/P10/P90**作为首个从反馈学习的 production 模型；留在现有 TypeScript + PostgreSQL 边界内。EWMA只作为近期权重或漂移报警的可选附加项。
- **V2 challenger：qGAM 与 quantile GBM 做 shadow 对比**。只有未来服务日验证证明更好才晋级，不因“已经收集很多数据”自动换模型。qGAM 优先用于解释平滑的日内高峰与 `weekOfTerm`；GBM 用于检验是否存在稳定交互。
- **实时层：Kalman/state-space 另立项目**。它等待的是可匹配到当前 `Trip` 的连续观测，不是更多匿名历史点击。
- **LSTM 暂不进入路线图**。现有点状到站反馈不是 sequence input；在得到密集车辆轨迹前，编码估算没有决策意义。

## 估算口径

以下所有人日均为**规划区间，不是报价或承诺**。统一假设：

- 1 人日 = 一名熟悉本 repo、Next.js/TypeScript/PostgreSQL 的工程师约 6 小时专注工作；
- 已有经过审核的 `RoutePattern`、`Stop`、`Trip` 与官方起点发车时间；
- 估算包含模型代码、数据读写、测试、离线验证、版本发布/回滚和最小运行监控；
- 不包含反馈页面、Bus Clock 数据准确性/许可调查、人工跟车、campus-map 集成、隐私/法律评审和生产数据库扩容；
- 一人串行实施；多人并行不会按人数线性缩短，因为 schema、评估和发布接口存在依赖；
- 当前 repo 只有 Node/TypeScript、Drizzle 与 PostgreSQL，没有 Python/R 依赖、模型注册表、任务队列或 `vercel.json` cron 配置。这是本地代码事实，不等于生产环境一定使用 Vercel 的某一付费计划。

任何可学习模型都共享一层约 **12–22 人日**的生产基础设施。固定偏移 V0 不需要这层反馈训练设施，只需要自己的版本化参数、查询和回退：

| 共用工作                                                                                      |     估算 | 主要不确定性                                   |
| --------------------------------------------------------------------------------------------- | -------: | ---------------------------------------------- |
| `ArrivalObservation`、`ArrivalEvent`、`PredictionModelRevision`、预测结果 schema 与 migration | 3–5 人日 | 车次歧义和 revision 关系是否已经在相邻票据锁定 |
| 到站事件聚合、候选 Trip 匹配、特征快照                                                        | 3–5 人日 | 同站多路线、班距短时的歧义比例                 |
| 按服务日向前验证、指标分片、champion/candidate/rollback                                       | 3–6 人日 | 发布 gate 和内部 P10/P90 是否第一版就完整实现  |
| 每日调度、锁、幂等、失败可见性及查询适配                                                      | 3–6 人日 | 实际部署平台和告警设施                         |

可学习算法表中的“增量编码”是在这层基础上再增加的工作；“到 production”是两者相加后的区间。V0 单独估算，不把尚未使用的反馈训练设施算进去。这样既不会把一条 SQL 当作整个可运营预测系统，也不会把未来 V1 的设施虚算给冷启动版本。

## 决策矩阵

| 方法                  | 它真正解决什么                                                 |                                             增量编码时间 |                  到 production | 运行成本（当前规模）                                                     | 数据日历等待                                                                                          | 可解释性 | 精度机会与主要风险                                                                                   |
| --------------------- | -------------------------------------------------------------- | -------------------------------------------------------: | -----------------------------: | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------- |
| 固定累计偏移          | 冷启动逐站“预计”                                               |                                                 1–3 人日 | **3–7 人日**，不含反馈训练底座 | 极低；读已发布 offset，必要时每日预生成                                  | 0 天用户反馈；但必须先有经审核的冷启动偏移                                                            | 很高     | 稳定、可审计；无法学习高峰、星期或开学周变化，错误基准会系统性偏移                                   |
| 层级稳健中位数/分位数 | 学习 `pattern × stop` 基准和时段/日类型/学期周修正，稀疏时回退 |                                                 4–8 人日 |                 **16–30 人日** | 低；每日 PostgreSQL 聚合 + TS 发布，预计秒至分钟级，需用真实数据量压测   | 局部修正约 2–16 教学周，取决于每格每日独立事件数；全网粗层可更早                                      | **很高** | 最适合稀疏、异常值多的数据；分箱较粗，不能自动学习很平滑或高阶交互                                   |
| EWMA（附加项）        | 给近期服务日更高权重，或报警残差漂移                           |                                       在 V1 上 +2–4 人日 |                     18–34 人日 | 极低；每日递推或加权聚合                                                 | 至少 2–6 周日级聚合才值得调半衰期；验证 `weekOfTerm` 仍需覆盖学期                                     | 高       | 能较快跟随开学后变化；没有 route/stop/calendar 结构，半衰期太短会追噪声，不能独立取代 V1             |
| quantile GAM / qGAM   | 平滑学习 time-of-day 与 `weekOfTerm` 非线性，并保留分位数      |                                               10–19 人日 |                     22–41 人日 | 算力低至中；本规模通常不需 GPU，但引入 R worker、构建和模型导出维护      | **最早 8–16 教学周**；稳妥比较需要至少 1 个学期，跨学期泛化则 2 个学期                                | 高至中   | 很适合解释“早高峰曲线”和“开学后逐渐变化”；可能过度平滑、basis 选错或出现 quantile crossing           |
| quantile GBM          | 自动学习时段、线路、学期周之间的非线性交互                     |                                               12–24 人日 |                     24–46 人日 | 算力低至中；日批小数据 CPU 足够，主要成本是 Python 环境、artifact 与监控 | 至少 8–16 教学周；通常等有 **5k–20k** 个独立事件后才值得挑战，且要保留未来日期 holdout                | 中至低   | 可能在稳定交互上胜过加性模型；稀疏类别容易过拟合，`weekOfTerm` 外推差，总体指标会掩盖单线路退化      |
| Kalman / state-space  | 用当前班次连续观测递推其隐藏延误状态                           | 模型 10–18 人日；连同在线匹配/状态/过期处理共 22–43 人日 |                     34–65 人日 | 中；每次更新计算便宜，但需要有状态、短时效、频繁触发与观测新鲜度监控     | **当前反馈无法解锁**；先有连续 trip-matched stream，再留 4–8 周 shadow 才可估噪声和误匹配率           | 中至高   | 对当前车次修正很合适；一旦 Trip 匹配错，状态会传播到整班下游，单点历史反馈再多也不能补足输入         |
| LSTM / sequence       | 从密集、多站、多时间步轨迹学习复杂时空依赖                     |                           数据管道就绪后仍约 25–50+ 人日 |  37–72+ 人日，**不含轨迹采集** | 中至高；当前规模未必需 GPU，但训练、调参、artifact、漂移监控和回退面最重 | **不可由当前点状反馈估算**；应等待密集完整轨迹，通常至少多个月/多个学期，门槛由缺失率和跨学期测试决定 | 低       | 有机会学复杂峰值；最易把缺失填补、路线改版或某一学期偶然性学成规律，当前阶段没有证据证明收益覆盖成本 |

`5k–20k`、`2–16 周`等是容量规划区间，不是文献给 CUHK 的样本定律。它们只用于判断什么时候值得花工程时间做 challenger；最终 gate 必须是未来日期上的误差和覆盖表现。

## 编码时间与“等数据”的时间必须分开

### 1. 固定偏移不等用户反馈

只要 Q15 的数据审计或人工跟车给出经审核的累计偏移，V0 就能发布。编码完成不代表偏移是准确的；反过来，即使反馈一条都没有，也不妨碍产品按已确定方案继续显示「预计 06:02」。

### 2. V1 的等待时间由“每格独立事件率”决定

若一个局部格子定义为 `RoutePattern × Stop × time band × day type`，并暂用“20 个独立到站事件且覆盖 5 个服务日”作为收缩权重开始超过父层的 pilot gate，则：

```text
局部数据等待（服务日） ≈ max(5, 20 / 每格每天可用 ArrivalEvent 数)
```

| 每格每天独立 ArrivalEvent | 达 20 个事件的服务日 | 约合教学周 |
| ------------------------: | -------------------: | ---------: |
|                      0.25 |                   80 |         16 |
|                         1 |                   20 |          4 |
|                         2 |                   10 |          2 |

这里的单位必须是聚合后的物理 `ArrivalEvent`，不是按钮点击行数。多人同时反馈同一班车会提高该事件的可信度，但不会把一辆车变成多辆；否则数据等待看似缩短，统计有效样本并没有增加。

V1 不需要等所有格子到门槛才上线：粗层模型可以先学，稀疏格子继续回退到固定偏移。因此“编码完成”和“全网每个时段都有个性化修正”之间可能相差数月。

### 3. 学期变化存在无法压缩的日历下限

产品要学习的是开学后第 1、2、3、4 周如何变化，而不是简单的总体延误。一天收到十万条反馈仍只覆盖一个 `weekOfTerm`。qGAM 或 GBM 至少需要真实走过多个学期周，并把后来的周留作时间外验证。

所以：

- 评估“有没有开学首月曲线”的最早时间是约 6–8 个教学周；
- 对同一学期内的曲线做较可信的 future holdout，规划上按 8–16 周；
- 要证明曲线能跨学期复用，需要第二个学期，日历上通常是数月而不是更多服务器就能解决。

时间序列不能用随机 K-fold 把未来泄漏到过去；scikit-learn 的 `TimeSeriesSplit` 官方文档明确将其用于“先前数据训练、后续数据测试”的场景。[TimeSeriesSplit](https://scikit-learn.org/stable/modules/generated/sklearn.model_selection.TimeSeriesSplit.html)

### 4. Kalman 与 LSTM 等的不是同一种数据

Kalman filter 的输入是带时间顺序的观测过程，并递推隐藏状态；statsmodels 将其定义为“time-series process”的 state-space representation。[statsmodels `KalmanFilter`](https://www.statsmodels.org/stable/generated/statsmodels.tsa.statespace.kalman_filter.KalmanFilter.html)

如果反馈只告诉系统“6:05，3 号线，善衡到站”，但无法稳定确定它是哪一个当前 `Trip`，就没有可安全延续的班次状态。历史点状反馈增加到一百万条也不会自动解决此身份问题。

公交 ConvLSTM 研究则把多 link、多 time step 的规则化矩阵作为输入，用模型学习空间与时间相关，而不是使用孤立的站点点击，详见 [Petersen et al. 原文](https://arxiv.org/abs/1903.02791)。PyTorch 的 LSTM API 同样要求按 time step 的输入序列和隐藏/单元状态。[PyTorch `LSTM`](https://docs.pytorch.org/docs/stable/generated/torch.nn.LSTM.html)

因此二者的数据等待不能写成“收集 N 条匿名反馈后开启”：

- Kalman gate = 当前车辆/班次连续观测 + 可测量的匹配准确率；
- LSTM gate = 大量完整或近完整轨迹 + 可控的 link-time matrix 缺失率；
- 两者都应先有数据源票据，再估具体日历周期。

## 各方案的工程边界

### V0/V1/EWMA：留在 TypeScript + PostgreSQL

PostgreSQL 原生提供 `percentile_cont`/`percentile_disc` ordered-set aggregates，可直接求 P10/P50/P90。[PostgreSQL aggregate functions](https://www.postgresql.org/docs/current/functions-aggregate.html) 在当前预期的数据量下，推荐：

1. PostgreSQL 聚合训练窗口和分组分位数；
2. TypeScript 实现层级回退、收缩、EWMA 权重、候选验证与版本发布；
3. 将每个版本的最终参数和逐站预测写回 PostgreSQL；
4. 线上请求只读已发布结果，不在页面请求里训练。

这样没有跨语言模型序列化，也不需要实时调用模型服务。`percentile_cont` 本身不支持 Partial Mode，若数据以后大到日批变慢，应先预聚合 `ArrivalEvent`/服务日统计并实测，而不是预先引入 Spark 或 GPU。

### qGAM：R 离线 job，不是假装成 TypeScript 模型

这里说的 qGAM 是 R 的 `qgam` package：它依赖 R ≥ 4.0 与 `mgcv`，用自动平滑参数估计拟合 smooth additive quantile regression。[CRAN `qgam`](https://cran.r-project.org/package=qgam)

合理边界是：

- Next.js/PostgreSQL 输出版本化训练表；
- R job 训练 P10/P50/P90、输出预测表与诊断 artifact；
- TypeScript 只验证 artifact schema、写入 candidate、执行 promotion；
- production query 不运行 R。

Vercel 当前官方 runtime 列表有 Node/Python，但没有 R；若坚持 qGAM，需要容器化定时任务、CI runner 或其他 batch 平台，而不是塞进 Next.js Function。[Vercel runtimes](https://vercel.com/docs/functions/runtimes)

若组织只接受 Python，可用 spline features + quantile regression 自行拼出近似 additive quantile model，但它不等同于 `qgam` 的自动平滑/校准。这个选择会增加统计实现与验证成本；不建议为了“只用 Python”而把它命名为 qGAM。

### GBM：Python 离线 job，输出普通预测表

scikit-learn 的 `HistGradientBoostingRegressor` 原生支持 quantile/pinball loss，也支持类别特征、缺失值和 interaction constraints。[官方 API](https://scikit-learn.org/stable/modules/generated/sklearn.ensemble.HistGradientBoostingRegressor.html) 因此 GBM 的合理边界与 qGAM 相同：Python 训练，导出每个候选 Trip/Stop 的 P10/P50/P90，线上仍然只读 PostgreSQL。

Vercel 有官方 Python Functions，但截至本文日期仍标为 Beta；Python bundle 也不会自动 tree-shake。每日小模型技术上可以由 cron 触发 Python Function，但是否把生产训练押在 Beta runtime 上是运维选择，不是算法要求。[Vercel Python runtime](https://vercel.com/docs/functions/runtimes/python)

另一种更保守的做法，是将 Python trainer 放在独立容器/CI batch，Next.js cron endpoint 只创建 training request 或轮询结果。数据量尚小时，不需要常驻 prediction service。

### Kalman：可用 TS 计算，但在线状态才是真成本

低维 Kalman 公式本身用 TypeScript 实现并不困难，Python `statsmodels` 也有成熟 state-space implementation。真正的成本在：

- 把每个新观测可靠绑定当前 Trip；
- 按 `Trip × PatternRevision` 保存短生命周期 state 与 covariance；
- 处理乱序、迟到、重复、过期和路线终点；
- 防止错误状态传播到下游全部车站；
- 在没有新鲜观测时明确回退到长期模型。

所以它可以继续使用 Node + PostgreSQL/Redis，也可以拆 Python state service；语言选择不是首要决策。若要求近实时，当前“每天一次”的 cron 不够。Vercel Cron 实际是向 Function 发 GET，请求可能重复且平台不自动 retry 失败；官方要求 job 幂等并处理并发。[Vercel Cron 管理文档](https://vercel.com/docs/cron-jobs/manage-cron-jobs) Hobby 计划还只能每天执行一次且触发可在指定小时内漂移，不能当作当前车次事件循环。[Vercel Cron usage](https://vercel.com/docs/cron-jobs/usage-and-pricing)

### LSTM：Python/PyTorch 与模型运维，不应嵌入 Next.js

LSTM 训练自然落在 Python/PyTorch。即使模型很小，也应离线训练、版本化 artifact，并让线上读取预计算结果或调用有明确超时/回退的 inference boundary。BusTime 的一手对比明确把训练与预测计算成本纳入公交模型选择，并指出原始 GPS 有噪声且更新不规则；其 Dublin 结果不能直接当作 CUHK 的运行时 benchmark，但足以说明“更复杂模型必须连同预处理与部署成本比较”。[BusTime 原文](https://arxiv.org/abs/2003.10373)

在本项目数据条件下，先搭 LSTM 服务再等数据会产生一套无法验证的 MLOps 表面。正确顺序是先证明出现了 V1/qGAM/GBM 无法解释的稳定时空残差，再为该残差设计 sequence ticket。

## 精度比较应如何落地

不能用别的城市论文的 MAE 排名替 CUHK 选模型。Kormáksson 等人的 additive bus model 使用大规模车辆 GPS，并显示 day-of-week、hour-of-day 与当前交通条件可影响 travel time；它支持我们把这些因素纳入候选，却不证明 CUHK 的 qGAM 一定胜过中位数。[Bus Travel Time Predictions Using Additive Models](https://arxiv.org/abs/1411.7973)

每个 challenger 都必须在同一套按未来服务日切分的数据上比较：

- P50：MAE 与 median absolute error；
- P10/P90：pinball loss 与实际覆盖率；
- 产品切片：高峰、非高峰、`weekOfTerm` 1–4、之后周数、教学/非教学日、每个主要 pattern；
- 运营切片：有预测覆盖率、回退率、无法匹配的 ArrivalEvent 比例、训练耗时、artifact 大小、失败恢复；
- 与固定偏移、当前 champion 做成对比较，而不是只报一个模型自己的分数。

模型只在多段未来窗口持续胜出后 promotion。GBM 或 LSTM 的全网 MAE 更好，但若开学首月或某条主要路线明显变差，仍应留在 shadow。

## 建议锁定的分阶段决策

| 阶段      | 决策                                                     | 开始条件                                     | 完成/升级条件                                             |
| --------- | -------------------------------------------------------- | -------------------------------------------- | --------------------------------------------------------- |
| V0        | 发布可追溯固定累计偏移                                   | Q15 得到可审核冷启动数据                     | 所有预测标“预计”，可回退，基准误差开始被记录              |
| V1        | TypeScript/PostgreSQL 层级稳健分位数，每日生成 candidate | feedback/event schema 与 Trip 匹配状态可用   | 未来服务日稳定胜过 V0；稀疏格子继续回退                   |
| V1.1      | 只把 EWMA 用于时间权重/漂移提示                          | 至少数周日级残差                             | rolling validation 选出的衰减胜过等权 V1；否则关闭        |
| V2 shadow | qGAM 优先、GBM 并行 challenger                           | 至少覆盖 6–8 个 term weeks 和主要 time bands | 在 8–16 周或更长的时间外验证上胜过 V1，且关键切片不退化   |
| Realtime  | 另建 Kalman/state-space ticket                           | 有连续、可 trip-match 的新鲜观测             | shadow 中当前班次预测胜过长期模型，误匹配与过期回退达标   |
| Sequence  | 暂不建实现票                                             | 有密集轨迹且残差证明需要时空 sequence        | 跨学期胜过 qGAM/GBM，收益足以覆盖最低可解释性和最高运维面 |

因此，对 Q16 的建议答案不是“现在选一个最终算法”，而是：**现在锁定 V0 + V1 的生产边界和 challenger protocol；qGAM/GBM 只做有数据后的比较实验；Kalman 与 LSTM 等输入条件成熟后再单独决策。**

## 主要一手来源

- PostgreSQL, [Aggregate Functions](https://www.postgresql.org/docs/current/functions-aggregate.html).
- NIST/SEMATECH, [EWMA control chart](https://www.itl.nist.gov/div898/handbook/mpc/section2/mpc2211.htm).
- Fasiolo et al. / CRAN, [`qgam`: Smooth Additive Quantile Regression Models](https://cran.r-project.org/package=qgam).
- scikit-learn, [`HistGradientBoostingRegressor`](https://scikit-learn.org/stable/modules/generated/sklearn.ensemble.HistGradientBoostingRegressor.html), [quantile prediction interval example](https://scikit-learn.org/stable/auto_examples/ensemble/plot_gradient_boosting_quantile.html), [`TimeSeriesSplit`](https://scikit-learn.org/stable/modules/generated/sklearn.model_selection.TimeSeriesSplit.html).
- statsmodels, [`KalmanFilter`](https://www.statsmodels.org/stable/generated/statsmodels.tsa.statespace.kalman_filter.KalmanFilter.html).
- PyTorch, [`torch.nn.LSTM`](https://docs.pytorch.org/docs/stable/generated/torch.nn.LSTM.html).
- Liu, Sun & Wang, [BusTime: Which is the Right Prediction Model for My Bus Arrival Time?](https://arxiv.org/abs/2003.10373), 2020.
- Kormáksson et al., [Bus Travel Time Predictions Using Additive Models](https://arxiv.org/abs/1411.7973), 2014.
- Petersen et al., [Multi-output Bus Travel Time Prediction with Convolutional LSTM Neural Network](https://arxiv.org/abs/1903.02791), 2019.
- Vercel, [Cron Jobs](https://vercel.com/docs/cron-jobs), [Managing Cron Jobs](https://vercel.com/docs/cron-jobs/manage-cron-jobs), [Cron Usage and Pricing](https://vercel.com/docs/cron-jobs/usage-and-pricing), [Python Runtime](https://vercel.com/docs/functions/runtimes/python).
