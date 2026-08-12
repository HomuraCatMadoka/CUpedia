# CUHK 校巴：公开数据冷启动与用户反馈迭代方案

状态：执行方案
日期：2026-08-10
现实约束：项目方无法主动随车采集，也没有 CUHK 车辆 AVL/GPS 或真实逐站到站日志。第一版只能用网上公开数据产生不完全准确但明确标为“预计”的逐站时间，再通过实际用户反馈持续改进。

## 生产决策更新（2026-08-12）

- 项目方确认已经停止运营的 CU Bus App 是本项目的精神前作，允许其 v1.18 内嵌路线 offset 作为冷启动基线；CUpedia 继续保留来源版本与 attribution。
- `ArrivalObservation`、重建出的 `ArrivalEvent`、候选班次概率、不可变模型版本与各站 residual 修正均进入 PostgreSQL。
- 首版学习器采用可解释的稳健经验贝叶斯 residual：中位数抵抗异常反馈，样本量通过 shrinkage 决定相对 cold-start prior 的权重；样本不足不发布局部修正。
- 模型任务默认读取最近 28 天观测，按服务日期做时间前推 holdout；只有候选 MAE 改善且 P90 未明显退化时才标记为可审核，管理员确认后才原子切换 champion。
- 灰度阶段只将匿名到站反馈写入 PostgreSQL，不配置 Vercel cron，也不会训练、晋升模型或修改前台预计。训练、审核与回滚代码先保留，并由默认关闭的 `CAMPUS_BUS_MODEL_OPERATIONS_ENABLED` 同时保护页面与 API；待反馈覆盖达到要求后再启用，届时仍可运行 `pnpm campus-bus:train-model` 手动回放。
- 匿名反馈全部保存；防滥用按一小时有效的签名随机会话执行礼貌限流，默认每 10 分钟 12 次。短期限流状态单独保存在可清理表中，不把 IP、网络 hash 或会话身份写入不可变观测，也不会让 CUHK NAT/VPN 下的多人共享额度。

## 当前进度（2026-08-11）

- 路线页 mockup 已确认采用 Variant A 的交互方向：地图默认展开、站点列表直接显示未来班次、只用文字入口提交实时到站时间。
- 反馈弹窗只预填路线、站点和当前时间；时间用 `− / +` 按分钟调整，主按钮为“提交”，成功后只显示一次感谢提示。
- Route 2 cold-start 纵向切片已完成：两个经审核 RoutePattern 共 19 个站点 projection 全部可生成，使用 10 个唯一公开相邻区段 prior，没有插入固定两分钟 fallback。
- 生成器、数据边界和当前结果见 [`data/cold-start/README.md`](./data/cold-start/README.md)；产物仍是 staging，不能作为已验证的真实 ETA 发布。

下一个工程切片是让正式 App 的只读 Route 2 页面消费该 dataset。第一版先不接反馈写入和模型更新，也不依赖 campus-map 已经集成；地图坐标与路线几何继续通过明确的 transport/map seam 接入。

## 一句话版本

```text
CUHK 官方发车时间
+ 网上公开的站间运行数据
+ 透明的低置信度 fallback
= 第一版“预计到站”

用户在站点卡片反馈真实到站时间
→ 多条反馈重建 ArrivalEvent
→ 每 1–3 天训练候选模型
→ 候选在未来反馈上更准才发布
→ 新的“预计到站”继续接受反馈
```

下一步不是主动采集 GPS，而是先把公开数据变成一份可供 UI 使用的 **cold-start projection dataset**。

## 一、第一版时间从哪里来

### 1. 官方数据负责确定骨架

CUHK Transport Office 公开资料只用于：

- Route、Stop 和经过人工审核的 RoutePattern；
- 当天是否服务；
- 每个 Trip 的官方起点计划发车时间；
- 职员专车等乘车资格和当天临时服务提示。

官方资料没有给出中途站实际到站时间，所以不能把“预计 18:05”写成官方 StopTime。

### 2. Bus Clock 只作为 weak prior

已经完成的审计显示，Bus Clock 的 `station-times.json` 只有 113 个站间时长样本，而且覆盖不均、部分区段样本只有 1–4 个、路线维度会丢失，也没有与真实到站时间对照。因此它可以帮助生成第一版 offset，但必须满足：

- 每个值保留 source repo、commit、站点 pair、样本数和授权状态；
- 使用样本分布的稳健中位数，不复制代码中的 120.5 秒固定 fallback；
- 不把 Bus Clock 数值标成“准确”或“官方”；
- 正式公开前解决数据许可/attribution；许可未解决时只进入 staging prototype。

### 3. 没有公开区段样本时使用透明 fallback

如果要求所有主要 RoutePattern 都显示逐站预计，缺失区段不可假装有实测数据。第一版 fallback 应是算法输出，并明确降级层级：

1. 同一 `RoutePattern × adjacent Stop pair` 的公开观测中位数；
2. 同方向 Route 共用 Stop pair 的公开观测中位数；
3. 根据公开站点坐标、路线几何和已观测区段拟合的简单分层 travel-time prior；
4. 仍无法估计时显示“预计时间暂缺”，不写死每站两分钟。

第 3 层不是实时导航 ETA。它只能用已有公开区段学习“距离、坡度/方向、线路位置大致对应多久”，输出必须携带 `fallbackLevel` 和宽不确定范围。是否引入这一层，要先用有观测的区段做遮蔽验证：故意隐藏一些已知区段，看 fallback 能否还原；若明显不可靠，就宁可显示暂缺。

### 4. 第一版输出

每个 `RoutePattern × Stop` 形成：

```typescript
type ColdStartProjection = {
  patternRevisionId: string;
  stopId: string;
  cumulativeOffsetSeconds: number | null;
  p10Seconds: number | null;
  p50Seconds: number | null;
  p90Seconds: number | null;
  sourceKind: "public-observation" | "modeled-fallback" | "unavailable";
  sourceRefs: string[];
  sampleCount: number;
  serviceDayCount: number;
  fallbackLevel: string;
  generatedAt: string;
  seedModelRevisionId: string;
};
```

页面时间为：

```text
预计到站 = 官方起点计划发车 + cumulativeOffsetSeconds
```

例如官方 18:00 发车、善衡书院 cold-start P50 为 312 秒，页面显示“预计 18:05”。内部仍保存 P10/P90、来源、样本量和 fallback。

## 二、用户实际看到什么

普通用户不需要理解模型：

```text
2 号线
善衡书院

下一班：预计 18:05 · 还有 3 分钟
下下班：预计 18:20 · 还有 18 分钟

时间不准？你的反馈会帮助我们改进预计时间。
[反馈实际到站]
```

点击反馈：

```text
路线：2 号线             已预填，可修改
车站：善衡书院           已预填；GPS 只推荐附近站
实际到站：现在 18:08     已预填，可修改

[提交]
```

用户只提交 Route、Stop、实际到站时间。匿名用户也可以提交。GPS 不是连续车辆追踪，只在用户同意时帮助推荐附近 Stop；提交前由用户确认。

卡片在后台同时提交用户无需理解的上下文：

- 当时显示的 `projectionId`；
- 当时认为“下一班”对应的 `candidateTripId`；
- `candidatePatternRevisionId`；
- `seed/predictionModelRevisionId`；
- 客户端填写时间与服务器接收时间。

这些只是候选，不能因为卡片原本猜了 18:00 Trip 就强行当真。

## 三、反馈怎样变成模型数据

### 1. 原始反馈全部保存

每次提交形成不可变 `ArrivalObservation`：

```typescript
type ArrivalObservation = {
  observationId: string;
  routeId: string;
  stopId: string;
  observedArrivalAt: string;
  receivedAt: string;
  projectionId: string;
  candidateTripId: string | null;
  candidatePatternRevisionId: string | null;
  modelRevisionId: string;
  gpsEvidence: {
    distanceToStopM: number;
    accuracyM: number;
  } | null;
  submittedAnonymously: boolean;
  qualityFlags: string[];
};
```

不因为异常、重复或无法匹配就删除原始提交。

### 2. 模型不能把每次点击当作一辆独立巴士

同一辆车到同一站时，可能有三个人同时点击，也可能一次网络重试产生两条记录。这些反馈都有效、都保存，但现实只发生了一次到站。

算法按以下候选键重建 `ArrivalEvent`：

```text
serviceDate
× RoutePattern
× Stop
× candidate Trip probability
× 相近到站时间窗口
```

因此：

- 数据库可以有 5 条 ArrivalObservation；
- 统计上可能只形成 1 个 ArrivalEvent；
- 多人一致会缩小这个事件的时间不确定性，但不会把独立班次数从 1 变成 5。

这不是删除反馈，也不是建立用户信誉分，而是区分“几个人观察到”与“几辆车到站”。

### 3. 不确定是哪一班车时保留概率

例如 Route 2 有 18:00 和 18:05 两个 Trip，用户在 18:11 报告到站，延误情况下两者都可能。系统保留：

```text
P(18:00 Trip | observation) = 0.65
P(18:05 Trip | observation) = 0.35
```

- 高置信唯一匹配的事件可以完整训练累计 offset；
- 歧义事件可以通过候选概率进入长期贝叶斯 likelihood；
- 歧义事件不能用于当前班次即时修正；
- 第一阶段不把 unmatched 自动解释成加班车。

## 四、第一版模型怎样更新

### 初始模型

```text
官方起点计划发车
+ Cold-start offset
= 初始预计到站
```

### 反馈模型

反馈逐渐积累后，拟合：

```text
observedArrivalAt - scheduledOriginDeparture
≈ patternStopBase
 + timeBandEffect
 + serviceDayEffect
 + weekOfTermEffect
```

首版使用带部分汇聚的稳健贝叶斯模型或等价的层级稳健分位数模型：

- 数据少的 Stop/时段向 RoutePattern 或全局 seed 收缩；
- 使用 Student-t/污染模型限制极端匿名反馈影响；
- `weekOfTerm` 不预设一定逐周下降；数据不足就回退为 0；
- Cold-start offset 是 prior，随着独立 ArrivalEvents 增加逐渐降低影响；
- 页面始终写“预计”，不因模型更新变成“实时”。

### 每 1–3 天更新一次

```text
新 ArrivalObservations
→ 重建/更新 ArrivalEvents
→ 训练 candidate model revision
→ 在时间更晚、未参与训练的反馈事件上比较
→ 通过后进入管理员审核，确认后切换 champion
→ 不通过则继续使用旧版本
```

“贝叶斯可以实时更新”在计算上成立，但产品不应让一条匿名点击立刻改变所有人的 ETA。计算频率和发布频率分开，符合已经确定的 1–3 天迭代节奏。

## 五、没有 gold data 怎么验证

这里有一个必须接受的限制：**没有独立真实到站日志，就无法在第一天证明绝对准确率。**我们能做的是让验证证据逐步增强：

1. 冷启动阶段只报告公开来源覆盖、内部重现性和 fallback 遮蔽误差，不宣称真实 MAE；
2. 上线后把多个独立用户对同一物理到站的一致反馈聚合成较高置信 ArrivalEvent；
3. 按 ServiceDay/Trip 做时间前推切分，用过去训练、未来反馈事件验证；
4. 比较 candidate、当前 champion、原始 cold-start 和 Bus Clock prior；
5. 同时报告 MAE、signed bias、P90、预测覆盖率，以及高峰、主要 RoutePattern、开学周分片；
6. 反馈量不足或结果矛盾的格子继续使用较粗 prior，不发布局部修正。

这种验证不是独立运营方真值，所以模型页面仍应诚实地显示“预计”，内部指标注明 `evaluationSource=crowd-reconstructed`。未来如果 CUHK 或其他公开源提供 AVL/逐站日志，再把它作为独立 benchmark 接入；当前路线不依赖它。

## 六、需要实现的数据对象

| 对象                      | 用途                                                             |
| ------------------------- | ---------------------------------------------------------------- |
| `ColdStartProjection`     | 网上公开数据产生的第一版累计 offset、来源、样本和 fallback       |
| `ArrivalProjection`       | 某 Trip/Stop 当前向用户展示的“预计”及模型版本                    |
| `ArrivalObservation`      | 用户每次原始提交，全部不可变保存                                 |
| `TripMatchCandidate`      | 一条 observation/event 对各候选 Trip 的概率                      |
| `ArrivalEvent`            | 重建的一次物理到站，作为统计单位                                 |
| `PredictionModelRevision` | 每 1–3 天生成的不可变候选/champion 模型                          |
| `ModelEvaluation`         | candidate 与 champion 在未来 crowd-reconstructed events 上的比较 |

这些对象可以先写成独立 JSON/TypeScript domain types；应在抓取真实公开数据并产生第一版 `ColdStartProjection` 后，再确定 Drizzle 数据库 migration。

## 七、真正的实施顺序

### Step 1：生成 cold-start projection dataset

输入：

- 已抓取的 CUHK Route/Stop/发车规则；
- 已审核 RoutePattern；
- Bus Clock 的公开站间样本；
- 公开站点坐标/路线几何（仅在需要并能验证 fallback 时）。

输出：每个 `RoutePattern × Stop` 的累计 P50/P10/P90、来源、样本量、fallbackLevel，以及哪些 Stop 只能显示“暂缺”。

这是现在应该做的下一步。

### Step 2：做用户站点卡片 UI

读取 cold-start dataset，显示下一班/下下班的预计时间，并提供“反馈实际到站”。先用 fixture/prototype 验证用户是否看得懂。

### Step 3：实现匿名反馈 API

保存 Route、Stop、到站时间和隐藏候选上下文。反馈不会直接修改 UI 时间。

### Step 4：实现 ArrivalEvent 重建

把同一物理到站的多条 observations 聚合；保留 Trip 候选概率、歧义和不确定性。

### Step 5：模型 shadow 与 1–3 天发布

先离线比较，不影响用户；积累足够未来反馈后才让 candidate 替换 cold-start/champion。

## 八、当前不可回避的两项风险

1. **Bus Clock 数据许可**：公开可见不自动等于可以重发布派生时间。生产采用前要确认数据许可；在此之前可以做隔离研究原型。
2. **反馈冷启动**：用户少时模型不会立刻变准。UI 必须继续使用粗粒度 prior，并且不能用很少的点击产生看似精确的局部高峰修正。

这两项风险不会阻止我们做 Step 1 的 staging dataset 和 UI prototype，但会阻止未经说明地把结果称作准确或正式生产 ETA。
