# Context Map

CUpedia 现有三个限界上下文。

## Contexts

- [权限与用户管理](./CONTEXT.md) — CUHK 学生 wiki 的身份与访问控制
- [课程技能树](./docs/course-tree/CONTEXT.md) — 游戏化的课程探索与"构筑"分享（新生向）
- [分院帽](./docs/college-picker/CONTEXT.md) — 给新生的书院志愿推荐工具（选书院，新生向）

## Relationships

- **课程技能树 → 权限与用户管理**: 构筑（Build）归属于某个 User。匿名可浏览/试玩（瞬时、不保存），CUHK 登录方可保存；分享为 Phase 2，沿用"读公开/写受限"。
- **课程技能树 ↔ wiki**: MVP **不互链**（技能树为独立子系统）。规划中的"课程测评系统"将以**课号**为锚点，届时再建立节点 ↔ 测评/wiki 的关联。
- **分院帽 ↔ 课程技能树**: 都新生向，但领域不同——分院帽选**书院**、技能树选**课**，语言不重叠，**不互链**。注意分院帽的「专业大类」（5 个粗分桶）**不是**技能树的「主修」。

课程技能树的奠基性决策见 [docs/adr/0005](./docs/adr/0005-course-tree-data-provenance.md)、[0006](./docs/adr/0006-explorer-not-graduation-auditor.md)。
