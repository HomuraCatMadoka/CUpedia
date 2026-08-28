# Context Map

CUpedia 现有七个限界上下文。

## Contexts

- [权限与用户管理](./CONTEXT.md) — CUHK 学生 wiki 的身份与访问控制
- [课程技能树](./docs/course-tree/CONTEXT.md) — 游戏化的课程探索与"构筑"分享（新生向）
- [分院帽](./docs/college-picker/CONTEXT.md) — 给新生的书院志愿推荐工具（选书院，新生向）
- [课程测评](./docs/course-review/CONTEXT.md) — 课程口碑：打分 / 匿名评论 / 点赞（读匿名公开，写需登录）
- [食堂测评](./docs/canteen/CONTEXT.md) — 食堂菜单、菜品评价与菜单导入
- [通知](./docs/notifications/CONTEXT.md) — 汇集各业务上下文面向 User 的站内消息
- [校园地图](./docs/campus-map/CONTEXT.md) — 经核对的建筑、楼层、地点与访问事实

## Relationships

- **课程技能树 → 权限与用户管理**: 构筑（Build）归属于某个 User。匿名可浏览/试玩（瞬时、不保存），CUHK 登录方可保存；分享为 Phase 2，沿用"读公开/写受限"。
- **课程技能树 ↔ wiki**: MVP **不互链**（技能树为独立子系统）。
- **课程测评 ↔ 课程技能树**: 共享同一份 `courses` 课程目录，以**课号**为锚点（技能树的「节点」＝ 测评的一门课）。但领域不同——技能树**探索/规划**选课路径、测评**沉淀口碑**，各存各的数据、MVP **不互链**。
- **课程测评 → 权限与用户管理**: 评分 / 评论 / 点赞归属 User；读匿名公开、写需 CUHK 登录；作者或管理员可撤回评论（沿用"读公开/写受限" + admin 治理）。
- **课程测评 → 通知**: 其他 User 回复课程评论时，课程测评提供来源事实与原评论作者；通知上下文负责向该作者投递站内消息，自回复不投递。
- **分院帽 ↔ 课程技能树**: 都新生向，但领域不同——分院帽选**书院**、技能树选**课**，语言不重叠，**不互链**。注意分院帽的「专业大类」（5 个粗分桶）**不是**技能树的「主修」。
- **食堂测评 → 权限与用户管理**: 菜品评论及已登录投票归属于 User；匿名访客也可投票，写操作继续受封禁状态约束。
- **通知 → 权限与用户管理**: 每条通知归属于唯一 User，只有该 User 可以读取或改变自己的阅读状态。
- **校园地图 → 权限与用户管理**: 地点申请与事实审核引用 User；Current facts 与公开追溯资料的可见性不因查看者身份改变。消耗高德配额的 `/campus-map` runtime、config 和 provider search 依 #759 要求登录；申请与治理权限由 #565 定义。
- **校园地图 ↔ 地图供应商**: Campus Map 保存供应商无关的 canonical Building / Place 身份与 WGS84 室外事实；高德 POI、GCJ-02 和交互 scene 只通过 adapter 与显式映射投影。
- **校园地图 ↔ 评论与评分**: 评论和评分引用 canonical `placeId`，但不属于地点事实或其来源/修订历史。

课程技能树的奠基性决策见 [docs/adr/0005](./docs/adr/0005-course-tree-data-provenance.md)、[0006](./docs/adr/0006-explorer-not-graduation-auditor.md)；食堂测评的边界决策见 [docs/adr/0007](./docs/adr/0007-canteen-bounded-context.md)；通知与来源的生命周期决策见 [0016](./docs/adr/0016-notification-source-lifecycle.md)；校园地图的 canonical 事实边界见 [0021](./docs/adr/0021-campus-map-provider-neutral-place-facts.md)。
