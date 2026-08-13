# 稀疏到站反馈下的首版 ETA 拟合模型

日期：2026-08-09
范围：Wayfinder「确定今日服务的数据真值与实时降级模型」中的 Q10，只回答预测算法；不决定 UI、训练频率或匿名身份策略。

## 决策摘要

首版不应直接使用 GAM、GBM、Kalman 或 LSTM。推荐一个**每日批处理的层级稳健分位数基线**：

1. 保留官方起点发车时间 `scheduledDeparture`，另存一套预测偏移，永不覆盖官方计划。
2. 首版直接拟合 `RoutePattern × Stop` 的**累计到站偏移**，并按时段、星期/教学日和 `weekOfTerm` 加上有回退的稳健修正。
3. 用户只看到 P50 四舍五入后的点时间，例如「预计 6:02」；系统内部仍保存 P10/P50/P90、采用的回退层、独立车次/服务日覆盖量和模型版本。
4. 所有原始反馈都保留。模型的统计单位应是一次真实的 `Trip × Stop` 到站事件；同一辆车同一站的多次反馈是对同一事件的重复测量，而不是多辆独立车。把它们聚合为一个事件标签不会删除原始反馈。
5. EWMA 只用于时间衰减或检测学期内漂移，不直接把刚收到的反馈更新到乘客 ETA。Kalman 需要可匹配到当前车次的连续实时观测；LSTM 需要密集的线路轨迹序列，两者都不满足首版输入条件。

这是工程决策，不是某篇论文给出的 CUHK 专用模型。下面分别标出来源能够支持的事实，以及基于这些事实对当前数据条件作出的工程推断。

## 首先限制可识别的目标

用户反馈字段是 `Route + Stop + observedArrivalTime`，另有系统当时展示的候选车次上下文。单个站点的到站观测能直接估计：

```math
Y_i = A_i - D_{t(i)}
```

其中 `A_i` 是观测到站时间，`D_t` 是候选车次的官方起点发车时间。`Y_i` 同时包含起点晚发、途中行驶和停站造成的累计偏移。

它**不能单独识别某两个相邻站之间的 segment travel time**。只有同一车次在相邻站都得到可靠匹配的到站事件时，才可相减得到：

```math
T_{i,s\rightarrow s+1}=A_{i,s+1}-A_{i,s}.
```

公交研究通常从 AVL/GPS 轨迹把车辆通过站点的事件转换为 link travel time，再把下游 link 和 dwell time 相加生成到站预测；例如 Petersen 等人的 ConvLSTM 工作明确采用这种输入与累加方式，并要求每个时间步拥有各 link 的 travel time 向量（[论文原文](https://arxiv.org/abs/1903.02791)）。

**工程推断：**当前点状反馈不具备这种轨迹结构，所以首版 canonical target 应是 `RoutePattern × Stop` 的累计偏移。`segmentId` 可以保留在特征/数据模型中，但只有成对事件存在时才训练 segment 参数；不能把一个站点的反馈虚构成一段路程样本。

## 推荐模型

### 1. 预测分解

设：

- `p`：已审核的 `RoutePattern`，不是只用 Route code；
- `s`：该 pattern 中的 Stop；
- `D_t`：Trip 的官方起点发车时间；
- `O⁰(p,s)`：冷启动累计偏移，来自获授权的既有样本或人工实测；
- `r_i = A_i - (D_t + O⁰(p,s))`：观测相对冷启动基线的残差。

首版预测为：

```math
\widehat A_{t,s}^{P50}
= D_t + O^0(p,s)
+ b_{p,s}
+ h_{p,\operatorname{timeBand}}
+ d_{\operatorname{weekday},\operatorname{teachingDay}}
+ w_{\operatorname{route},\operatorname{weekOfTerm}}.
```

各项都是残差的稳健中位数修正，并向更粗层级收缩。首版不要创建
`pattern × segment × hour × weekday × teachingDay × weekOfTerm` 的完整交叉表；在 47 个站点和多条 pattern 下，这会立即把有限数据切成大量空格子。

建议的初始粒度：

| 效应        | 首版粒度                                       | 数据不足时回退                             |
| ----------- | ---------------------------------------------- | ------------------------------------------ |
| 基准        | `pattern × stop` 累计偏移                      | Route 同方向对应 Stop；再回退到冷启动 `O⁰` |
| 时段        | `pattern × 60-minute band`                     | Route × 时段；再回退到无时段修正           |
| 星期/教学日 | `weekday + teachingDay` 的加性类别             | 只保留 teachingDay；再回退到全体服务日     |
| 学期阶段    | Route × 整数 `weekOfTerm`                      | 全校 × weekOfTerm；再回退到无学期周修正    |
| segment     | `pattern × adjacent stops`，仅限同车次成对事件 | 不训练；继续使用累计 stop offset           |

`weekOfTerm` 不施加单调下降约束。开学后首月拥挤逐渐下降可以由数据表现为一个下降曲线，也可以表现为非单调变化；没有足够周覆盖时该项自动回退为零。

### 2. 层级收缩而不是硬切换

对任一局部修正 `m_local`，与父层 `m_parent` 混合：

```math
\widetilde m
= \lambda m_{local} + (1-\lambda)m_{parent},
\qquad
\lambda = \frac{n_{eff}}{n_{eff}+k}.
```

`n_eff` 应按独立的 `Trip × Stop` 事件和服务日覆盖计算，而不是按按钮点击数；`k` 由按日期向前滚动的验证选择。所有反馈仍保存在观测表中并参与事件标签的形成。

这是**工程推断**，不是唯一正确的收缩公式。其目的，是让一个只有一两天数据的局部格子继续接近父层，而不是突然把「预计 6:02」改成一次偶然观测。更成熟时，可以用 penalized random effects 取代显式公式；`mgcv` 官方文档说明 `bs="re"` 可把因子效应作为受惩罚的随机效应，并可用 ML/REML 估计（[random-effects 文档](https://stat.ethz.ch/R-manual/R-devel/library/mgcv/html/random.effects.html)）。

### 3. 中位数、分位数与内部不确定性

中位数对应 P50，适合产品已经决定展示的单点「预计 6:02」。Koenker 与 Bassett 的原始 quantile regression 论文建立了通过非对称绝对损失估计条件分位数的方法（[论文原文](https://people.eecs.berkeley.edu/~jordan/sail/readings/koenker-bassett.pdf)）；NIST 的研究也指出 median 相比 mean 更不容易被离群值破坏（[NIST 原文](https://www.nist.gov/publications/possible-advantages-robust-evaluation-comparisons)）。

首版每个已选层级至少计算：

- P50：供 UI 显示；
- P10/P90：不必在主界面显示，但用于校准、回归测试和以后展示误差范围；
- `eventCount`、`serviceDayCount`、所用层级及父层；
- 当前模型版本和训练截止时间。

P10/P90 是预测结果分布的经验分位数，不是“中位数参数的置信区间”。是否可靠要在未来日期上检验实际覆盖率。scikit-learn 的官方 quantile boosting 示例也明确分开 pinball loss 与 interval coverage，并展示训练集覆盖正确、测试集仍可能过窄的情况（[官方示例](https://scikit-learn.org/stable/auto_examples/ensemble/plot_gradient_boosting_quantile.html)）。

### 4. 时间衰减

NIST 对 EWMA 的定义是递归地让较旧观测获得指数递减权重；它适合发现渐进的小幅漂移（[NIST EWMA 文档](https://www.itl.nist.gov/div898/handbook/mpc/section2/mpc2211.htm)）。

**工程推断：**当前产品明确不让单条反馈直接更新 ETA，所以不要把经典 EWMA 均值作为在线乘客预测。可以在每日批处理中采用以下任一较安全用途：

1. 对经验分位数使用随日期衰减的权重，使本学期近期车次逐渐比旧学期更重要；或
2. 对每天先聚合的 route/time-band P50 residual 计算 EWMA，只用于发出「模型可能漂移、应重新训练」信号。

衰减半衰期不写死为“一个月”。应以 rolling-origin validation 选择，并保存到 `PredictionModelRevision`。这允许数据学习开学第一周到后续周的变化，而不是预设一定单调下降。

## 六类候选算法的进入门槛

| 方法                      | 证据支持的能力/输入                                                                                                                                                                                                                                                                         | 在本项目的判断                                                                  | 进入或升级 gate                                                                                                          |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Robust median / quantiles | 估计条件中位数/分位数；绝对损失比平方损失更不受大离群值影响（[Koenker–Bassett](https://people.eecs.berkeley.edu/~jordan/sail/readings/koenker-bassett.pdf)、[scikit-learn 文档](https://scikit-learn.org/stable/modules/linear_model.html#quantile-regression)）                            | **首版主模型**；最容易审计、回退和解释                                          | 冷启动即可运行；局部项只有在独立车次和服务日覆盖达到下文 publication gate 后才脱离父层                                   |
| EWMA                      | 指数降低旧数据权重，可检测小而持续的漂移（[NIST](https://www.itl.nist.gov/div898/handbook/mpc/section2/mpc2211.htm)）                                                                                                                                                                       | **首版辅助项**；不处理 pattern/stop/calendar 结构，也不直接在线改 ETA           | 只有 rolling-origin 验证选出的衰减优于等权基线时启用；只作用于每日聚合或训练权重                                         |
| Quantile GAM              | penalized spline 可学习非线性平滑效应；qgam 提供 additive quantile regression 和自动平滑/学习率校准（[方法论文](https://arxiv.org/abs/1707.03307)、[CRAN 官方文档](https://stat.ethz.ch/CRAN/web/packages/qgam/vignettes/qgam.html)）                                                       | **首选第二阶段历史模型**；能解释 time-of-day 和 week-of-term 曲线，并保留分位数 | 至少覆盖 6 个不同 term weeks、各主要服务日类型和主要时段；`gam.check`/basis 检查通过；连续 3 个未来窗口胜过首版模型      |
| Gradient-boosted trees    | 可拟合非线性与交互；官方实现支持 quantile loss 和预测区间（[Friedman 原始 GBM](https://doi.org/10.1214/aos/1013203451)、[scikit-learn quantile GBM](https://scikit-learn.org/stable/auto_examples/ensemble/plot_gradient_boosting_quantile.html)）                                          | **challenger，不是默认升级**；易学到稀疏类别或学期日期的偶然交互                | 训练/验证/测试都覆盖不同学期阶段；对 P50、peak slice 和 interval calibration 均胜过 qGAM/基线，且无主要 pattern 明显退化 |
| Kalman/state-space        | 从时间序列观测递归更新隐藏状态及误差协方差（[Kalman 1960 原文记录](https://cds.cern.ch/record/434680)）；公交实现依赖 AVL 的连续 time/location pairs（[Dailey 等](https://doi.org/10.3141/1771-06)、[Cathey–Dailey](<https://doi.org/10.1016/S0968-090X(03)00023-8>)）                      | **只适合未来实时层**；历史点击量再多，也不会自动产生当前车次状态                | 能稳定把连续观测匹配到同一当前 Trip，并估计 measurement/process noise；实时 shadow test 胜过批处理历史 ETA 后才启用      |
| LSTM/sequence model       | 原始 LSTM 设计用于长期序列依赖（[Hochreiter–Schmidhuber 原文](https://people.idsia.ch/~juergen/lstm1997-2024head.pdf)）；公交 ConvLSTM 要求固定时间分辨率的全 link 序列，论文在 2 分钟粒度时仍有 89% time steps 缺测，最终用 15 分钟聚合（[Petersen 等](https://arxiv.org/abs/1903.02791)） | **首版排除**；孤立的 stop taps 不是高密度 sequence，填补后训练只会学习插值策略  | 获得大量完整/近完整 Trip 轨迹，固定窗口 link matrix 的缺失率可控；在跨 term 测试中持续胜过 GBM/qGAM，且分位数校准合格    |

不存在文献能够给 CUHK 一个通用的“收集到 N 条就上 GAM/LSTM”的可靠阈值。模型容量、线路数量、覆盖时段、相关性和标签误差都会改变所需样本；因此 gate 以**独立车次/日期覆盖 + 未来留出表现**为主，而不是只看原始点击数。

## 建议的 publication gate

下面数字是可调整的**首版工程护栏**，不是论文结论：

1. 某个局部效应至少覆盖 20 个可匹配的独立到站事件、5 个服务日，且任何单日不超过权重的 40%，才允许其权重大于父层的一半；否则仍展示预测，但主要来自父层/冷启动。
2. 一个候选模型替代当前模型前，必须进行按日期的 rolling-origin evaluation；普通随机 K-fold 会把未来数据泄漏到过去。scikit-learn 的 `TimeSeriesSplit` 官方文档明确说明时间有序数据应以先前数据训练、后续数据测试（[官方文档](https://scikit-learn.org/stable/modules/generated/sklearn.model_selection.TimeSeriesSplit.html)）。
3. 至少连续 3 个未来窗口同时满足：
   - P50 MAE 相对 incumbent 改善至少 10%；
   - 早晚高残差 time bands 的 MAE 不退化；
   - 有至少 30 个测试事件的主要 pattern 中，没有任何一个 MAE 退化超过 10%；
   - 内部 P10–P90 区间的实际覆盖率位于 75%–85%；
   - 预测区间没有以不合理变宽换取覆盖率。
4. 不满足 gate 就继续发布现有「预计」值；新模型保持 shadow，不需要停止反馈收集。

这些阈值的作用是防止一次偶然开学周或单条线路支配升级。上线后应根据“错几分钟会使乘客错过车”的产品损失重新校准，而不是把 10% 和 75%–85% 当永久统计定律。

## qGAM 升级形状

当数据通过 gate 后，推荐先挑战一个可解释的 quantile GAM，而不是直接上树或神经网络。概念式为：

```text
P50 residual ~
  RoutePattern/Stop penalized effect
  + cyclic smooth(timeOfDay)
  + factor(weekday)
  + factor(teachingDay)
  + smooth(weekOfTerm)
  + route-level smooth(timeOfDay)
```

- `timeOfDay` 可用 cyclic spline，避免午夜两端人为断裂；`mgcv` 官方文档提供 `bs="cc"` 的 cyclic penalized cubic spline（[文档](https://stat.ethz.ch/R-manual/R-devel/library/mgcv/html/cyclic.cubic.spline.html)）。
- route/pattern 之间可用受惩罚 factor smooth 或 random effect 借力；`mgcv` 支持 factor-specific smooths（[文档](https://stat.ethz.ch/R-manual/R-devel/library/mgcv/html/factor.smooth.html)）。
- `weekOfTerm` 使用普通 smooth，不施加单调约束。
- 不要一开始加 `timeOfDay × weekOfTerm × pattern` 三维交互；只有残差诊断显示稳定结构且 out-of-time 改善时再加。`mgcv` 官方文档提醒 basis dimension 默认值是任意的，必须用 `gam.check` / `choose.k` 检查（[gam.check](https://stat.ethz.ch/R-manual/R-devel/library/mgcv/html/gam.check.html)、[choose.k](https://stat.ethz.ch/R-manual/R-devel/library/mgcv/html/choose.k.html)）。

分别拟合 P10、P50、P90 后需要检查 quantile crossing；若发生则不能直接发布该区间。产品虽然当前只显示 P50，但保留这些检查能阻止一个“点预测看似不错、实际极度过度自信”的模型晋级。

## 对实现票据的最小数据要求

本研究不决定最终数据库表，但算法实现至少需要这些不可变输入：

- `feedbackId`, `routeId`, `stopId`, `observedArrivalAt`, `receivedAt`；
- 提交时的 `candidateTripId` / `candidatePatternRevisionId` 和匹配状态，即使 UI 不让用户手填；
- `serviceDate`, `scheduledOriginDeparture`, `weekday`, `teachingDay`, `weekOfTerm`；
- 聚合后的 `arrivalEventId`，关联组成它的全部 feedback；
- `PredictionModelRevision`：训练窗口、特征、衰减参数、回退层、数据 ID、按 pattern/time band/term week 的指标；
- 每个 `ArrivalProjection` 的 model revision、P10/P50/P90、训练截止时间与有效样本覆盖。

如果后台不保存提交时的候选 Trip 上下文，仅凭 route/stop/time 在班次密集或严重晚点时可能出现多个合理匹配。即使第一阶段明确暂不考虑加班车，也应把“无法唯一匹配”作为数据状态保留下来，不能为了让模型有数据而强制选择最近一班。

## 证据与推断边界

### 由来源直接支持

- Median/quantile loss 对极端值比 squared-error mean 更稳健，并能直接估计 P50/P10/P90。
- EWMA 给近期数据更高权重，适合检测小而持续的过程漂移。
- qGAM/GAM 能以 penalized smooth 表达非线性、factor-specific 和 random effects，并需要诊断 basis/拟合。
- Quantile GBM 能产生条件分位数，但测试集区间覆盖必须独立校准。
- Kalman 公交预测依赖当前车辆的连续 AVL/location 时间序列。
- 公交 LSTM 研究使用规则化、多 link、连续时间窗口输入；缺失率会随更细时间粒度急剧上升。
- 时间序列模型选择必须保持训练在测试之前。

### 本文的工程推断

- 首版拟合 cumulative `pattern × stop` offset，而不是从单点反馈伪造 segment time。
- 采用 60 分钟 time band、additive day/week effects 和明确层级回退。
- 用独立 Trip × Stop 事件而不是 raw tap 数决定权重；所有 raw feedback 仍保留。
- 20 events / 5 service days、连续 3 个窗口、10% 改善和 75%–85% coverage 是初始发布护栏。
- EWMA 仅用于 batch 权重/漂移；qGAM → GBM 是历史模型升级顺序；Kalman 是独立的未来实时层；LSTM 延后到密集轨迹数据阶段。

## 结论

第一版应发布「勉强正确但不冒充实时」的预测：`官方起点发车 + 冷启动累计偏移 + 层级稳健 P50 修正`。它可以学习某线路在某时段通常更慢，也可以在学期第 1、2、3、4 周逐步形成不同修正，同时对稀疏格子自动回退。

下一次算法升级不是“反馈达到某个总数就换模型”，而是 qGAM 在跨服务日、跨学期周的未来留出测试中稳定胜出。Kalman 和 LSTM 不属于同一条单纯的复杂度阶梯：前者等待实时 trip-matched stream，后者等待密集 trajectory matrix；当前匿名点状到站反馈无法满足它们的输入前提。
