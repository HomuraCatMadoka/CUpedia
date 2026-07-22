# 食堂（Canteen）

大众口味测评与避雷的子系统：管理员维护食堂与菜单，用户浏览菜单并投票/评论。

## Language

**食堂（Canteen）**: 一个物理用餐点（如某书院食堂），有名称、可选位置与可选公告。
_Avoid_: 与「餐段」或「菜品」混称。

**公告（Announcement）**: 管理员维护的短提示，展示在食堂详情页名称下方、弹幕上方（无边框灰底），用于外带加价、随餐饮品加价等说明；空则不展示。
_Avoid_: 用弹幕或菜品名承载固定营运说明。

**菜品（Menu item）**: 某食堂在某餐段供应的一道菜，含名称、价格选项、餐段、排序与图标 key。
_Avoid_: 把菜品当成全局实体——菜品始终归属某个食堂。

**价格选项（Price option）**: 菜品可以没有价格，也可以有一个或多个带可选标签的价格。金额以最小货币单位保存（`amountMinor`；HKD 18 元为 `1800`），公开 DTO 固定为 `pricing.options[]`。UI 遍历选项，不识别「凍」「熱」等具体标签（标签与金额分行强调展示）。旧 `canteen_menu_items.price` 仅供迁移期读取，所有新写入进入 `canteen_menu_item_prices`。逸夫饮品凍/热样板见 [`examples/shaw-drink-pricing-sample.json`](examples/shaw-drink-pricing-sample.json)（金额为展示样板，需对照 Café Shaw 实价校对）。
_Avoid_: UI 直接读取数据库列；用标签文本作为程序标识；把套餐饮品加价合并进独立售卖价格。

**餐段（Meal period）**: `breakfast` | `lunch` | `dinner`；排序语义为早→午→晚，**不能**用字符串 `localeCompare`。
_Avoid_: 按字母序排列（会得到早→晚→午）。

**餐段 Tab**: 食堂详情页早/午/晚切换；默认 Tab 在**客户端**按 `Asia/Hong_Kong` 计算（页面可缓存）。规则见 PRD / `canteen-meal-period.ts`（11:30→午，17:30→晚；14:30–17:29 午后提示）。

**大众推荐 / 大众避雷**: 按当前餐段过滤菜品后排序；推荐榜 likes↓、同分 like−dislike↓；避雷榜 dislikes↓、同分 dislike−like↓。仅统计非 NULL 票。

**菜品评论**: 仅登录用户可发/改/删自己的短评（纯文本，≤500 字，拒绝 HTML）；匿名不可发。发即展示，无审核队列。评论不影响赞踩排行。Admin 可浏览全站评论时间线并删除任意评论；封禁用户走用户管理，不在评论页内完成。

**OCR 菜单导入**: Admin 上传菜单图片 → 单一云 OCR 调用点（Google Vision，可 mock）→ 尽力解析为草稿 → 校对（含餐段/价格）→ 批量发布到 `canteen_menu_items`。走专用 Admin import API（非 `/api/upload`），内部复用 MinIO `uploadFile`。OCR 失败不阻断，可降级手工录入。图片上限 5MB。

**JSON 菜单输入**: 菜品输入字段含 name、pricing.options、mealPeriod、sortOrder、svgKey。迁移期仍接受整数港币 `price` 并转换为单一 HKD 选项。旧 append-only action 仅为兼容保留，不用于周期性来源同步。善衡多规格示例见 [`examples/shho-pricing-sample.json`](examples/shho-pricing-sample.json)。

**外部菜单同步**: Admin 粘贴含 `source`、`items[].externalKey` 的完整来源快照，必须先 dry-run 再应用。匹配优先使用外部身份；首次可用规范化菜名 + 餐段接管唯一旧菜。来源中消失的菜改为 `isAvailable = false`，不删除 UUID、投票或评论。`takeOverLegacyItems: true` 只用于经过预览确认的首次全量接管。善衡生成器为 `scripts/generate-shho-menu-sync.ts`，当前快照见 [`data/shho-menu-sync.json`](data/shho-menu-sync.json)，审核结果见 [`data/shho-menu-sync-report.md`](data/shho-menu-sync-report.md)。
_Avoid_: 用菜名作为长期同步 key；先清空菜单再导入；把普通追加导入当全量来源快照；无 dry-run 直接接管 legacy 菜品。

**硬删除（Hard delete）**: 食堂与菜品无 `deletedAt`；删除行时 DB `ON DELETE CASCADE` 清理关联 votes 与 comments。
_Avoid_: 沿用 wiki 的软删除模式。

**Mock 模式（`CANTEEN_MOCK_DATA=true`）**: 仅开发用内存数据；种子只允许极简演示（如「演示食堂 / 演示菜品」），禁止写死真实食堂菜名。
_Avoid_: 把 mock 数据当作生产 seed。

**首页入口**: `src/app/(main)/page.tsx` 食堂模块卡片已启用（无「即将上线」），链接 `/canteen`。公开区品牌为「山城食记」，副标题「还有食堂能吃吗」；视觉为冷色账本风，菜品图仅 SVG（`DishSvgIcon`），不做真实菜品摄影。

**菜品 SVG 图标**: `src/lib/canteen-svg-keys.ts` 定义品类 key（`default`、`rice`、`bowl`、`noodle`、`drink`、`dessert`）；`DishSvgIcon` 在菜单行展示，`data-svg-key` 供 e2e 断言。未知 key 回退 `default`；写入经 `validateSvgKey()` 白名单校验。菜单视图按 `svgKey` 分组展示（饭类→粉面→煲汤→小食→甜品→饮品），可用顶部分类 chips 筛选；排行榜仍为扁平列表。

**E2E 种子**: `scripts/seed-data.ts` 含固定 UUID 的「演示食堂」与午餐菜品（`rice`/`bowl` svgKey），供 `e2e/canteen-menu-votes.spec.ts` 投票路径；`e2e/canteen-danmaku.spec.ts` 覆盖食堂页弹幕（#192）。命名遵循 [ADR 0007](../adr/0007-e2e-tests-named-by-feature.md)（按功能而非 issue 号）。

## Related ADRs

- [0008 — 食堂硬删除与 mock 模式](../adr/0008-canteen-hard-delete-and-mock-mode.md)
- [0009 — 食堂匿名投票写权限](../adr/0009-canteen-anonymous-vote-only.md)
- [0013 — 食堂价格选项与稳定 API 边界](../adr/0013-canteen-pricing-api-boundary.md)
- [0014 — 外部菜单同步保留菜品身份与历史](../adr/0014-canteen-external-menu-sync.md)
