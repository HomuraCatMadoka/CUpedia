# 食堂（Canteen）

大众口味测评与避雷的子系统：管理员维护食堂与菜单，用户浏览菜单并投票/评论。

## Language

**食堂（Canteen）**: 一个物理用餐点（如某书院食堂），有名称与可选位置。
_Avoid_: 与「餐段」或「菜品」混称。

**菜品（Menu item）**: 某食堂在某餐段供应的一道菜，含名称、价格、餐段、排序与图标 key。
_Avoid_: 把菜品当成全局实体——菜品始终归属某个食堂。

**餐段（Meal period）**: `breakfast` | `lunch` | `dinner`；排序语义为早→午→晚，**不能**用字符串 `localeCompare`。
_Avoid_: 按字母序排列（会得到早→晚→午）。

**餐段 Tab**: 食堂详情页早/午/晚切换；默认 Tab 在**客户端**按 `Asia/Hong_Kong` 计算（页面可缓存）。规则见 PRD / `canteen-meal-period.ts`（11:30→午，17:30→晚；14:30–17:29 午后提示）。

**大众推荐 / 大众避雷**: 按当前餐段过滤菜品后排序；推荐榜 likes↓、同分 like−dislike↓；避雷榜 dislikes↓、同分 dislike−like↓。仅统计非 NULL 票。

**菜品评论**: 仅登录用户可发/改/删自己的短评（纯文本，≤500 字，拒绝 HTML）；匿名不可发。发即展示，无审核队列。评论不影响赞踩排行。Admin 可删任意评论。

**硬删除（Hard delete）**: 食堂与菜品无 `deletedAt`；删除行时 DB `ON DELETE CASCADE` 清理关联 votes 与 comments。
_Avoid_: 沿用 wiki 的软删除模式。

**Mock 模式（`CANTEEN_MOCK_DATA=true`）**: 仅开发用内存数据；种子只允许极简演示（如「演示食堂 / 演示菜品」），禁止写死真实食堂菜名。
_Avoid_: 把 mock 数据当作生产 seed。

## Related ADRs

- [0008 — 食堂硬删除与 mock 模式](../adr/0008-canteen-hard-delete-and-mock-mode.md)
- [0009 — 食堂匿名投票写权限](../adr/0009-canteen-anonymous-vote-only.md)
