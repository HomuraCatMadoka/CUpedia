---
status: accepted
---

# ADR 0040：Campus Map V2 只保存最小、可核对的地点事实

ADR 0034 的稳定 Building、Floor、Place 身份、位置证据、来源和供应商隔离继续有效。本决议取代
其中 Pin type 及 audience、进场凭证、预约条件组成的首版访问模型；历史 V1 revision 保持原样。
ADR 0038 的 canonical-only 浏览路径继续有效；本决议只改变 canonical Place 的事实结构，不改变
高德热点如何解析到 Building 或 Place。

## 决议

Place 的公开领域字段称为 `placeType`。它是搜索和筛选用的宽分类，不是图标、建筑身份或服务名称。
当前分类是 `toilet`、`water`、`printer`、`common-space`、`classroom`、
`sports-facility`、`health-service`，并预留 `vending-machine`。游泳池、牙科等具体服务使用 Place
名称表达，不建立只服务一个地点的新类型。数据库列暂时保留 `pin_type`，避免没有收益的表重写；
领域 read model、publish contract 与编辑草稿统一使用 `placeType`。

每个 V2 Place 只保存名称、Place type、canonical 位置、可选通常开放时间、官方操作、
到访提示、来源与核对资料。打印地点可保存 print/scan/copy，厕所可
保存性别；无障碍是适用于所有地点的可选受控事实。缺失字段表示尚未掌握，不能自动提升为任一值。

V2 不保存 audience、进场凭证或预约条件。预约页面、电话和详情页都是带清楚标签的官方操作；收费、
付款方式和登记要求等少量到访信息放在一条简短提示中。通常开放时间只表达香港时区的一般每周规律，
不声称实时营业；节假日或活动变化留在官方最新安排。易过期的临时营业状态不进入本版事实结构。

建筑仍是 canonical 容器，Place 是可以被独立识别和维护的服务地点。一个建筑只有一项
服务时无需增加中间层；只有当同一建筑内的服务具有不同名称、操作或
运营事实，例如保健处门诊与牙科，才拆成多个 Place。楼层不确定时保存 Building-only，不能从房间号、
网页文案或建筑锚点猜出 canonical Floor；室外设施则保存有来源和诚实精度的 WGS84 点。

代表数据以固定版本的人工核对 manifest 进入唯一 canonical publish seam。管理员可以一次原子发布
多个 Place；普通合资格用户仍只能一次发布一个 Place。导入器会在完整 revision 历史中以官方来源身份
和 provenance 对账，且只接受仍公开有效的唯一 Place；因此即使当前 revision 换了来源，重试仍不会
重复建 Place。manifest 不直写数据库、不承担
全量生产导入，也不引入 crawler、定时任务或第二套来源控制面。未来的官方页面抓取先生成差异供人确认，
再通过同一发布入口形成 revision。
同一 manifest 版本的首次导入必须用数据库锁跨进程串行；不能只依赖按 actor 隔离的发布幂等键。

V2 schema 与显示 metadata 只由 migration 安装和切换。应用不会在读取或发布时补造 schema；
缺失、仍为 draft 或 active 版本不唯一时直接失败，避免部署不完整却继续写入错误格式。
迁移会先验证生产审计结论“Current 中没有 V1”；若实际不符则整次迁移中止。启用后 Current 只接受
V2，而不可变 revision 历史继续接受 V1 与 V2。

本决议只决定数据边界，不决定新的地图卡、导航、搜索排序或管理后台界面。公开地图继续使用原有五类
浏览投影，并暂时过滤新增类型；V2 fact 通过兼容层读取时也不增加新的可见字段。新的展示与编辑方式
必须在独立 issue 中设计和验收。

## 后果

- 数据已经能支持以后展示“名称、位置、一条最有用事实和官方操作”，但本次不发布这套界面或导航。
- 新设施优先复用宽分类，分类数量不会随官网栏目或单个地点增长。
- V1 revision 仍由 V1 codec 读取；迁移只启用 V2 schema 和可空字段，不改写历史。
- 容量、座位类型、预约余量、课程空位、实时营业、自动同步、来源选择与管理界面需要独立证据与产品决策，不能从这些字段推导。
