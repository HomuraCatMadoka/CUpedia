# 校巴预计到站时间：观测更新节奏与验证门槛

## 研究问题

匿名用户提交「路线、车站、到站时间」后，这些观测应以什么节奏、经过什么验证门槛，才能用于更新 CUHK 校巴的预计到站时间？本研究区分：

1. 跨日积累、用于产生长期基准的历史模型；
2. 只影响一班正在运行车辆的在线修正。

本文只回答数据与模型治理问题，不决定最终 UI，也不假设 CUHK 已提供 GPS、GTFS-RT 或逐站官方时刻。文中的具体数字如无直接来源，会明确标为「首轮运行假设」，需要用本项目数据回测后再锁定。

## 结论

适合第一版的方案是：**所有提交均作为不可变的原始观测保存；每天生成一次长期模型候选；候选通过按服务日切分的离线验证后才替换线上版本。第一版不做当前车次在线修正。**

历史上与本项目最接近的 Tiramisu 众包公交系统，也是每天用过去一个月的行程重建历史模型；实时模型则每 30 秒运行一次，但它依赖乘客在车上持续共享、且 30 秒内仍然新鲜的 GPS 轨迹。Tiramisu 的两类模型在拟合前都会剔除异常值，因为坏 GPS、丢失轨迹和用户错误确实存在。这直接支持「长期批处理」与「当前车次在线态」分层，也反驳了“每一条提交都可直接视作独立且正确训练样本”的假设。[Tiramisu field trial, pp. 4–5](https://www.cmu.edu/traffic21/pdfs/zimmermanetalchi2011.pdf)

建议的第一版运行策略：

- 页面继续显示冷启动的单点基准，例如「预计 6:02」；没有足够反馈时不撤掉它。
- 用户反馈不会直接改掉页面时间，也不会立即传播成“实时”ETA。
- 每天服务结束后构建一次候选模型，默认看最近 **28 个服务日**；这是把 Tiramisu 的“过去一个月、每天重建”转换成服务日窗口的首轮假设。
- 模型目标是每个 `路线模式 × 车站 × 发车时段 × 日类型 × weekOfTerm` 的到站偏差；数据不足时逐级回退到更粗粒度的基准，而不是硬拟合一个稀疏格子。
- 候选只在时间顺序验证集上稳定优于当前版本后发布；否则继续使用旧版本。
- 开学效应作为 `weekOfTerm` 特征和残差漂移来学习，不强制“第一月逐周单调下降”。

## 一、长期基准模型

### 1.1 每日批处理，而不是每条反馈触发发布

Tiramisu 的研究原型每天用前一个月数据构建一次历史模型，且会按工作日、周末和假日生成不同模型。它的实时 30 秒模型依赖连续 GPS 轨迹，与本项目的一次性“到站”按钮不是同一种输入。[Tiramisu field trial, pp. 4–5](https://www.cmu.edu/traffic21/pdfs/zimmermanetalchi2011.pdf)

因此第一版建议：

1. 观测实时写入原始层；
2. 每天校巴服务结束并经过迟到数据宽限期后，生成一个候选版本；
3. 次日或验证完成后才可能提升为线上版本；
4. 同一天内页面继续使用同一个已发布版本，避免用户看到模型随零星点击来回跳动。

迟到数据应按“事件发生时间”归属服务日，而不是按服务器接收时间归属。流处理系统通常为乱序或迟到事件保留 grace period；窗口关闭后再到的数据可留在原始层、进入下一轮重算，但不应悄悄改写已经发布的版本。[Apache Kafka Streams `Windows` API](https://kafka.apache.org/26/javadoc/org/apache/kafka/streams/kstream/Windows.html)

**首轮运行假设：**每天香港时间 03:00 构建候选，接受前一服务日结束后 2 小时内到达的反馈。具体时间应根据最后一班车和实际提交延迟分布调整，而不是视为研究定论。

### 1.2 滚动窗口与开学漂移

公交时间随交通、停站时间和乘客负载变化。公交 ETA 实验研究会把班次准点程度、交通拥堵和停站时间作为预测变量；GPS 预测实验也把延误相关和停站等待视为重要信息。[Jeong & Rilett, 2005](https://doi.org/10.1177/0361198105192700123)、[Lin & Zeng, 1999](https://doi.org/10.3141/1666-12)

本项目已知“开学后的第一个月较拥挤，之后逐渐下降”是需要检验的产品假设。建议同时做两件事：

- 把 `academicTermId`、`weekOfTerm`、教学日/非教学日、星期和发车时段作为显式特征；
- 对模型残差运行漂移监测，只把漂移信号用作“提前重训/人工检查”的触发器，不让它直接发布模型。

ADWIN 是一种有统计界限的自适应窗口漂移检测器：它比较旧、近两个子窗口的均值，并在分布差异显著时缩短窗口；其官方实现也明确指出，较小的最小窗口能更快发现变化，但会增加误报。[River ADWIN documentation](https://riverml.xyz/0.16.0/api/drift/ADWIN/)

**首轮运行假设：**历史模型以最近 28 个服务日为主要窗口；往年或上一学期同一 `weekOfTerm` 数据只作为较弱先验。若残差漂移被检测到，仍生成普通候选并走相同验证流程，不直接清空历史或自动上线。窗口长度应在积累至少一个学期后，用时间前推回测比较 14、28、56 个服务日再决定。

### 1.3 模型不必一开始复杂

BusTime 的实证框架比较了 schedule-delay、k-NN、kernel regression、additive model 和 RNN-LSTM，并强调真实部署需要同时比较精度、训练和推理成本；原始 GPS 本身也有噪声和不规则更新频率，需要预处理。[BusTime paper](https://arxiv.org/abs/2003.10373)

本项目第一版只有稀疏的“到站事件”，没有连续车辆轨迹。因此首个候选应采用可解释的稳健统计：

- 目标值：`observedArrivalAt - coldStartPredictedArrivalAt`；
- 中心估计：中位数或带稳健损失的分层回归；
- 分组：路线模式、车站、发车时段、日类型、`weekOfTerm`；
- 稀疏格子：回退到去掉 `weekOfTerm`、扩大时段、或路线/车站总体的上一级估计；
- 保留内部误差分布，即使 UI 第一版只显示「预计 6:02」。

已有公交研究也使用近期实际到站时间、加权平均和 forgetting-factor 函数提高预测，说明“近期证据权重更高”是合理方向；但该研究的数据来自实际公交运行，不能直接证明哪一种衰减参数适合 CUHK。[Hua et al., 2017](https://doi.org/10.3846/16484142.2017.1298055)

## 二、观测进入模型的门槛

### 2.1 “全部保存”不等于“全部是独立真值”

用户提出“不考虑去重，都是有效的数据”。这可以作为**原始数据保存策略**，但不能未经验证地当成**统计独立性假设**：

- 两个人同时报告同一辆车到站，是同一个物理到站事件的两个证词，不是两班车样本；
- 一个人多次点击可能产生多个数据库记录，但不会让同一次到站变成多次独立实验；
- 默认 GPS 可能选错附近车站，用户也可能改错路线或时间；
- 网络重试可能重复提交同一个表单。

最接近的 Tiramisu 系统明确在实时和历史模型拟合前剔除异常值，以抵御坏 GPS、轨迹丢失和用户错误；早期 GPS 公交预测实验同样把数据筛查列为算法开发的一部分。[Tiramisu field trial](https://www.cmu.edu/traffic21/pdfs/zimmermanetalchi2011.pdf)、[Lin & Zeng, 1999](https://doi.org/10.3141/1666-12)

因此需要区分三个层级：

1. `ArrivalObservation`：每次提交都永久保存，不因筛选而删除；
2. `ArrivalEvent`：算法把相同路线、车站、候选班次和相近时间的多个证词聚合成一个可能的物理到站事件；
3. `TrainingExample`：通过一致性检查的到站事件，才进入某个模型版本。

这不需要账号、设备信誉分或身份级去重。它是**事件重建**：保留所有人的提交，同时避免把同一辆车的十次点击误当成十辆车。

若产品最终坚持“每条提交在拟合中权重完全相同、也不做事件聚合”，则需明确接受两个后果：样本量会被重复证词虚增；任何人都能用连续提交显著移动预测。现有一手研究不支持把这一路径称为经过验证的公交预测数据处理方式。

### 2.2 无需身份信息的基础一致性检查

进入 `ArrivalEvent` 候选前，可以仅使用用户已同意提供的字段做检查：

- 路线模式确实服务该车站；
- 到站时间位于该路线当天可运行的合理窗口；
- 客户端填写时间、服务器接收时间和可选 GPS 时间之间没有不可解释的冲突；
- 若 GPS 只用于推荐车站，则保存用户最终确认的车站，并把定位距离/精度作为证据元数据，而不是把 GPS 自动选择当作真值；
- 到站事件能与唯一的计划班次合理匹配；若有多个候选，保留 `unmatched/ambiguous`，不强行训练。

GTFS-RT 的 `TripUpdate` 之所以要求绑定 trip，并在重复车站时要求 `stop_sequence`，就是因为“哪一班、哪一次经过该站”是到站更新的必要身份信息。[GTFS Realtime Trip Updates](https://gtfs.org/documentation/realtime/feed-entities/trip-updates/)

### 2.3 最小样本门槛

查到的一手来源没有给出适用于所有路线、车站和时段的统一最小样本数。Tiramisu 甚至明确指出，众包系统需要多少参与者才算“critical mass”难以预先确定，必须通过现场测量。[Tiramisu field trial](https://www.cmu.edu/traffic21/pdfs/zimmermanetalchi2011.pdf)

所以不应把 `n = 10` 或 `n = 30` 伪装成文献结论。建议采用两级门槛：

- **结构门槛**：每个细分格子至少覆盖若干个不同服务日，而不只看提交行数；同一 `ArrivalEvent` 的多个证词只提高该事件的置信度，不增加独立到站次数。
- **性能门槛**：候选在未参与训练、按日期晚于训练集的服务日上通过发布条件；没有足够 holdout 时继续回退到上一级模型。

**可供 pilot 使用、必须回测的起始值：**细分格子至少覆盖 5 个不同服务日且有 10 个重建到站事件；不足时仍显示冷启动预计时间，只是不发布该格子的学习修正。积累一个月后，应根据误差收敛曲线重新定值。

### 2.4 模型变更门槛

每天重训不等于每天上线。候选与当前线上版本应在同一组未来日期 holdout 上比较：

- 主指标：到站绝对误差 MAE；
- 尾部指标：绝对误差 P90，避免平均改善但极端预测显著变坏；
- 覆盖指标：产生预计时间的班次/车站比例不能下降；
- 分组指标：至少单独查看高峰时段、开学前四周和各路线，避免总体改善掩盖局部退化。

建议的发布门槛是：对每个服务日计算候选与 champion 的配对误差差值，bootstrap 其 95% 置信区间；只有“候选更好”的方向稳定，且 P90/覆盖没有超过预先登记的退化预算时才提升。具体退化预算应在 pilot 看实际误差后决定。BusTime 的实证框架在同一数据与预处理流程中比较多种基准和模型；本项目也应始终保留冷启动基准和当前 champion 作为比较对象。[BusTime paper](https://arxiv.org/abs/2003.10373)

UI 按分钟显示时，小于半分钟的模型变化通常不会改变显示值；无需另设一个会掩盖真实改善的“最少必须变化一分钟”规则。发布门槛应约束预测误差，而不是约束参数变化幅度。

## 三、当前车次在线修正

### 3.1 第一版建议不启用

一次反馈只包含路线、车站、到站时间。它没有车辆 ID，也可能无法唯一绑定计划班次。只要班距较短或延误较大，即使暂不考虑临时加班车，匹配仍可能歧义。因此第一版适合把反馈只用于次日后的长期模型，不在页面上称为“实时”。

这与“反馈不会直接更新时间、只有算法结果才会更新”的产品选择一致，也防止单条匿名提交立刻影响所有乘客。

### 3.2 后续在线层的最低条件

如果以后加入在线层，应是独立、短生命周期的 `TripPrediction`：

1. 匹配算法先把观测绑定到一个确定的 `Trip`；
2. 估计器计算该班车相对基准的偏差和下游站预测；
3. 结果只作用于该班车，班次结束即失效；
4. 原始观测仍在长期批处理管道中接受独立验证；在线输出不能直接写回长期模型参数。

GTFS-RT 将 realtime `TripUpdate` 定义为特定 trip 的进度更新，允许提供绝对到站时间、相对计划的 delay 以及 uncertainty。若缺少某一 trip 的更新，消费者应理解为“没有实时信息”，而不是“车辆准点”；有当前站 delay 时，规范允许把它传播到下游站，直到新的 stop update 或 `NO_DATA` 截断。[GTFS Realtime Trip Updates](https://gtfs.org/documentation/realtime/feed-entities/trip-updates/)、[GTFS Realtime reference](https://gtfs.org/documentation/realtime/reference/)

在线发布的新鲜度也远高于历史模型：GTFS-RT 最佳实践建议 feed 至少每 30 秒刷新，Trip Updates 和 Vehicle Positions 不应老于 90 秒。[GTFS Realtime Best Practices](https://gtfs.org/documentation/realtime/realtime-best-practices/)

因此未来在线层可以采用：匹配成功后立即运行算法；最多 30 秒形成新的发布快照；观测超过 90 秒后不再标作当前实时依据，回退到长期基准。这里的 30/90 秒来自 GTFS-RT 发布新鲜度规范，不代表单点匿名反馈已经达到车辆 GPS feed 的可靠程度。

## 四、版本化、发布与回滚

每次训练都应创建不可变 `PredictionModelVersion`，至少记录：

- `modelVersionId`、训练代码版本、特征/算法配置；
- 原始观测截止时间、训练窗口、数据快照哈希；
- 使用的 `ArrivalEvent`/服务日数量及筛选统计；
- 时间前推验证集范围、MAE、P90、覆盖率和关键分组指标；
- 创建时间、状态（candidate/champion/retired）和父版本；
- 每个预测结果所用的模型版本和生成时间。

发布不是覆盖旧记录，而是原子地把 `champion` 指针切到新版本。回滚只需把指针切回仍可复现的旧版本；原始观测和失败候选都不删除。MLflow 的官方模型注册表采用同样的版本、lineage、alias 设计，并明确支持把 `champion` alias 重新指向旧版本完成回滚。[MLflow Model Registry](https://mlflow.org/docs/latest/ml/model-registry/)

建议自动回滚条件：新版本上线后，在随后完成的服务日上持续显著劣于上一 champion，或发生数据管道完整性事故。短期漂移报警本身只触发检查，不应自动回滚，因为它也可能代表开学期真实变化。

## 五、建议形成的 Wayfinder 决策

可以据此把 Q11 收敛为以下决策候选：

1. **第一版只有长期层**：每天批处理一次，反馈不影响当天当前班次。
2. **滚动窗口**：以最近 28 个服务日为首轮假设，保留 `weekOfTerm`；窗口长度以后回测决定。
3. **原始层全收，训练层有门槛**：所有匿名提交都保存；不做用户身份信誉，但做路线/站点/时间检查和物理到站事件聚合。
4. **稀疏时回退**：样本不足仍显示冷启动预计时间，不发布该细分格子的学习修正。
5. **候选验证后发布**：按服务日时间前推验证，MAE 为主、P90/覆盖/高峰与开学周为护栏；验证不足或不稳定就保留 champion。
6. **模型不可变且可回滚**：预测带版本，发布切 alias，不覆盖历史。
7. **在线层以后另做**：必须先解决 trip 匹配；其状态与长期模型隔离，遵循约 30 秒发布、90 秒新鲜度边界。

其中第 3 点需要产品方明确确认：**“所有提交都保留”可以成立；“所有提交都是独立、等权、无需筛查的真值”没有研究证据支持，且与现有众包公交系统的实际处理相冲突。**

## 来源

- Zimmerman et al., [Field Trial of Tiramisu: Crowd-Sourcing Bus Arrival Times to Spur Co-Design](https://www.cmu.edu/traffic21/pdfs/zimmermanetalchi2011.pdf), CHI 2011.
- GTFS, [Realtime Best Practices](https://gtfs.org/documentation/realtime/realtime-best-practices/), [Trip Updates](https://gtfs.org/documentation/realtime/feed-entities/trip-updates/), [Realtime Reference](https://gtfs.org/documentation/realtime/reference/).
- Liu, Sun & Wang, [BusTime: Which is the Right Prediction Model for My Bus Arrival Time?](https://arxiv.org/abs/2003.10373), 2020; [associated source code](https://github.com/swangcs/BusGPS).
- Jeong & Rilett, [Prediction Model of Bus Arrival Time for Real-Time Applications](https://doi.org/10.1177/0361198105192700123), Transportation Research Record, 2005.
- Lin & Zeng, [Experimental Study of Real-Time Bus Arrival Time Prediction with GPS Data](https://doi.org/10.3141/1666-12), Transportation Research Record, 1999.
- Hua et al., [Bus arrival time prediction using mixed multi-route arrival time data at previous stop](https://doi.org/10.3846/16484142.2017.1298055), Transport, 2017.
- Bifet & Gavaldà algorithm implementation documentation, [River ADWIN](https://riverml.xyz/0.16.0/api/drift/ADWIN/).
- Apache Kafka, [Streams window and grace-period API](https://kafka.apache.org/26/javadoc/org/apache/kafka/streams/kstream/Windows.html).
- MLflow, [Model Registry](https://mlflow.org/docs/latest/ml/model-registry/).
