# 校园地图（Campus Map）

由社区核对的校园地点事实。CUpedia 身份独立于地图供应商、交互 scene 和其他地图表现。

## Language

### 身份与包含关系

**建筑（Building）**: 使用不可变、供应商无关 `buildingId` 的校园建筑容器；名称、别名、
代码、代表锚点和供应商映射均可修订。
_Avoid_: 用建筑名称、高德 POI ID 或代表坐标作为身份；设施 Place

**楼层（Floor）**: 归属于一个 Building、以建筑内不可变 `floorId` 标识的容器；显示标签
与排序可修订。
_Avoid_: 把 `G`、`LG`、`1/F` 等显示标签作为跨建筑身份

**地点（Place）**: 用户可以独立选择、核对、纠错、停用或评价的一个物理服务位置，使用
不可变、供应商无关的 `placeId`；同楼、同层、同类型可以有多个 Place。
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
_Avoid_: 自由文本 `source`；把供应商 POI 当成已批准事实

**观察时间（Observed at）**: 来源实际观察现实状态的时间，适用于开放、临时关闭和设备
运行等易变事实。
_Avoid_: 网页 `Last-Modified`；抓取时间

**核对时间（Verified at）**: 审核者确认来源足以支持该事实修订的时间，与审核者身份一起
记录；它不替代 Observed at。
_Avoid_: 用已核对暗示易变状态仍然实时有效

**重复候选（Duplicate candidate）**: 名称、Building、Floor、Pin type、来源或距离等信号
产生的待人工判断关系，不是唯一约束。
_Avoid_: 自动合并；认为同层只能有一个同类服务位置

**合并重定向（Merge redirect）**: 重复 Place 人工合并后，loser 保留为永久指向 survivor
的 tombstone；两者来源、历史链接和 ID 均保留。
_Avoid_: 删除或复用 loser ID；让旧 deep link 失效

**公开事实（Current fact）**: 最近一份已批准且未退休的事实修订形成的公开投影；申请、
供应商候选、评论和评分均不属于地点事实。
_Avoid_: 待审核申请直接改变公共地图；用通用 audit log 代替事实修订

### 集成边界

**外部身份映射（Provider mapping）**: `(provider, providerPlaceId)` 到 canonical Building
或 Place 的显式映射；名称、别名和距离只能产生关联候选。
_Avoid_: 供应商 ID 作主键；名称模糊命中后静默关联

**地图表现（Map presentation）**: marker、类别聚合、楼层目录、provider POI、scene 和 RPG
ArtPoint 等引用 canonical ID 的 UI 投影。
_Avoid_: 从 scene shape 反推领域实体；presentation ID 成为 canonical identity

**延后字段（Deferred fields）**: 在真实、获授权且核实的数据到位前不进入首批模型的室内
几何、地理配准、Portal、Physical routing graph、逐段限制、垂直设施与实时设备状态。
_Avoid_: 为未来路线预填假数据；把 unknown 写成 false
