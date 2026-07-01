# 食堂（Canteen）

大众口味测评与避雷的子系统：管理员维护食堂与菜单，用户浏览菜单并投票/评论。

## Language

**食堂（Canteen）**: 一个物理用餐点（如某书院食堂），有名称与可选位置。
_Avoid_: 与「餐段」或「菜品」混称。

**菜品（Menu item）**: 某食堂在某餐段供应的一道菜，含名称、价格、餐段、排序与图标 key。
_Avoid_: 把菜品当成全局实体——菜品始终归属某个食堂。

**餐段（Meal period）**: `breakfast` | `lunch` | `dinner`；排序语义为早→午→晚，**不能**用字符串 `localeCompare`。
_Avoid_: 按字母序排列（会得到早→晚→午）。

**硬删除（Hard delete）**: 食堂与菜品无 `deletedAt`；删除行时 DB `ON DELETE CASCADE` 清理关联（votes/comments 表接入后同样适用）。
_Avoid_: 沿用 wiki 的软删除模式。

**Mock 模式（`CANTEEN_MOCK_DATA=true`）**: 仅开发用内存数据；种子只允许极简演示（如「演示食堂 / 演示菜品」），禁止写死真实食堂菜名。
_Avoid_: 把 mock 数据当作生产 seed。

## Related ADRs

- [0008 — 食堂硬删除与 mock 模式](../adr/0008-canteen-hard-delete-and-mock-mode.md)
- [0009 — 食堂匿名投票写权限](../adr/0009-canteen-anonymous-vote-only.md)
