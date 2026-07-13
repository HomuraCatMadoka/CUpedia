# Context Map

CUpedia 现有五个限界上下文。

## Contexts

- [权限与用户管理](./CONTEXT.md) — CUHK 学生 wiki 的身份与访问控制
- [课程技能树](./docs/course-tree/CONTEXT.md) — 游戏化的课程探索与"构筑"分享（新生向）
- [分院帽](./docs/college-picker/CONTEXT.md) — 给新生的书院志愿推荐工具（选书院，新生向）
- [课程测评](./docs/course-review/CONTEXT.md) — 课程口碑：打分 / 匿名评论 / 点赞（读匿名公开，写需登录）
- [食堂测评](./docs/canteen/CONTEXT.md) — 食堂菜单、菜品评价与菜单导入

## Relationships

- **课程技能树 → 权限与用户管理**: 构筑（Build）归属于某个 User。匿名可浏览/试玩（瞬时、不保存），CUHK 登录方可保存；分享为 Phase 2，沿用"读公开/写受限"。
- **课程技能树 ↔ wiki**: MVP **不互链**（技能树为独立子系统）。
- **课程测评 ↔ 课程技能树**: 共享同一份 `courses` 课程目录，以**课号**为锚点（技能树的「节点」＝ 测评的一门课）。但领域不同——技能树**探索/规划**选课路径、测评**沉淀口碑**，各存各的数据、MVP **不互链**。
- **课程测评 → 权限与用户管理**: 评分 / 评论 / 点赞归属 User；读匿名公开、写需 CUHK 登录；作者或管理员可撤回评论（沿用"读公开/写受限" + admin 治理）。
- **分院帽 ↔ 课程技能树**: 都新生向，但领域不同——分院帽选**书院**、技能树选**课**，语言不重叠，**不互链**。注意分院帽的「专业大类」（5 个粗分桶）**不是**技能树的「主修」。
- **食堂测评 → 权限与用户管理**: 菜品评论及已登录投票归属于 User；匿名访客也可投票，写操作继续受封禁状态约束。

课程技能树的奠基性决策见 [docs/adr/0005](./docs/adr/0005-course-tree-data-provenance.md)、[0006](./docs/adr/0006-explorer-not-graduation-auditor.md)；食堂测评的边界决策见 [docs/adr/0007](./docs/adr/0007-canteen-bounded-context.md)。
