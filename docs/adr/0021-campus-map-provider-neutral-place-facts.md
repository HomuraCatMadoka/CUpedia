# ADR 0021：Campus Map canonical facts 与供应商及地图表现分离

状态：Accepted

发布治理部分由 ADR 0022 取代；本文的 canonical identity、位置、来源与供应商边界继续有效。

## 决议

Campus Map 以 Building、Floor 和 Place 组成最小 canonical 事实模型。Building 是可搜索、
可选择并包含 Floor 的建筑容器；Floor 在 Building 内使用不可变身份；Place 是可独立核对、
纠错、停用或评价的物理服务位置。三者使用 CUpedia 管理的稳定、供应商无关 ID。名称、坐标、
楼层显示标签、地图供应商和 UI 表现变化都不改变这些 ID。

旧 RPG Campus Map 的稳定 Place ID、事实坐标与 ArtPoint 分离、SourceRef 和集中引用校验原则
继续采用，但不恢复旧 `PlaceNode` / `PlaceKind` 形状。该形状把 building、landmark 等用户
地点与 portal、path-junction、route-waypoint 等路网节点及 region-hub 表现锚点放入同一
union，并强制所有节点拥有 Region 和 ArtPoint。canonical 地点事实不依赖 RPG 构图；未来
路网节点和地图表现分别建模。

Place 的 containment 与位置证据分开表达。Place 可以只确认位于 Building、进一步确认到
Floor，或具有带 CRS 与 approximate/precise 精度的室外地理点。建筑锚点不能冒充设施点；
仅有 Floor 证据的 Place 进入楼层目录而不伪造室内 marker。室内局部点只有在取得获授权或
原创且已核实的楼层几何后才加入。canonical 室外坐标使用 WGS84；GCJ-02 只在高德 adapter
边界产生，来源的原始 CRS 与转换 lineage 保留。

Pin type 是受控的浏览目录，不是身份。首批 key 为 `toilet`、`water`、`printer`、
`common-space`、`classroom`；性别、无障碍、开放对象、时段、预约和临时关闭分别作为能力、
访问或状态事实。同一个多功能服务位置可以有多项能力，但仍是一个 Place。同一 Building、
Floor 和 Pin type 可以有多个 Place；这些字段与名称、距离只能生成 duplicate candidate，
不能成为唯一键或触发自动合并。

访问限制分成 audience、credential requirement、schedule、reservation 与 temporary status。
凭证要求使用 `none`、`campus-card`、`library-card`、`other` 或 `unknown`；CUHK member audience
不自动意味着必须刷卡。性别和无障碍使用独立受控 facet，不从厕所或公共空间类别推断。

点精度由证据性质决定而不是由坐标小数位数决定：`precise` 只用于来源或现场核对直接识别
该 Place 实际服务位置的点；估算、建筑代表点或不能证明实际位置的点一律为 `approximate`。

每个可发布事实修订都必须引用来源，并区分 source accessed date、现实 Observed at 和可选的
Verified at。`unknown` 不提升为 unrestricted、true 或 false；显示精度绝不高于证据。直接
发布、Changeset、冲突与事后治理由 ADR 0022 决定。重复 Place 的人工合并保留 survivor，
并把 loser 保留为永久 redirect/tombstone；普通停用是可恢复的 retired，ID 不删除、不复用。

供应商 POI 通过显式 `(provider, providerPlaceId)` 映射到 canonical ID。名称或距离匹配只能
产生待人工关联候选。scene kernel、URL/history state、列表聚合、cluster、provider InfoWindow
和 RPG ArtPoint 都是 presentation；它们引用 canonical ID，但不能成为事实来源或另建身份。

## 后果

- 搜索、deep link、讨论、Changeset、高德地图和未来 RPG/路线投影可以共享稳定身份。
- 同层同类的多个厕所、饮水点或打印点不会因唯一约束或聚合表现而丢失。
- 只有楼层证据时可以显示多个独立目录项，但不能在建筑中心堆叠假装精确的 marker。
- 更换地图供应商或修正坐标不会迁移 Place；provider ID 与转换坐标不会污染 canonical fact。
- 首批模型无法提供精确室内图钉或逐步导航；这些能力必须等待合法、真实且经过核实的数据。
- #565、#646 和 #647 必须消费本决议的身份、位置、来源和公开事实边界，不能各自发明字段语义。
