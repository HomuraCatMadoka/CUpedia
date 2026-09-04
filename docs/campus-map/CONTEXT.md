# 校园地图（Campus Map）

由社区核对的校园地点事实。CUpedia 身份独立于地图供应商、交互 scene 和其他地图表现。

## Language

### 身份与包含关系

**建筑（Building）**: 使用不可变、供应商无关 `buildingId` 的校园建筑容器；名称、别名、
代码、代表锚点和供应商映射均可修订。
_Avoid_: 用建筑名称、高德 POI ID 或代表坐标作为身份；设施 Place

**建筑检索名称（Building search name）**: 有来源、用于把用户查询导航到一个 canonical
Building 的名称。它通常是别名、缩写或异体字；只在证据表明名称指向同一个物理建筑时才能作为
别名。独立编号和代表坐标可以暂缺，不能据此把已确认的独立建筑降成另一栋楼的检索别名。
_Avoid_: 从名称相似创建重叠 Building；把独立建筑塞进建筑群别名；把检索命中当成已证实的 part-of 关系

**楼层（Floor）**: 归属于一个 Building、以建筑内不可变 `floorId` 标识的容器；显示标签
与排序可修订。
_Avoid_: 把 `G`、`LG`、`1/F` 等显示标签作为跨建筑身份

**地点（Place）**: 用户可以独立选择、核对、纠错或评价，并由管理员停用或恢复的一个物理服务
位置，使用不可变、供应商无关的 `placeId`；同楼、同层、同类型可以有多个 Place。
_Avoid_: Facility identity；类别聚合；以名称、距离或 `(buildingId, floorId, pinType)` 作唯一键

**图钉类型（Pin type）**: Place 的主要浏览类别与图标所引用的受控 key；首批为 `toilet`、
`water`、`printer`、`common-space`、`classroom`。
_Avoid_: scene category；用显示文案作 key；把访问或无障碍属性做成类型

**能力（Capability）**: 一个 Place 提供的可多选服务，如 `print`、`scan`、`copy`；一个
多功能服务位置仍是一个 Place。
_Avoid_: 每项能力复制一个 Place

**地点属性（Place facet）**: 与 Pin type 正交的受控事实；首批为
`gender: male | female | all-gender | unknown` 和
`wheelchairAccess: yes | limited | no | unknown`。
_Avoid_: 用图钉类型或自由文本隐含性别与无障碍

### 访问

**访问条件（Access condition）**: 分别记录 audience、Credential requirement、schedule、
reservation 与 temporary status 的结构化事实；`unknown` 不等于 unrestricted。
_Avoid_: 一个混合刷卡、开放时间、预约和临时关闭的 `access` 字符串

**凭证要求（Credential requirement）**: 进入 Place 所需凭证的受控值：`none`、
`campus-card`、`library-card`、`other` 或 `unknown`；audience 为 CUHK member 不自动表示必须刷卡。
_Avoid_: 从“公共空间”“厕所”或 audience 推断刷卡要求

### 位置

**位置断言（Location assertion）**: Place 的已证实位置为 Building、Building + Floor，或
带 CRS 与 Point precision 的 Outdoor geo point；containment 与点精度是正交事实。
_Avoid_: 综合置信分数；把建筑锚点复制成设施点

**建筑附属地点（Building-contained Place）**: 已确认归属于一个 Building、可进一步归属于
Floor 的 Place；这是校园设施贡献的主要模型，不能用与建筑锚点的距离自动推断归属。
_Avoid_: 建筑附近地点；把楼层未知理解成不属于建筑

**独立地点（Standalone Place）**: 不归属于 Building、以 Outdoor geo point 定位的 Place；
它是需要单独证实的例外，而不是用户未填写建筑时的默认结果。
_Avoid_: 未选择建筑；从地图中心自动生成的地点

**点精度（Point precision）**: `precise` 表示来源或现场核对直接识别该 Place 的实际服务
位置；`approximate` 表示估算或代表点，不能证明实际位置，精度不由小数位数推断。
_Avoid_: 因为存在坐标就标为 precise

**室内局部点（Indoor local point）**: Building + Floor 内、基于获授权或原创且已核实的
楼层几何表达的位置；在取得该数据前保持 deferred。
_Avoid_: PDF 像素；未配准的假经纬度

**室外地理点（Outdoor geo point）**: canonical CRS 为 WGS84 的室外点；GCJ-02 仅由高德
adapter 生成，来源的 HK80、HKPD 等原始 CRS 与转换 lineage 保留。
_Avoid_: 用 GCJ-02 覆盖 canonical/source claim；用 RPG ArtPoint 计算距离或路线

### 证据与治理

**来源（Provenance）**: 支撑事实修订的证据集合，记录稳定引用、拥有者、版本、访问日期、
使用权和限制；现场核对属于原创观察来源。
_Avoid_: 自由文本 `source`；把供应商 POI 当成可发布事实

新修订原样保留一个 precise 室外点时，只沿用 base revision 中实际支撑该精确位置的来源；
坐标或精度变化仍必须提交新的位置证据，不能因修改照片或其他字段而伪造一次位置观察。

**观察时间（Observed at）**: 来源实际观察现实状态的时间，适用于开放、临时关闭和设备
运行等易变事实。
_Avoid_: 网页 `Last-Modified`；抓取时间

**核对时间（Verified at）**: 一次明确的事后核对确认来源足以支持该事实修订的时间，与
核对者身份一起记录；直接发布本身不产生 Verified at，它也不替代 Observed at。
_Avoid_: 把发布者等同核对者；用已核对暗示易变状态仍然实时有效

**编辑草稿（Edit draft）**: 一个用户编辑会话内尚未发布的 Place 变更，只对该用户可见，
不是服务器申请或公共事实。
_Avoid_: Application；待审核地点；把草稿 marker 放进其他用户的地图

**设施新增入口（Facility Add entry）**: 全局入口创建尚未选择 Building 的建筑附属 Place
草稿；Building 卡片入口显式带入该 Building 与当前 Floor；类别入口额外带入 Pin type。
入口来源属于草稿交互上下文，不是可发布事实；入口自动带入的值是任务初始状态，用户未修改时
关闭任务无需确认放弃。
_Avoid_: 根据当前选中卡片悄悄改变全局“新增设施”的含义；从地图中心或最近建筑推断归属

**变更集（Changeset）**: 一次用户任务原子发布的一组 Place 变化及其作者、说明、来源摘要
和复核请求；发布成功后不可改写，可以公开讨论并被后续变更集反向修订。
_Avoid_: 审批申请；用 open/closed 表示待审/批准；无作者的批量覆盖

**事实修订（Fact revision）**: Changeset 为一个 Place 产生的不可变事实版本；同一
Changeset 可以包含多个 Place 的新增、修改、停用或恢复修订。
_Avoid_: 原地覆盖 Current fact；可修改历史快照；把通用 audit log 当事实版本

**地点照片（Place photo）**: 描述一个具体 Place 外观、入口、内部、设备或无障碍情况的有序
图片，绑定到产生它的 Fact revision；当前版本每个 Place 最多三张，图钉类型只提供拍摄提示。
_Avoid_: 评价附件；图钉类型图库；跨地点共享照片；以图片作为 Place 身份

**照片视角（Photo role）**: 描述 Place photo 所展示内容的受控值，如入口、概览、内部、设备
或无障碍；同一组 role 可由不同 Pin type 显示成更贴近场景的拍摄提示。
_Avoid_: 图片标题；自由标签系统；为每个图钉类型建立独立 schema

**当前修订（Current revision）**: 一个 Place 最近成功发布的 Fact revision，包括 active、
retired 或 merged redirect；CAS、restore 和 merge 都以它作为当前版本。
_Avoid_: 只在 active Place 保存版本；把 Current revision 等同公开搜索投影

**复核请求（Review request）**: 发布者请求社区或管理员在发布后检查 Changeset 的公开
metadata；它提高 review feed 可见度，但不延迟或改变事实公开。
_Avoid_: Approval request；Pending 状态；把未勾选理解为已核对

**发布冲突（Publish conflict）**: Changeset 引用的任一 `baseRevisionId` 已不再是目标
Place 的 Current revision，因此整个发布不产生公共修订，草稿保留供用户基于最新版重新确认。
_Avoid_: 静默覆盖；自动字段合并；部分发布同一个 Changeset

**反向修订（Revert revision）**: 用新 Changeset 发布与某个旧变化相反的新 Fact revision，
而不删除、移动或改写既有历史。
_Avoid_: Rollback pointer；删除错误 revision；把本地 Undo 当公开 revert

**停用（Retirement）**: 管理员用必填理由表示 Place 已拆除、永久关闭或不再是独立
服务位置的可恢复事实修订；它从默认地图结果移除，但稳定 ID、deep link 和历史
继续存在。原 deep link 显示包含名称、状态、停用理由、稳定 ID 和公开历史的可读 tombstone；
只有管理员可以追加恢复修订。
_Avoid_: 临时故障；hard delete；重复 Place 合并

**内容隐藏（Redaction）**: 管理员因隐私、版权或法律原因限制某个历史版本内容的高风险
治理动作；它保留版本链和审计占位，不等同事实纠错或停用。
_Avoid_: 普通编辑删除历史；用 Redaction 隐藏产品错误

**治理举报（Moderation report）**: 用户私下提交、指向 Changeset、Fact revision、Map Note、
Note event 或贡献者的安全信号；举报人、证据和说明只对管理员可见，同一目标的多条举报汇入
同一个 Moderation case。
_Avoid_: 公开讨论；复制进 Changeset feed；把一条举报直接当作有罪裁决

**治理案件（Moderation case）**: 管理员围绕一个稳定目标处理多条举报的工作单，以 revision/CAS
推进 open、ignored、resolved 或 reopened；新举报会重新打开已经处理的案件。
_Avoid_: Place 编辑申请；可覆盖举报原文；一个目标并行创建互不相知的案件

**治理裁决（Moderation decision）**: 管理员执行隐藏、恢复公开、Redaction、撤销 Redaction、
贡献限制或案件状态变化时追加的不可变记录，保存 actor snapshot、理由、目标及 before/after。
_Avoid_: 用通用 audit log 替代；改写旧裁决；没有 decision ref 的高风险投影变化

**贡献限制（Contributor block）**: 在指定起止时间内限制某个贡献者发布 Place facts、参与 Map
Notes 或两者的管理员裁决；撤销只追加裁决和撤销 metadata，既有公开事实与署名保持不变。
_Avoid_: 全站账号删除；抹除旧署名；只在页面加载时检查一次

**地点反馈（Place feedback）**: 符合资格的 User 对一个 Place 维护的一份当前主观体验，包含
必填的 1–5 整数星级和可选评价文字；它引用稳定 `placeId`，但不属于 Place fact 或其修订历史。
_Avoid_: Map Note；Fact revision；一个用户在同一 Place 的多条并行评价；匿名反馈

**反馈隐藏（Feedback hide）**: 管理员让整份 Place feedback 退出公开读取和评分聚合的治理状态；
用户后续编辑不会自动恢复公开。
_Avoid_: 只隐藏评价文字但继续计算其星级；用户删除；Place retirement

**安全占位（Safe placeholder）**: 内容被隐藏后在原 stable ID、deep link 与时间线位置返回的固定
公开投影；不包含原文、证据或可识别作者，但让读者知道历史链没有被删除。
_Avoid_: 404 假装记录从未存在；把原文藏在搜索索引、excerpt 或通知 metadata

**重复候选（Duplicate candidate）**: 名称、Building、Floor、Pin type、来源或距离等信号
产生的待人工判断关系，不是唯一约束。
_Avoid_: 自动合并；认为同层只能有一个同类服务位置

**合并重定向（Merge redirect）**: 重复 Place 人工合并后，loser 保留为永久指向 survivor
的 tombstone；两者来源、历史链接和 ID 均保留。
_Avoid_: 删除或复用 loser ID；让旧 deep link 失效

**地图备注（Map Note）**: 围绕一个 canonical Place、一个 WGS84 地图位置或两者提出的公开问题与
补充上下文；它有独立生命周期，不能直接改变 Current fact。
_Avoid_: Changeset discussion；事实草稿；评分评论；用 Note 关闭代替发布修正

**备注事件（Note event）**: Map Note 时间线中的不可变 opening comment、comment、resolve 或
reopen 记录；后续动作只追加事件，不覆盖较早内容。
_Avoid_: 可编辑评论；原地改写状态历史；通用 audit log

**解决说明（Resolution）**: 显式关闭 Map Note 时记录的结构化理由，可引用真正修正事实的
Changeset；发布成功本身不会自动形成 Resolution。
_Avoid_: 发布回执；审批结果；没有理由的关闭

**备注订阅（Note subscription）**: User 是否接收某个 Map Note 后续事件提醒的独立偏好；作者与
评论者默认订阅，取消订阅不删除其事件或署名。
_Avoid_: Note 参与者身份；阅读状态；删除历史

**公开事实（Current fact）**: active Current revision 形成的公开搜索与地图投影；retired
Place 不再进入该投影，但保留可读 tombstone/deep link 与公开历史。Edit draft、供应商候选、
讨论和评分均不属于地点事实。
_Avoid_: 把直接发布称为批准；把 Review request 当可见性状态；用通用 audit log 代替事实修订

### 集成边界

**外部身份映射（Provider mapping）**: `(provider, providerPlaceId)` 到 canonical Building
或 Place 的显式治理记录。浏览页一次性预加载所需映射，热点点击只按完整外部 ID 在本地精确查表；
名称、别名和距离只能产生待人工核对的关联候选。
_Avoid_: 供应商 ID 作主键；名称模糊命中后静默关联；每次点击再请求服务器；异步卡片升级

**供应商热点（Provider hotspot）**: 高德底图已绘制、可点击的瞬时对象；它只负责告诉产品用户
点中了哪个高德对象。`providerPlaceId` 是映射输入，不是 CUpedia 身份；名称与坐标只用于显示。
_Avoid_: 把高德卡片当公开事实；用名称或距离猜 canonical 实体；把热点写入 URL

**Canonical 地图目标（Canonical map target）**: 浏览地图上可选择的 Building 或 Place 表现；
它可以来自 CUpedia 自绘设施 marker，或来自精确映射成功的供应商热点；解析后只由稳定 canonical
ID 打开正式卡片、URL 与添加设施等动作。
_Avoid_: 让 provider ID 进入 scene；正式卡片继续依赖 provider 名称或坐标

**瞬时供应商卡（Transient provider card）**: 热点没有映射，或映射预加载失败时显示的轻量参考卡；
它不进入 scene/history，不提供 canonical 动作，关闭后即消失。
_Avoid_: 将其保存为 Place；显示添加设施；后台查询后无提示地升级成另一张卡

**供应商位置参考（Provider location reference）**: 编辑室外位置时，地图供应商对当前坐标返回的
瞬时地址或附近 POI 文案；它帮助人辨认位置，但不是可选择实体，也不进入公开事实。
_Avoid_: Provider POI identity；Browse scene；从参考名称推断 Building 或 Place

**地图表现（Map presentation）**: canonical marker、类别聚合、楼层目录、scene 和 RPG ArtPoint
等引用 canonical ID 的 UI 投影。
_Avoid_: 从 scene shape 反推领域实体；presentation ID 成为 canonical identity；供应商 POI 充当产品 marker
