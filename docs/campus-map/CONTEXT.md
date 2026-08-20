# 校园地图（Campus Map）

由社区核对的校园地点事实。建筑、楼层和服务位置使用 CUpedia 身份；地图供应商、
交互 scene、列表和 RPG 地图只是这些事实的不同投影。

## Language

**建筑（Building）**: 有不可变、供应商无关的 `buildingId` 的校园建筑容器。名称、
别名、建筑代码、代表锚点和外部供应商映射可以修订，但不改变身份。建筑可被搜索和
选择，并包含零个或多个 Floor。
_Avoid_: 用建筑名称、高德 POI ID 或代表坐标作为建筑身份；把建筑强制建模成设施 Place。

**楼层（Floor）**: 归属于一个 Building、以建筑内不可变 `floorId` 标识的容器。
显示标签与排序可修订而不改变身份；同一个 `floorId` 不要求在其他建筑中具有相同含义。
_Avoid_: 把 `G`、`LG`、`1/F` 等可改的显示标签直接作为跨建筑 canonical identity。

**地点（Place）**: 用户可以独立选择、核对、纠错、停用或评价的一个物理服务位置，
拥有不可变、供应商无关的 `placeId`。Place 可以由 Building 包含，并在证据足够时进一步
归属于 Floor；室外 Place 可以没有 Building。同楼、同层、同类型可以存在多个 Place。
_Avoid_: 用 `(buildingId, floorId, pinType)`、名称或相近距离作为唯一键；把类别聚合当成 Place。

**地点身份（Place identity）**: 一个可独立维护的物理服务位置，而不是设备台数或地图
图标。平面图上两个可区分的同类服务位置是两个 Place；一个多功能打印、扫描、复印位置
是一个 Place，具有多项 Capability。改名或修正坐标不改变 `placeId`，ID 永不复用。
_Avoid_: 把一个多功能服务点拆成三个 Place；因暂时缺少精确坐标而合并两个已区分的位置。

**图钉类型（Pin type）**: 决定 Place 的主要浏览类别和图标的受控目录项，使用不可变 key。
首批目录为 `toilet`、`water`、`printer`、`common-space`、`classroom`；真实首批 seed 范围由
#557 决定。类别可扩展，但不能用显示文案作为 key。
_Avoid_: 把性别、无障碍、开放对象或实时状态做成互斥 Pin type；把 scene 的 `category`
字段当作 Place 身份。

**能力（Capability）**: 一个 Place 提供的可多选服务，例如 `print`、`scan`、`copy`。
Capability 补充 Pin type，但不创建新的 Place 身份。
_Avoid_: 因一个地点提供多项服务而复制地点记录。

**访问条件（Access condition）**: 与位置和 Pin type 分离的结构化准入事实，分别表达
受众（如 public、CUHK member、其他受限群体或 unknown）、适用时段、是否预约及临时关闭。
`unknown` 不等于 unrestricted；自由文本只可作为补充说明。开放时间、无障碍声明和设备
运行状态是不同事实，不由“公共空间”或“厕所”类别推断。
_Avoid_: 用一个 `access` 字符串混合刷卡、开放时间、预约和无障碍；把“公众可达”解释为
全天开放。

**位置断言（Location assertion）**: 对 Place 已有位置证据的诚实表达，而不是综合置信
分数。首批允许三种产品状态：只确认在某 Building；确认在某 Building 的某 Floor；以及
有来源、坐标系和 approximate/precise 精度的室外地理点。未来只有取得获授权或原创且已
核实的楼层几何后，才增加 `buildingId + floorId + localGeometry` 的室内局部点。
_Avoid_: 把建筑锚点复制成设施坐标；从楼层 PDF 像素伪造室内点；因为有坐标就猜测精度。

**建筑级位置（Building location）**: 只确认 Place 在某 Building 内，未知 Floor 和室内
位置。建筑级地图按 Pin type 聚合存在性，详情仍可保留多个独立 Place。
_Avoid_: 在建筑中心堆叠多个看似精确的设施 marker。

**楼层级位置（Floor location）**: 确认 Place 属于某 Building 的某 Floor，但没有可发布
的室内局部点。同层多个 Place 显示为多个目录项，并标明具体位置尚未测绘。
_Avoid_: 为了能画 marker 而把来源图片上的相对位置当作可复用坐标。

**室外地理点（Outdoor geo point）**: 带显式 CRS 和 approximate/precise 精度的室外位置
断言。canonical 室外坐标为 WGS84；HK80、HKPD 等来源坐标与转换记录保留在来源断言中，
高德所需 GCJ-02 只在 provider adapter 边界产生。
_Avoid_: 把 GCJ-02 回写覆盖 WGS84/source claim；让 RPG ArtPoint 参与距离或路线计算。

**来源（Provenance）**: 支撑一个可发布事实的证据集合，至少记录来源类型、稳定引用或 URL、
来源拥有者、版本或快照哈希（如有）、访问日期、公开使用权与限制。现场核对使用原创观察
作为来源。来源附着于不可变的已批准事实修订，而不是仅挂在当前 Place 上。
_Avoid_: 只保存一个自由文本 `source`；把供应商 POI 当成无条件可信的 canonical fact。

**观察时间（Observed at）**: 来源实际观察现实状态的时间。适用于开放、临时关闭、设备
运行等会快速变化的事实；未知时保持 unknown。
_Avoid_: 把网页 HTTP `Last-Modified` 或抓取时间当成现实观察时间。

**核对时间（Verified at）**: 审核者确认一组来源足以支持该事实修订的时间，并与审核者
身份一起记录。它不替代 Observed at。
_Avoid_: 用“已核对”暗示易变状态仍然实时有效。

**外部身份映射（Provider mapping）**: `(provider, providerPlaceId)` 到 canonical Building
或 Place 的显式映射。名称、别名和距离只能产生关联候选；地图供应商可替换，映射变化不
改变 canonical ID。
_Avoid_: 用高德 POI ID 作主键；名称模糊命中后静默建立正式关联。

**重复候选（Duplicate candidate）**: 由规范化名称、Building、Floor、Pin type、来源或
距离等信号产生、等待人工判断的两个 Place。候选不是唯一约束，也不能自动合并。
_Avoid_: 认为同层只能有一个厕所、饮水点或打印点。

**合并重定向（Merge redirect）**: 人工确认重复后，保留 survivor Place，loser 进入
`merged` tombstone 并永久重定向到 survivor；两者来源、历史链接和修订记录都保留。
公开 Place 的普通停用使用可恢复的 `retired`，不硬删除、不复用 ID。谁能批准、拒绝、撤回、
回滚或合并由 #565 定义。
_Avoid_: 删除 loser、把旧 ID 改成新 ID，或让旧 deep link 失效。

**公开事实（Current fact）**: 最近一份已批准且未退休的事实修订所形成的公开投影。
申请、审核草稿和供应商候选不属于公开事实；评论和评分也不写入 Place 事实。
_Avoid_: 让待审核申请直接改变公开地图；用通用 admin audit log 代替事实修订历史。

**地图表现（Map presentation）**: Building marker、类别聚合、楼层目录、provider POI、
scene 和 RPG ArtPoint 等 UI 投影。选择与 deep link 落到 canonical ID，类别只负责筛选。
_Avoid_: 从当前 scene shape 反推领域实体；让 presentation ID 成为 canonical identity。

**延后字段（Deferred fields）**: 室内局部坐标与楼层几何、地理配准控制点、Portal、
Physical routing graph、逐段通行限制、垂直设施与实时设备状态。在取得真实、获授权且核实的
楼层或路线数据前，这些字段不进入首批模型；完整申请状态机由 #565 定义。
_Avoid_: 为未来路线预先填充假数据或把 unknown 写成 false。

## Related ADRs

- [0021 — Campus Map canonical facts are provider- and presentation-neutral](../adr/0021-campus-map-provider-neutral-place-facts.md)
