# 食堂（Canteen）

大众口味测评与避雷的子系统：管理员维护食堂与菜单，用户浏览菜单并投票/评论。

## Language

**食堂（Canteen）**: 一个可独立浏览的餐饮单位，有自己的名称、菜单与营运身份，以及可选位置和公告。同一物理地点内，若主饭堂、茶社或档口拥有独立供应商门店 ID、菜单、营业时间或点餐入口，则分别建成食堂页面；例如 PINME 5198「開心軒（學生飯堂）」与 5203「開心軒茶社」。
_Avoid_: 仅因地址或营办方相同就合并独立档口；与「餐段」或「菜品」混称。

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

**外部商品身份（External product identity）**: 一道供应商菜品在某个菜单来源内的稳定标识。CUpedia 的托管菜品身份是菜单来源 + provider-scoped product ID；PinMe 使用 product ID，Aigens 使用 backend ID，iCHEF 使用 `ichefUuid`（官方前端标注为 original setting item UUID）。iCHEF `menuItemsSnapshot.uuid` 是一次发布快照内的 occurrence，不是长期商品身份。餐段、名称、价格、分类和排序都是菜品事实或出现语境，不进入身份。同一商品跨餐段共享一个 CUpedia UUID；同一次供应商响应内，同一身份若出现不兼容名称或无法表达的价格事实则中止。不同时间的已接受观察之间允许正常改名和调价，由最新观察提供可变事实。
_Avoid_: 用菜名或供应商数组顺序作为长期身份；对所有供应商套用同一种 product ID 粒度；把 5198 的 product ID 放进 5203 的菜单来源。

**供应商菜单 occurrence（Provider menu occurrence）**: 供应商原始分类树在某个餐段或分类中对一道菜品的一次引用，不等于新的菜品身份。同一 PinMe product 可同时出现在推荐区和常规分类；同一 Aigens backend product 可同时出现在午餐、晚餐和多个分类。兼容 occurrence 合并餐段与价格语境；不兼容名称或同一语境的冲突价格必须中止。适配器先在供应商边界聚合 occurrence，再对最终商品身份执行唯一性校验；分类选择和价格排序采用固定规则，等价 occurrence 的排列不改变快照。
_Avoid_: 在读取分类树时立即把每个 occurrence 当成独立菜品；为消除重复而把分类加入长期身份；无条件保留第一个 occurrence 并丢弃其余价格或餐段事实。

**PINME 发布菜单拓扑（Published menu topology）**: `data.group` 是供应商返回的 broad group pool，只有被 `data.menu_group[].groups` 引用的 `group_id` 才属于本次顾客可见菜单。适配器对引用做有界去重，拒绝坏 ID、重复 group identity 与悬空引用；空引用集合不得退回遍历整个 group pool。只有结构完整、处于声明服务时段且带稳定 publication 标识的空菜单才是可确认观察；同一来源、餐段和 publication 必须在 10–45 分钟内连续空两次才可替换旧菜单，中间任何非空成功观察都会重置确认。快照 scope evidence 保存菜单组数、group pool 数、排序后的被引用 group ID、当前发布标识/窗口、服务时段与有界刷新提示，不保存原始响应。broad pool 的时间只可提示何时重读，其 products 不是菜单权威。不同 `product_id` 即使名称和价格相同也仍是不同菜品。
_Avoid_: 把 `data.group` 当成当前完整菜单；按名称和价格合并不同 `product_id`；遇到空或坏 `menu_group` 时回退到 broad catalog。

**供应商发布窗口（Provider publication window）**: 供应商在某段时间选择给顾客看的一个当前菜单，可小于 CUpedia 的早/午/晚餐段。例如午餐 Tab 内可先发布正餐，再发布下午茶。发布标识、被引用分组与时间窗口是切换证据；菜品数量和菜名不是。
_Avoid_: 认为一次午餐成功就代表整个 11:00–17:00 不再变化；用 broad catalog 或条数变化猜发布切换。

**外部菜单同步**: Admin 对已经配置的菜单来源提交含 `items[].externalProductId` 与快照完整性的来源快照，必须先 dry-run 再应用。首次接管只接受完整目录快照；目录缺席权威可更新整店活跃性，餐段当前活跃性只更新本次实际观察的餐段。菜品失去最后一个可见餐段时才改为 `isAvailable = false`；两者都对本次出现的稳定身份原地更新或恢复同一 UUID。周期任务只接受菜单来源 ID，并强制禁止接管。

**商品身份漂移（Product identity churn）**: 同一菜单来源在相邻快照中出现一批新 product ID，同时旧 ID 消失。观察期内只记录新增、消失与疑似一换一，不自动把新 ID 继承到旧菜品；疑似换 ID 或成批漂移必须保留最近成功菜单并等待审核。
成批身份替换必须同时有足量新增和消失 ID；单边新增或缺席不是身份替换。部分快照中的缺席没有活跃性权威，完整目录的异常大幅缺席另由 suspicious-drop 规则中止；同名旧/新 ID 等可核对的替换证据始终须审核。
_Avoid_: 让调用者同时传 source string 与 canteen ID；先清空菜单再导入；把普通追加导入当全量来源快照；无 dry-run 直接接管手工菜品。

**身份转换审计（Identity transition audit）**: 对一个被商品身份漂移阻断的菜单来源，记录当前 CUpedia UUID、旧/新 provider ID，以及规范化名称、价格和餐段的确定性事实快照。审计可提示唯一的替换候选，但候选本身不是批准。
_Avoid_: 把同名候选直接当成已确认的 UUID 继承；把审计报告当成可执行命令。

**身份转换批准（Identity transition approval）**: Reviewer 对某一精确身份投影显式批准外部 ID 替换或多个重复 UUID 归并到一个 survivor。它不批准新菜、缺席菜或活跃性变化；未明确映射的身份保持不变。
_Avoid_: 把整份菜单标记为完整来获得身份迁移权限；常驻白名单；全局放宽 churn 阈值；无版本的生产手工改行。

现有 v4 artifact 对完整性、scope、新增与缺席决定的携带只属于旧身份迁移的精确重放兼容边界，不赋予普通 Aigens 同步目录权威，也不是新的批准模型；不应再签发这类批准。v5 artifact 只表达显式身份替换、历史别名规范化与 UUID 归并；新增由同一次普通 partial 同步创建，缺席身份保持原活跃性。

**身份归并（Identity merge）**: 多个 UUID 被确认代表同一道菜时，将外部身份与历史归并到一个 survivor UUID，其余重复身份不再独立活跃。身份归并解决重复身份，不表达菜品当前是否供应。
_Avoid_: 把暂时不活跃的菜品当成重复身份；让被归并的 UUID 日后独立恢复。

**菜单来源（Menu source）**: 周期性读取某个供应商门店菜单的配置、托管菜品所有权与同步状态。一个菜单来源只归属一个食堂，托管菜品通过数据库约束同时引用来源与同一食堂；同步入口只接受来源 ID，再由来源决定食堂。它标识 provider、外部门店身份、非敏感读取参数，以及按香港时间解释的已知停业星期与允许同步餐段；调度器在停业日或不适用餐段跳过来源，不创建 run 或空快照。其职责止于产生规范化菜单快照。供应商响应先经过单次同步期间的临时 provider schema，数据库只保存公开展示和稳定关联所需的字段。
_Avoid_: 把上游完整 JSON、匿名 token、会员身份、购物车、优惠码或支付状态写入菜单来源；在页面或 cron 中直接拼供应商请求。

**菜单快照（Menu snapshot）**: 某一观察时刻从菜单来源取得并通过 provider schema 校验的公开菜单事实，以及由 provider 边界声明的快照完整性。它可以是完整目录，也可以只是当前营业时段、库存或可售范围内的子集。
_Avoid_: 把每次抓取都称为完整快照；从条目数量、时钟或 churn 阈值猜测完整性。

**菜单观察（Menu observation）**: 顾客在某一营业时刻可以从点餐入口看到的菜单事实。观察不到某道菜可能源于餐段切换、闭店、售罄或当天不供应，不表示食堂永久停供该菜。
_Avoid_: 把当前可见菜单当成食堂主目录；把未覆盖全部配置餐段的一次或多次缺席直接解释为全局不活跃。

**菜单观察上下文（Menu observation context）**: 一个同步 claim 从数据库时间固化的 `observedAt`、同步窗口 key 与餐段。适配器、同一次 HTTP 重试、快照记录和投影必须共享同一上下文；Qmai 等接受点餐时间的供应商不得在适配器内重新读取墙钟。早餐的权威采样从 08:00 HKT 开始；更早的 `breakfast` 时钟标签只可作诊断，不能取得计划 claim、餐段缺席权威，也不能让 08:17 计划任务误以为早餐已经完成。
_Avoid_: claim 后重新调用 `new Date()`；让重试跨餐段改变请求语义；由响应条数猜测餐段。

**餐段作用域观察（Meal-period-scoped observation）**: 上游只返回某个观察餐段顾客可见菜单时，原始快照保持其真实的 `partial`/`complete` 目录证据与供应商声明售卖时段。一个有效观察立即替换该餐段的**当前可见成员**：出现的身份加入该餐段，缺席的托管身份只移除该餐段，其他已配置餐段原样保留。同一餐段可以有多次观察，最新成功观察替换先前的点时成员；同一商品跨餐段仍共享 UUID，名称、价格、分类和排序采用当前观察的最新事实。供应商声明时段属于原始证据，不能替代尚未发生的顾客可见性观察。
_Avoid_: 等齐全部餐段才修正已观察餐段；把无 `saleTime` 的点时响应标成 `allday`；让晚餐快照移除午餐可见性；在 reconciliation 内按 provider 名称分支。

**当前菜单投影（Current menu projection）**: 从一个权威目录观察，或一个有效餐段观察派生出的 CUpedia 当前展示状态。它只携带投影条目与缺席权威（无权威、供应商目录、当前活跃性），不携带伪造的快照完整性或观察作用域，也不会作为原始快照持久化。`current-activity` 明确携带本次覆盖餐段与来源配置餐段，用局部 patch 修正餐段成员；明确的供应商发布切换可解释成批菜单组成变化，但同名换 ID 和身份冲突始终须中止，没有发布证据的成批新旧 ID 漂移仍须审核。
_Avoid_: 把多个 `partial` 观察合成并标记为 `complete catalog`；让 adapter 直接签发内部活跃性权威；把可逆下线解释成供应商永久删除。

**餐段当前可见性（Meal-period activity）**: 菜品当前是否出现在某个早、午、晚餐 Tab。一个权威餐段观察只拥有这个局部状态：缺席可移除该餐段，但不能推断未观察餐段。旧 `["allday"]` 托管数据在第一次局部更新时展开为该来源配置的具体餐段，避免未配置餐段永久阻止收敛。
_Avoid_: 用一个全局布尔值表达三个餐段状态；因午餐缺席而移除早餐或晚餐；让供应商原始声明时段覆盖当前观察事实。

**菜单新鲜度（Menu freshness）**: 每个已配置餐段的新鲜度是能覆盖它的最新成功原始快照时间：优先比较该餐段快照和 catalog 快照，取较新者。失败、待确认空菜单和调度唤醒不刷新它。公开页面只在选中餐段的最后成功日早于当前香港日期时显示过期提示。
_Avoid_: 用来源的全局 `updated_at` 或最近一次失败时间充当某餐段的最后成功时间。

**菜单观察调度（Menu observation scheduling）**: 调度器按数据库时间判断一个来源是否需要再次观察。每个粗餐段先有一个短的主领取窗口，独立后备在主窗口之后才启动，使完成责任可分辨；餐段内仍保留发布刷新唤醒。目录观察在一个粗餐段内只做一次；餐段作用域观察在供应商刷新边界或 45 分钟兜底后再次到期，但两次成功读取至少间隔 10 分钟。供应商边界可从有界、同日且无歧义的服务时段证据声明本餐段最后一次有用读取时间；到达该刷新截止后只停止重复读取，不证明菜单为空、不改变当前菜单投影。证据缺失、坏格式、过大、有歧义或跨午夜时继续使用原来的刷新兜底。唤醒、HTTP 成功或 `no-work` 都不等于菜单已完成；最终成功要求每个适用来源都有成功 run 及可接受快照，只有通过双重确认的营业中空菜单可以是零项快照。没有到期来源时不会请求供应商。
_Avoid_: 为每家店硬编码一个 cron；把调度送达或端点响应等同于业务完成；让一次 scoped success 排空整个餐段。

**菜品活跃性（Menu item activity）**: 菜品是否仍在至少一个当前餐段展示；不活跃是可逆状态，同一外部身份再次出现时恢复原 UUID 及其历史。局部观察移除最后一个可见餐段时，`isAvailable` 才变为 false；目录权威仍可直接更新整店活跃性。
_Avoid_: 把不活跃称为删除或永久退役；为重新上架创建新 UUID；因保留历史身份而继续公开展示已不在任何当前餐段的菜品。

**快照完整性（Snapshot completeness）**: `complete` 表示本次未出现可作为其声明作用域内缺席的证据；`partial` 表示未出现不改变活跃性，只能更新、增加或恢复本次出现的身份。完整性与 `catalog` / `meal-period` 观察作用域共同解释，由来源本身的业务语义决定，不从条目数量、分类、餐段、时钟、重复读取或 safety threshold 猜测。未声明可验证作用域的当前点餐观察属于 `partial`。
_Avoid_: 用 `isFull` 布尔值；把 safety threshold 的结果反推为完整性；让 reconciliation 按 provider 名称分支。

**点餐交接（Ordering handoff）**: 将用户交给供应商官方页面继续选择规格、使用本人优惠、创建订单并付款的稳定入口。交接保存人工确认的完整 URL 及 provider；其 mode、table、multi/location 等参数是入口身份的一部分。它与菜单来源相互独立：同一食堂可从公开 API 同步菜单，却通过品牌域名或扫码 URL 点餐。
_Avoid_: 从 `externalStoreId` 猜点餐 URL；把 QR 图片路径当业务入口；保存带临时 session/order/token 的 URL；由 CUpedia 代理真实下单或支付。

**促销提示（Promotion notice）**: 从公开菜单或活动规则观察到的非权威优惠说明。它只用于提示用户去官方页面确认资格与实付金额，不代表本系统授予优惠。
_Avoid_: 把客户端计算的会员价当权威价格；保存卡号、会员等级、coupon redemption 或供应商登录态。

**硬删除（Hard delete）**: 食堂与菜品无 `deletedAt`；删除行时 DB `ON DELETE CASCADE` 清理关联 votes 与 comments。
_Avoid_: 沿用 wiki 的软删除模式。

**Mock 模式（`CANTEEN_MOCK_DATA=true`）**: 仅开发用内存数据；种子只允许极简演示（如「演示食堂 / 演示菜品」），禁止写死真实食堂菜名。
_Avoid_: 把 mock 数据当作生产 seed。

**首页入口**: `src/app/(main)/page.tsx` 食堂模块卡片已启用（无「即将上线」），链接 `/canteen`。公开区品牌为「山城食记」，副标题「还有食堂能吃吗」；视觉为冷色账本风，菜品图仅 SVG（`DishSvgIcon`），不做真实菜品摄影。标题同行右侧入口「每日💩堂榜」→ `/canteen/shit-rank`。浏览页分 **食堂区**（`canteens`）与 **外卖区**（`takeouts`，独立表）；外卖详情 `/canteen/takeout/{id}`。Admin「外卖管理」`/admin/takeouts` 平行于食堂管理（店家 + 菜单 CRUD；无赞踩/同步）。

**每日💩堂榜（Shame rank）**: 对**食堂**的 append-only 点踩日榜（非菜品）。票写入 `canteen_shame_votes` 永久保留；页面只聚合展示当日 `voteDate`（`Asia/Hong_Kong` 自然日）。访客可踩（ADR 0024 匿名 cookie）；截止前每日均可参与，可对多个食堂踩，同一食堂可连踩；不可取消，再点再加一票。匿名访客港时自然日最多 50 次踩，额度检查与插入在数据库事务中串行化。排行按当日踩数降序。管理员在站点设置维护包含当天的截止日期，缺省为 `2026-09-01`。实现见 `canteen-shame-rank.ts`、`canteen-shame-actions.ts`。
_Avoid_: 与菜品赞踩表混用；把日榜做成 upsert/可取消。

**菜品分区 / SVG 图标**: `svg_key` 存分区键（店家原文分类或旧版 `rice`/`drink` 等）。菜单按该键分组；已知英文 key 用固定中文标签与顺序，其余 key 用自身作标签排在其后。`DishSvgIcon` 经 `resolveDishIconKey` 映射常见中文分类名到图标，未知回退 `default`。`validateSvgKey()` 接受非空限长字符串，不再把未知值折成 `default`。

**E2E 种子**: `scripts/seed-data.ts` 含固定 UUID 的「演示食堂」与午餐菜品（`rice`/`bowl` svgKey），供 `e2e/canteen-menu-votes.spec.ts` 投票路径；`e2e/canteen-danmaku.spec.ts` 覆盖食堂页弹幕（#192）。命名遵循 [ADR 0007](../adr/0007-e2e-tests-named-by-feature.md)（按功能而非 issue 号）。

## Related ADRs

- [0023：食堂硬删除与 mock 模式](../adr/0023-canteen-hard-delete-and-mock-mode.md)
- [0024：食堂匿名投票写权限](../adr/0024-canteen-anonymous-vote-only.md)（含菜品赞踩与💩堂榜点踩）
- [0013 — 食堂价格选项与稳定 API 边界](../adr/0013-canteen-pricing-api-boundary.md)
- [0014 — 外部菜单同步保留菜品身份与历史](../adr/0014-canteen-external-menu-sync.md)
- [0025：菜单同步与点餐交接分离](../adr/0025-separate-menu-sync-from-ordering-handoff.md)
- [0026：跨供应商发布窗口刷新当前菜单](../adr/0026-refresh-current-menus-across-provider-publication-windows.md)
- [0028：以 Supabase Cron 作为菜单同步主时钟](../adr/0028-use-supabase-cron-as-primary-menu-sync-clock.md)
- [0029：约束 Supabase pg_net 传输证据边界](../adr/0029-bound-supabase-pg-net-transport-evidence.md)
- [0030：在有界刷新截止停止餐段观察](../adr/0030-stop-scoped-observations-at-refresh-horizons.md)
