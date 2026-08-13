# 食堂（Canteen）

大众口味测评与避雷的子系统：管理员维护食堂与菜单，用户浏览菜单并投票/评论。

## Language

**食堂（Canteen）**: 一个物理用餐点（如某书院食堂），有名称、可选位置与可选公告。
_Avoid_: 与「餐段」或「菜品」混称。

**公告（Announcement）**: 管理员维护的短提示，展示在食堂详情页名称下方、弹幕上方（无边框灰底），用于外带加价、随餐饮品加价等说明；空则不展示。
_Avoid_: 用弹幕或菜品名承载固定营运说明。

**菜品（Menu item）**: 某食堂供应的一道菜，含名称、价格选项、餐段赋值、排序与图标 key；一道菜一个 UUID，赞踩与评论挂在该 UUID 上，跨餐段共享。
_Avoid_: 把菜品当成全局实体——菜品始终归属某个食堂。

**价格选项（Price option）**: 菜品可以没有价格，也可以有一个或多个带可选标签的价格。金额以最小货币单位保存（`amountMinor`；HKD 18 元为 `1800`），公开 DTO 固定为 `pricing.options[]`。UI 遍历选项，不识别「凍」「熱」等具体标签（标签与金额分行展示）。旧 `canteen_menu_items.price` 仅供迁移期读取，所有新写入进入 `canteen_menu_item_prices`。逸夫饮品凍/热样板见 [`examples/shaw-drink-pricing-sample.json`](examples/shaw-drink-pricing-sample.json)（金额为展示样板，需对照 Café Shaw 实价校对）。
_Avoid_: UI 直接读取数据库列；用标签文本作为程序标识；把套餐饮品加价合并进独立售卖价格。

**餐段赋值（Meal periods）**: 每道菜存 `meal_periods text[]`，取值 `breakfast` | `lunch` | `dinner` | `allday`。可多选具体餐段（如午餐+晚餐同一 UUID）；`allday` 与具体餐段互斥，归一化为 `["allday"]`。缺省/缺失导入字段默认为 `["allday"]`。仍接受旧标量 `mealPeriod` 并转为单元素数组。
_Avoid_: 用字符串 `localeCompare` 排序餐段；把「全天」做成可见 Tab。

**餐段 Tab**: 仅 `breakfast` | `lunch` | `dinner`；由菜品上的*具体*餐段决定是否展示（`allday` 不单独开 Tab）。全天菜出现在每个*已显示*的早/午/晚 Tab 下。若整店只有 `allday` → 隐藏餐段 Tab，直接展示全部菜品。只做午餐仍显示「午餐」。默认 Tab 在**客户端**按 `Asia/Hong_Kong` 计算并夹到可用餐段。规则见 PRD / `canteen-meal-period.ts`（11:30→午，17:30→晚；仅当同时有午/晚时，14:30–17:29 显示午后提示）。

**红榜 / 黑榜**: 按当前餐段过滤菜品后排序（含该餐段赋值或 `allday`）；红榜 likes↓、同分 like−dislike↓；黑榜 dislikes↓、同分 dislike−like↓。仅统计非 NULL 票。视图 Tab 顺序为红榜 → 黑榜 → 菜单。

**菜品评论**: 仅登录用户可发/改/删自己的短评（纯文本，≤500 字，拒绝 HTML）；匿名不可发。发即展示，无审核队列。评论不影响赞踩排行。Admin 可浏览全站评论时间线并删除任意评论；封禁用户走用户管理，不在评论页内完成。

**JSON 菜单输入**: 菜品输入字段含 name、pricing.options、mealPeriods（或旧 mealPeriod）、sortOrder、svgKey。`svgKey` 存分区键：爬虫来源有店家分类时写入原文分类名；无分类时才按菜名推断为旧版 `rice`/`noodle`/…。迁移期仍接受整数港币 `price` 并转换为单一 HKD 选项。旧 append-only action 仅为兼容保留，不用于周期性来源同步。善衡多规格示例见 [`examples/shho-pricing-sample.json`](examples/shho-pricing-sample.json)。

**外部菜单同步**: Admin 粘贴含 `source`、`items[].externalKey` 的完整来源快照，必须先 dry-run 再应用。匹配优先使用外部身份；首次可用规范化菜名 + 餐段集合接管唯一旧菜。来源中消失的菜改为 `isAvailable = false`，不删除 UUID、投票或评论。Aigens 可按来源餐段拆成多行（`backendId:lunch` 等）；当供应商把同一商品建模为共享供应时，也可用稳定 product ID 对应一个多餐段 UUID。`takeOverLegacyItems: true` 只用于经过管理员预览确认的首次全量接管；周期任务必须强制为 false。有分类时保留店家分类作 `svgKey`，不以菜名重分类。善衡生成器为 `scripts/generate-shho-menu-sync.ts`，当前快照见 [`data/shho-menu-sync.json`](data/shho-menu-sync.json)，审核结果见 [`data/shho-menu-sync-report.md`](data/shho-menu-sync-report.md)。
_Avoid_: 用菜名作为长期同步 key；先清空菜单再导入；把普通追加导入当全量来源快照；无 dry-run 直接接管 legacy 菜品；有店家分类时再按菜名重分。

**菜单来源（Menu source）**: 周期性读取某个供应商门店菜单的配置与同步状态。它标识 provider、外部门店身份及非敏感读取参数；其职责止于产生规范化菜单快照。供应商响应先经过单次同步期间的临时 provider schema，数据库只保存公开展示和稳定关联所需的字段。
_Avoid_: 把上游完整 JSON、匿名 token、会员身份、购物车、优惠码或支付状态写入菜单来源；在页面或 cron 中直接拼供应商请求。

**菜单快照（Menu snapshot）**: 某一观察时刻从菜单来源取得并通过 provider schema 校验的完整公开菜单事实。快照可因营业时段、停售或库存而变化；空响应不自动表示整店永久下架。规范化后才成为本系统的菜品与价格选项。
_Avoid_: 把一次抓取当成供应商永久目录；闭店或上游故障时用空快照覆盖最近成功菜单。

**点餐交接（Ordering handoff）**: 将用户交给供应商官方页面继续选择规格、使用本人优惠、创建订单并付款的稳定入口。交接保存人工确认的完整 URL 及 provider；其 mode、table、multi/location 等参数是入口身份的一部分。它与菜单来源相互独立：同一食堂可从公开 API 同步菜单，却通过品牌域名或扫码 URL 点餐。
_Avoid_: 从 `externalStoreId` 猜点餐 URL；把 QR 图片路径当业务入口；保存带临时 session/order/token 的 URL；由 CUpedia 代理真实下单或支付。

**促销提示（Promotion notice）**: 从公开菜单或活动规则观察到的非权威优惠说明。它只用于提示用户去官方页面确认资格与实付金额，不代表本系统授予优惠。
_Avoid_: 把客户端计算的会员价当权威价格；保存卡号、会员等级、coupon redemption 或供应商登录态。

**硬删除（Hard delete）**: 食堂与菜品无 `deletedAt`；删除行时 DB `ON DELETE CASCADE` 清理关联 votes 与 comments。
_Avoid_: 沿用 wiki 的软删除模式。

**Mock 模式（`CANTEEN_MOCK_DATA=true`）**: 仅开发用内存数据；种子只允许极简演示（如「演示食堂 / 演示菜品」），禁止写死真实食堂菜名。
_Avoid_: 把 mock 数据当作生产 seed。

**首页入口**: `src/app/(main)/page.tsx` 食堂模块卡片已启用（无「即将上线」），链接 `/canteen`。公开区品牌为「山城食记」，副标题「还有食堂能吃吗」；视觉为冷色账本风，菜品图仅 SVG（`DishSvgIcon`），不做真实菜品摄影。标题同行右侧入口「每日💩堂榜」→ `/canteen/shit-rank`。浏览页分 **食堂区**（`canteens`）与 **外卖区**（`takeouts`，独立表）；外卖详情 `/canteen/takeout/{id}`。Admin「外卖管理」`/admin/takeouts` 平行于食堂管理（店家 + 菜单 CRUD；无赞踩/同步）。

**每日💩堂榜（Shame rank）**: 对**食堂**的 append-only 点踩日榜（非菜品）。票写入 `canteen_shame_votes` 永久保留；页面只聚合展示当日 `voteDate`（`Asia/Hong_Kong` 自然日）。访客可踩（ADR 0009 匿名 cookie）；截止前每日均可参与，可对多个食堂踩，同一食堂可连踩；不可取消，再点再加一票。匿名访客港时自然日最多 50 次踩，额度检查与插入在数据库事务中串行化。排行按当日踩数降序。管理员在站点设置维护包含当天的截止日期，缺省为 `2026-09-01`。实现见 `canteen-shame-rank.ts`、`canteen-shame-actions.ts`。
_Avoid_: 与菜品赞踩表混用；把日榜做成 upsert/可取消。

**菜品分区 / SVG 图标**: `svg_key` 存分区键（店家原文分类或旧版 `rice`/`drink` 等）。菜单按该键分组；已知英文 key 用固定中文标签与顺序，其余 key 用自身作标签排在其后。`DishSvgIcon` 经 `resolveDishIconKey` 映射常见中文分类名到图标，未知回退 `default`。`validateSvgKey()` 接受非空限长字符串，不再把未知值折成 `default`。

**E2E 种子**: `scripts/seed-data.ts` 含固定 UUID 的「演示食堂」与午餐菜品（`rice`/`bowl` svgKey），供 `e2e/canteen-menu-votes.spec.ts` 投票路径；`e2e/canteen-danmaku.spec.ts` 覆盖食堂页弹幕（#192）。命名遵循 [ADR 0007](../adr/0007-e2e-tests-named-by-feature.md)（按功能而非 issue 号）。

## Related ADRs

- [0008 — 食堂硬删除与 mock 模式](../adr/0008-canteen-hard-delete-and-mock-mode.md)
- [0009 — 食堂匿名投票写权限](../adr/0009-canteen-anonymous-vote-only.md)（含菜品赞踩与💩堂榜点踩）
- [0013 — 食堂价格选项与稳定 API 边界](../adr/0013-canteen-pricing-api-boundary.md)
- [0014 — 外部菜单同步保留菜品身份与历史](../adr/0014-canteen-external-menu-sync.md)
- [0021 — 菜单同步与点餐交接分离](../adr/0021-separate-menu-sync-from-ordering-handoff.md)
