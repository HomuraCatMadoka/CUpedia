# 首批校园设施同步：自动化等级与运行成本

状态：Research conclusion
核查日期：2026-09-01（Asia/Hong_Kong）
范围：RES 公用课室、OSA 大学游泳池 HTML/ICS、UMSO University Health Centre 公开页面；不讨论高德搜索、课程课表、预约系统内部数据或通用爬虫平台。

## 结论

抓取成本不是限制，**错误自动发布才是限制**。首批来源在保守频率下约为 **930 次上游请求/月、少于 150 MB/月的未压缩响应**；用一个每 30 分钟唤醒一次的内部入口，再加每 4 小时一次的 GitHub 灾备，约为 **1,620 次 Vercel Function 调用/月**。即使把每次调用都按 2 GB 内存、10 秒墙钟和 1 秒活跃 CPU 的偏高情景计算，香港区公开单价约为 **US$0.21/月，且仍低于 Vercel 文档列出的免费包含量**。实际新增平台账单应接近零，但必须以生产账户的 Usage 页面为准。

建议自动化边界如下：

| 来源            | 自动抓取                                             | 允许自动发布                                                  | 只产生差异或必须审核                                                              |
| --------------- | ---------------------------------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| RES 公用课室    | 每日                                                 | 已人工绑定课室的容量、座位类型、AVSU 详情链接；先影子运行四周 | 新增/消失/改名、`buildingId`、楼层变化、特殊预订标记                              |
| OSA 游泳池 HTML | 每日 WordPress REST；内容变化时再核对 canonical HTML | 严格解析且通过校验的通常开放时段；先影子运行四周              | 收费、资格、证件、预约政策、交通、天气规则、页面公告冲突                          |
| OSA 游泳池 ICS  | 每小时                                               | 时间、状态及已列入白名单的整池关闭、浅水区/泳线限制、清洁改时 | 未识别文案、异常大批删除、覆盖范围骤变、互相冲突的事件                            |
| UMSO 页面       | 每日                                                 | 只有来源状态、哈希和更新时间                                  | 地点、办公时间、电话、电邮、预约链接、资格、证件、急症/闭门指引及所有医疗操作文案 |

这里的“自动发布”仍必须产生 Campus Map revision、changeset 和 provenance；它不是直接更新 `campus_map_current_facts`。自动发布只代表通过固定规则后不需要人逐条点击批准。

最小可靠运行方式是复用现有的 **Supabase Cron 只负责唤醒、受保护的 Next.js `/next` 入口领取一个到期来源、GitHub Actions 延迟灾备**这一形状，但不要复用菜单领域表或建立通用 crawler DSL。现有 Supabase 调度代码已经合并，然而生产激活和七日验收任务仍是 open，因此它是“production-capable”，不是本报告已验证的“production-proven”；设施定时发布应以 [生产激活任务](https://github.com/HomuraCatMadoka/CUpedia/issues/764) 和 [七日验收任务](https://github.com/HomuraCatMadoka/CUpedia/issues/757) 完成为前置条件。

## 核查方法与限制

本次直接请求官方 canonical 页面、WordPress REST、sitemap、robots.txt 和公开 ICS，解析当前 DOM/ICS，并记录响应大小、结构、WordPress `modified`、字段异常及相邻两次抓取差异。外部平台事实只采用 Supabase、GitHub、Vercel、WordPress 和 RFC Editor 的官方资料。

没有可公开读取的页面 revision history，因此不能从一日观察推导真实年变化次数。下文“审核时间”是运行预算，不是历史统计。也没有读取生产 Supabase 或 Vercel Usage；容量状态仅引用仓库已有的 2026-08-26 只读核查记录并明确标为未复核。

三个 CUHK 域名的 `robots.txt` 都没有禁止目标公开页面；这不等于授权复制或再分发。Campus Map provenance 的 `rightsStatus` 在获得明确许可前仍应为 `unknown`，只保存产品所需的事实、链接和有限证据，不镜像整站正文。

## 来源一：RES 公用课室

### 当前真实结构

官方来源是 [List of Communal Classrooms](https://www.res.cuhk.edu.hk/teaching-timetable-classroom-booking/classroom-booking/list-of-communal-classrooms/)。2026-09-01 的响应约 147,892 bytes：

- 三张课室表分别有 33、89、135 条数据，共 **257 个不重复 room code**；另有一张 **30 条 building abbreviation** 对照表。
- 表头使用 `<td>` 和 `colspan=2`，数据行实际为五列：location、floor、room code、capacity、seat type。不能按表头文字数量推断列数。
- 当前有 5 行缺 floor、3 行没有 AVSU 详情链接；这些是现存允许缺失，不应因 `not null` 假设令整次同步失败。
- 当前座位类型只有 5 个：`Table & Chair`、`Lecture Theatre`、`Armchair/Table & Chair`、`Armchair`、`Chamber-type`。
- room code 文本混有无间隔形式（如 `CKB706B`）、`(Interactive)`、`(Multi-purpose Classroom)` 和 `*`。其中 5 个 `*` 房间的页面脚注说明不能通过 WRB 预订，需直接向 RES 交表。装饰文字不是 room identity。
- location 的 Campus Map 链接当前都指向通用地图入口，不是可直接信任的逐建筑坐标。
- RES 的 WordPress REST 对匿名请求返回 401；只能抓 canonical HTML。页面和 REST 响应未提供可用的 `ETag` 或 `Last-Modified` HTTP header，但官方 [sitemap](https://www.res.cuhk.edu.hk/wp-sitemap-posts-page-1.xml) 给该页的 `lastmod` 为 2026-07-22T14:27:34+08:00。

这是一张规模稳定、更新较慢但 HTML 手工维护的目录。**每日一次**比月度更简单，也只增加约 30 请求和 4.4 MB 未压缩流量/月；真正需要控制的是发布，不是抓取频率。

### 字段决策

| 字段或变化                                        | 等级                           | 原因和条件                                                                      |
| ------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------- |
| `sourceFetchedAt`、响应/语义 hash、行数和校验结果 | 自动                           | 只属于同步证据，不改变公开地点事实                                              |
| 已绑定 room 的 capacity                           | 四周影子运行后自动             | room code 不变、数字合法、整体行数和列结构正常时风险低                          |
| 已绑定 room 的 seat type                          | 四周影子运行后自动             | 必须属于受控集合；新值令整批停在 review                                         |
| 已绑定 room 的 AVSU detail URL                    | 四周影子运行后自动             | 只接受 `avsu.cuhk.edu.hk`，协议升级可归一；跨域变化要审核                       |
| room code 的格式清理                              | 自动用于匹配，不自动改公开名称 | 空格、NBSP、括号说明和 `*` 分开保存；不能把规范化结果冒充官方显示文本           |
| 新 room code                                      | 必须审核                       | 要决定新 Place、Building/Floor crosswalk 和别名；禁止按字符串或距离自动建 Place |
| room code 消失、改名或疑似替换                    | 必须审核                       | 一次缺席不退役；至少两个成功完整快照后仍只生成退役/替换候选                     |
| `buildingId`                                      | 必须审核                       | 官方 location text 和缩写只提供候选，内部 Building 是 canonical owner           |
| floor 变化或空 floor 变为有值                     | 必须审核                       | 直接影响导航；需要确认是源数据修正还是列错位                                    |
| `*` 特殊预订标记和脚注含义                        | 只生成差异                     | 它改变办理路径，不能把一个字符解析错误自动发布为预约规则                        |
| seat capacity 或房间数量大幅下降                  | 阻断整批                       | 不得把 parser 失败解释为大量真实变化                                            |

### Parser 失败门槛

首版应要求三张数据表、257 行基线、唯一 normalized room code、5 个逻辑列、数字 capacity 和已知 seat type。建议在任一条件出现时 `stop-for-review`：

- 总行数低于上次成功的 90% 或高于 110%；
- normalized room code 重复；
- 已知 building abbreviation 无法唯一映射；
- 大量 floor、capacity 或链接同时变空；
- 表头锚点、五列结构或三组校园区域消失。

已知 5 个空 floor 和 3 个空 AVSU link 应按 room code 放在版本化 allowlist，不能用“允许任意空值”放宽校验。

### 人工负担

- 初始导入：审核约 30 个建筑缩写的 crosswalk，而不是逐条核 257 个房间；再抽查 5 个空 floor、5 个 `*` 房间和 3 个空 AVSU link。规划预算 **2–4 小时**。
- 四周影子期：真实 diff 批量按 building 展示，预算 **每个工作日 5–10 分钟**。
- 正式运行：容量/座位/链接的安全差异自动发布；新增、消失、身份和导航变化才进入人工队列，预算 **每周 15 分钟巡视**，有真实目录改版时另计。

## 来源二：OSA 大学游泳池

### HTML / WordPress 页面

[University Swimming Pool](https://www.osa.cuhk.edu.hk/campus-life/amenities/swimming-pool/) 的 canonical HTML 当前约 268,580 bytes；官方 [WordPress REST 记录](https://www.osa.cuhk.edu.hk/wp-json/wp/v2/pages?slug=swimming-pool&_fields=id,modified,link,slug,title,content) 约 49,255 bytes，返回 page id `5431`、`modified=2026-08-17T15:42:13` 和 `content.rendered`。WordPress 的官方 Pages 文档确认 `modified` 是站点时区的最后修改时间，`_fields` 可限制返回字段；它适合做轻量变更发现，但不是 CUpedia 承诺的稳定第三方 API。[WordPress Pages API](https://developer.wordpress.org/rest-api/reference/pages/) · [WordPress `_fields`](https://developer.wordpress.org/rest-api/using-the-rest-api/global-parameters/)

页面内容包括：

- 通常每周 Session 1、清洁时段和 Session 2；
- 2026 公众假期关闭及中秋特别安排；
- 收费、八达通付款、容量 330、设施、证件/泳卡、天气、交通和无需预约 FAQ；
- 指向公开 Google Calendar 的链接。

开放时间和收费并不是语义 `<table>`，而是 Elementor/div 网格；只按 CSS class 抓取会很脆弱。Parser 应以 `Opening Hours`、`Fees`、`FAQ` 等标题锚定局部内容，并验证日期、星期和时间区间。页面仍保留“2026-05-11 重开”等历史 notice，说明最新 `modified` 不代表每一段文案都同样新鲜。

### 公开 ICS 的实际复杂度

[公开 basic.ics](https://calendar.google.com/calendar/ical/swimmingpoolcuhk%40gmail.com/public/basic.ics) 当前约 185,341 bytes，包含：

- 606 个 `VEVENT` component、597 个唯一 `UID`；
- 52 个 `RRULE` recurring master、9 个 `RECURRENCE-ID` override、19 个 all-day event；
- `TZID=Asia/Hong_Kong`、UTC `Z`、无参数 floating time 和 `VALUE=DATE` 混用；
- 全部 component 当前都有 `LAST-MODIFIED`、`SEQUENCE` 和 `STATUS`；当前没有 `STATUS:CANCELLED`，但 parser 仍必须支持；
- 2026-09-01 至 2026-11-30 有 49 个原始 component、32 种 summary，其中既有“全池”“浅水区”“三条泳线”，也有 `Pool Closure`、公众假期、Session 2 清洁和特别开放安排；
- 未来 component 中有 10 个在 2026-08-25 至 08-27 被修改，证明它不是只在学期初写一次的静态文件。

RFC 5545 明确规定 recurring instance 要由 `UID`、`RECURRENCE-ID` 和 `SEQUENCE` 一起识别；只用 `UID` 会把 override 与 master 错误去重。`RRULE`、`EXDATE`、floating/local/UTC time 也应交给完整 iCalendar library，不应自己拼正则。[RFC 5545](https://www.rfc-editor.org/rfc/rfc5545.html)

另外，Google 返回的原始 ICS **每次抓取都会刷新所有 `DTSTAMP`，并重排 `VEVENT` 顺序**。本次相邻两次 raw SHA-256 不同；去除传输噪声、提取有业务意义的属性并排序后，semantic SHA-256 相同。若用 raw body hash 判断变化，每小时都会产生假变更和快照。

因此必须同时区分：

- `transportHash`：精确响应证据，只在真正的 semantic change 时才保留对应 raw body；
- `semanticHash`：展开/规范化 identity、time、status、sequence、summary、description 后排序计算，用来判断业务变化。

### 字段决策

| 字段或变化                                                          | 等级                                      | 原因和条件                                                                           |
| ------------------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------ |
| REST `modified`、抓取状态和 semantic hash                           | 自动                                      | 纯来源证据                                                                           |
| 通常开放时段                                                        | 四周影子运行后自动                        | 只解析 `Opening Hours` 区块；星期覆盖完整、时间合法且不存在 notice 冲突              |
| HTML 中的 dated holiday closure                                     | 只生成差异/交叉校验                       | ICS 是首选运营事件来源；两边冲突不得任选一边自动覆盖                                 |
| fee、payment method、card/eligibility、capacity、reservation policy | 只生成差异                                | 属于价格或使用政策；需要人确认文案语义和生效日                                       |
| `UID`、`RECURRENCE-ID`、`SEQUENCE`、`STATUS`、start/end             | 自动 ingest                               | 必须经过 RFC parser、时区和 duration 校验；它们仍是 evidence，不单独等于用户可见状态 |
| 明确 `Whole Pool` / `全池` / `Pool Closure`                         | 影子运行后自动发布 `closed`               | 仅限版本化白名单，时间落在合理 horizon，且无冲突事件                                 |
| 明确 `Shallow Area` / `淺水區`                                      | 影子运行后自动发布 `partially-restricted` | `affectedArea=shallow-area`，不能升级为整池关闭                                      |
| 明确 `N Lane(s)` / `N 條泳線`                                       | 影子运行后自动发布 `partially-restricted` | 保存 lane count；不能由“N 条”推导仍有多少条可用                                      |
| weekly cleaning、Session 特别开放/关闭                              | 只生成差异，建立白名单后再自动            | 它们通常表达 `hours-changed`，不是全日 `closed`                                      |
| 未识别 summary、description 中的自然语言                            | 必须审核                                  | 可以公开原始官方标题链接，但不能自动推断影响范围                                     |
| future event 从 feed 消失                                           | 两次完整 semantic snapshot 后才可自动撤回 | 大批消失、horizon 缩短或 feed 数骤降会阻断；不能一次缺席就删除                       |
| 当前入场人数、拥挤度、实时“可进场”                                  | 不接入                                    | ICS 是预定活动日历，不是实时容量系统                                                 |

### 抓取与人工负担

- REST 页面每日一次；`modified` 或 scoped semantic hash 未变就不 parse/publish。canonical HTML 只在内容变化或每月 parity check 时抓一次。
- ICS 每小时一次，最大可见陈旧约一小时；业务事件失败超过 3 小时后，信息卡应显示“资料可能过时”，不能继续声称“当前开放”。
- 初始审核的实际单位不是 606 个历史 component，而是当前 horizon 的 summary taxonomy；本次未来三个月有 32 种 summary。建立白名单和抽查 recurrence 展开预算 **1–2 小时**。
- 影子期人工查看 unknown summary 和跨来源冲突，预算 **每日 5–10 分钟**；稳定后只有新 summary 或结构异常进入队列。

## 来源三：UMSO / University Health Centre

### 当前真实结构

P0 至少需要以下五个官方页面：

| 页面                                                                                                                                                    | 当前机器入口和观察                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [UMSO 首页](https://www.umso.cuhk.edu.hk/)                                                                                                              | canonical HTML 约 47,992 bytes；首页 WordPress page id 4426 的 REST `content.rendered` 为空，办公时间和电话来自 theme layout，必须解析 HTML；页面还混有频繁更新的 news                  |
| [Medical Service](https://www.umso.cuhk.edu.hk/medical-service/)                                                                                        | [REST page 57](https://www.umso.cuhk.edu.hk/wp-json/wp/v2/pages/57?_fields=id,modified,link,slug,title,content) 约 6.7 KB，`modified=2026-04-27T09:12:01`；正文末标 “Updated: DEC 2025” |
| [Dental booking guide](https://www.umso.cuhk.edu.hk/dental-service/when-how-to-book-appointment-for-check-up-and-what-to-be-expected-of-at-that-visit/) | [REST page 165](https://www.umso.cuhk.edu.hk/wp-json/wp/v2/pages/165?_fields=id,modified,link,slug,title,content) 约 1.2 KB，`modified=2022-10-14T14:10:12`                             |
| [Contact Us](https://www.umso.cuhk.edu.hk/contact-us/)                                                                                                  | [REST page 603](https://www.umso.cuhk.edu.hk/wp-json/wp/v2/pages/603?_fields=id,modified,link,slug,title,content) 含门诊、牙科和其他单位电话/电邮，`modified=2024-03-30T11:28:42`       |
| [Location of University Health Centre](https://www.umso.cuhk.edu.hk/location-of-umso/)                                                                  | [REST page 599](https://www.umso.cuhk.edu.hk/wp-json/wp/v2/pages/599?_fields=id,modified,link,slug,title,content) 说明三层建筑、Clinic Road 和交通，`modified=2026-08-11T08:53:05`      |

首页当前公开门诊办公时间、网上预约、电话预约和登记需身份证明；Medical Service 说明预约及 daily walk-in，并提供闭门后的 A&E、999 和校园保安指引；Dental guide 的电话预约和提前取消说明与门诊规则不同。页面之间有重复字段，可用来做一致性校验，但不能任选“更新时间最新”的页面自动覆盖另一页。

UMSO 首页 news 会改变整页 hash，却与预约区无关。必须只为 Booking panel 计算 scoped semantic hash；整页 hash 只能保存为传输诊断。各字段还要分别记录 source URL 和 observedAt，不能用首页当天更新新闻的时间替旧牙科指南“续鲜”。

### 字段决策

| 字段或变化                                               | 等级                   | 原因和条件                                                 |
| -------------------------------------------------------- | ---------------------- | ---------------------------------------------------------- |
| 抓取结果、source `modified`、scoped hash、来源一致性检查 | 自动                   | 不直接改变学生行为                                         |
| University Health Centre 的 Place/Building 绑定          | 必须审核               | 是 canonical identity 和导航决定                           |
| service capability（outpatient、dental、pharmacy 等）    | 初始及变化都审核       | 来源分散；服务拆成一个或多个 Place 还取决于楼层/入口       |
| 办公时间和 closed-day rule                               | 必须审核               | 错误会使学生错过医疗服务；抓取成功只触发高优先 diff        |
| appointment/enquiry phone、email、booking URL            | 必须审核               | 是用户直接采取行动的高风险字段；URL 还要固定域名 allowlist |
| walk-in、证件、资格、取消规则                            | 必须审核               | 不能把门诊规则套到牙科，不能替 UMSO 判断个人资格           |
| closed-hours、A&E、999、Security Office 指引             | 必须审核且接近原意展示 | CUpedia 不作医疗判断或改写紧急程度                         |
| 新闻、活动、疫苗宣传                                     | P0 不接入              | 它们不是地点资料或稳定办理流程                             |
| 登录后的可预约时段、用户身份、症状、病历、token          | 永不采集               | 超出公开地点和操作指引边界                                 |

UMSO 仍建议每日抓取，因为总流量只有约 1.8 MB/月，低成本可以换来一天内发现高风险变化。但它是 **每日检测、人工发布**，不是每日自动改医疗指引。解析或来源冲突时保留 last-known-good，并把卡片标为待确认；不要清空电话或时间。

初始 Place/服务拆分和五页字段核对预算 **1–2 小时**；正式运行中的真实变更应走同日提醒，运营上预留 **每周 15 分钟巡视**。无法从公开 revision history 估计每月真实变更次数。

## 建议频率、请求量与网络量

以下按 30 天月、2026-09-01 实测 body 大小的未压缩上界计算；没有把 TLS/header 小开销计入。机器实际可收到压缩响应，所以上界偏保守。

| 来源单元                    |   频率 | 请求/月 |          当前 body |   上界流量/月 |
| --------------------------- | -----: | ------: | -----------------: | ------------: |
| RES classroom HTML          |   每日 |      30 |          147,892 B |       4.44 MB |
| OSA pool WordPress REST     |   每日 |      30 |           49,255 B |       1.48 MB |
| OSA public ICS              | 每小时 |     720 |          185,341 B |     133.45 MB |
| UMSO home + 4 个 REST pages |   每日 |     150 | 合计约 59,482 B/轮 |       1.78 MB |
| 合计                        |        | **930** |                    | **约 141 MB** |

再加 OSA canonical HTML 的“变化时抓取”和每月 parity check，仍可按 **少于 150 MB/月** 规划。官方来源没有要求 API key，也没有按请求计费接口；但应带清楚的 User-Agent/联系邮箱、20 秒单请求 timeout、有限重试，并遵守保守频率。

## 调度与平台成本

### 首选：Supabase Cron 唤醒固定 `/next` 入口

仓库现有 [ADR 0028](../adr/0028-use-supabase-cron-as-primary-menu-sync-clock.md)、[内部 route](../../src/app/api/internal/canteen-menu-sync/next/route.ts)、[GitHub fallback workflow](../../.github/workflows/canteen-menu-sync.yml) 和 [运行手册](../operations/canteen-menu-sync-scheduling.md) 已经证明适合的边界：数据库时钟只发固定 HTTP wake；Next.js 领取一个到期来源；来源选择、claim、重试、snapshot 和业务发布留在应用内。

设施同步建议：

- 一个独立 named Supabase Cron job，每 30 分钟调用固定 `POST /api/internal/campus-facility-sync/next`；不要一来源一个 cron。
- 每次只 claim 一个 source unit，route 使用 Node runtime、`maxDuration=60`，单来源 20 秒 timeout，总重试必须留在 60 秒内。
- 来源自己的 `nextDueAt` 决定实际 fetch：pool ICS 每小时；其余每日。无到期来源返回 `no-work`，不会请求 CUHK。
- bearer 只存 Supabase Vault 和 Vercel Production；固定 URL、production-only、constant-time bearer check、私有 audit、30 天 run retention 均沿用现有形状。
- 不复用 `canteen_menu_scheduler` schema、菜单 source/claim 表或菜单 disposition code；共享的是认证、固定唤醒和可观测性原则，不是领域模型。

Supabase 官方说明 Cron 基于 `pg_cron`，建议同时不超过 8 个 job、每个 job 不超过 10 分钟；本方案新增一个只 enqueue HTTP 的短 job，远低于限制。[Supabase Cron](https://supabase.com/docs/guides/cron)

Supabase 按数据库 instance-hour 收 compute 费用，而不是按 Cron invocation 列费；在已有生产数据库上，48 个短 enqueue/day 不产生独立 Cron 账单，增量只占已有 compute。生产当前计划和余量本轮没有重新读取；[#757 的 2026-08-26 记录](https://github.com/HomuraCatMadoka/CUpedia/issues/757) 当时为 Free、约 78 MB/500 MB、约 10/60 direct connections，只能作为 rollout baseline，不能当永久保证。[Supabase compute pricing](https://supabase.com/docs/guides/platform/manage-your-usage/compute)

### GitHub Actions：每 4 小时灾备 + 手动恢复

设施数据不需要复制菜单每餐 16 次 drain 的强时序。建议 public repo 的 scheduled fallback 每 4 小时、避开整点运行，并保留 `workflow_dispatch`：健康时只调用一次 `/next` 得到 `no-work`；主时钟故障时有界 drain 所有到期来源。

- 6 runs/day，约 180 runs/month；当前仓库是 public，GitHub 官方说明 public repository 的标准 hosted runner 免费。[GitHub Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions)
- GitHub 官方同时说明 scheduled workflow 在高负载时会延迟，严重时会丢弃，public repo 60 天无活动还会自动停用。因此它适合独立灾备和人工恢复，不适合唯一时钟。[Scheduled workflow troubleshooting](https://docs.github.com/en/actions/how-tos/troubleshoot-workflows#scheduled-workflows-running-at-unexpected-times) · [Automatic disable after inactivity](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/disable-and-enable-workflows)

### Vercel：保留 worker，不新增 Vercel Cron

当前 [`vercel.json`](../../vercel.json) 把 Functions 放在 `hkg1`。Vercel Cron 在 Hobby 最快一天一次且时间可能落在整小时内任意分钟，Pro 才支持 minute precision；它会变成第三个时钟并受当前未核实的 plan 约束，因此不选。[Vercel Cron usage and pricing](https://vercel.com/docs/cron-jobs/usage-and-pricing)

Vercel Function 保留为 parser/worker。官方 Fluid Compute 表列出每月 1,000,000 次 invocation 的包含量，`hkg1` 单价为 active CPU US$0.176/hour、provisioned memory US$0.0146/GB-hour。[Vercel Function pricing](https://vercel.com/docs/functions/usage-and-pricing)

每月 1,440 次 Supabase wake + 180 次健康 GitHub fallback = 1,620 invocation。偏高情景：每次 2 GB、10 秒墙钟、1 秒 active CPU：

```text
memory = 1,620 × 2 GB × 10 s / 3,600 × $0.0146 ≈ $0.131
CPU    = 1,620 × 1 s / 3,600 × $0.176        ≈ $0.079
total  ≈ $0.21/month before included usage
```

这不是账单承诺，只说明运行量距离平台量级限制很远。实际账户是否启用 Fluid Compute、已有用量和 plan 必须在上线前从 Vercel Usage 核对。函数限制和超时仍适用；外部源本次实测响应有约 9 秒的情况，不能用 10 秒总 route timeout。[Vercel Function limits](https://vercel.com/docs/functions/limitations)

## 最小可靠架构

```text
Supabase Cron (30 min) ───────────────┐
GitHub fallback (4 h / manual) ───────┼─ POST fixed /campus-facility-sync/next
                                      │
                                      v
                         claim one due source in DB
                                      │
       ┌──────────────────────────────┼─────────────────────────────┐
       v                              v                             v
RES classroom adapter        OSA page + ICS adapters          UMSO adapter
       │                              │                             │
       └── typed extracted claims + validation + semantic hash ────┘
                                      │
                         unchanged / candidate / blocked
                                      │
                  approved or whitelisted safe publication
                                      │
                   Campus Map Changeset + Revision + Provenance
```

代码中只需要四个固定 adapter key：

```text
res-communal-classrooms
osa-swimming-pool-page
osa-swimming-pool-ics
umso-health-centre
```

`umso-health-centre` 一次可以并行抓五个固定 URL 并生成一个一致性 diff。不要用数据库 CSS selector、可配置脚本、用户自定义 URL、通用队列或“任意网站 parser”做首版。

最少持久化边界：

1. **source binding**：`sourceKey + sourceRecordId -> placeId`；只经人工建立，避免重复 Place。
2. **sync run**：claimed/fetched/parsed/unchanged/candidate/blocked/published、时间、HTTP/error code、counts、semantic hash；终态 run 保留 30 天。
3. **changed snapshot evidence**：只有 semantic hash 改变时才保留一份压缩 raw body 和 typed extracted claims；相同 hash 的每小时 pull 只留 run metadata。
4. **review candidate**：字段级 before/after、source evidence、risk class；不被公开读取。
5. **published provenance**：继续使用 `campus_map_provenance_sources`、revision provenance、Changeset，而不是同步表成为第二套 Place source of truth。

目前 ICS gzip 后约 29 KB。即便如此，如果把每次 raw fetch 当变化保存，也约 21 MB/月；未压缩是 133 MB/月，并且由于 `DTSTAMP` 和顺序噪声每次都会“变化”。semantic dedupe 是容量硬要求，不是优化项。

## 共同失败规则

- fetch 或 parse 失败不修改 last-known-good；连续 3 次失败才告警，但第一次就记录。
- daily sources 成功时间超过 48 小时显示 stale；pool ICS 超过 3 小时不再断言“当前开放/受限”，只显示通常时间和官方日历链接。
- 一次来源缺席不 retire Place、不删除 room、不撤销长期政策。
- 新增/消失超过阈值、唯一键重复、字段集合改变、building binding 不唯一时整批 blocked，不做“能解析多少发布多少”。
- HTTP 2xx、Cron success 和 parser 成功都不是业务完成；只有 unchanged、产生 review candidate，或形成可追溯 revision 才是完整 run。
- 自动发布和社区修改碰撞时不得覆盖：如果当前 revision 已不等于该来源上次发布的 revision，生成 conflict candidate。
- 所有 URL allowlist 固定到受审域名；redirect 跨域、登录页、HTML 变成 PDF/验证码或 content type 改变都 blocked。
- 对官方服务器使用固定低并发（每 adapter 最多 2）、明确 User-Agent、20 秒 timeout、指数退避；不在一次 route 中无界重试。

## 上线顺序和验收

1. 人工建立 30 个课室建筑缩写、游泳池和 University Health Centre/服务点的 Place bindings。
2. 完成四个 adapter 的 fixture parser 与结构校验；fixture 必须含当前异常、ICS recurrence/timezone/override、未知 summary 和 UMSO 首页 theme content。
3. 四周 shadow sync：每日查看 diff，不公开自动修改；记录 source availability、parse failure、semantic change、unknown summary、人工分钟数和假阳性。
4. 只开启 RES 安全字段和 OSA 已白名单 ICS/通常时间的 auto-publish；UMSO 永远维持 diff + human approval。
5. 首周同时保留 Supabase 主时钟、GitHub 每 4 小时 fallback 和 manual dispatch；验收必须看 source run/business publication，不只看 scheduler 绿色。
6. 通过后再根据真实数据调低频率或扩大白名单；没有证据时不接 PEU、Library 或 College 到同一个 adapter。

预计一次性人工审核预算为 **4–8 小时**，四周影子期另预留约 **4–7 小时**。稳定后的目标运营预算是 **每周 30 分钟以内**，再加真实高风险变更的专项确认。工程实现成本、UI 成本和第三方许可谈判不在本次运行成本估算内。

## 未验证与后续必须确认

- 没有读取生产 Supabase/Vercel/GitHub secrets、计划、Usage 或 scheduler active state；上线前必须做只读 preflight。
- 现有 Supabase Cron 生产激活和七日验收仍 open；设施 job 不能把“代码已合并”当“调度已可靠”。
- 没有取得 CUHK 对自动抓取、缓存原始页面、重新展示字段或保存长期快照的书面许可；需由项目负责人确认 rights policy。
- 没有公开的 RES/OSA/UMSO schema SLA、rate limit 或 revision history；cadence 是保守产品决定，不是来源承诺。
- 本地 Node 直接请求 RES 时遇到过证书链验证差异，而系统 `curl` 成功；必须用部署后的 Vercel Node runtime 做一次 TLS/redirect smoke test，不能据本地结果判断生产可达性。
- 本报告没有验证预约登录系统、任何个人医疗数据、实时泳池人数，也没有验证 AVSU 的 257 个详情页；它们均不是 P0 自动同步的一部分。

## 第一方资料

### CUHK 来源

- [RES List of Communal Classrooms](https://www.res.cuhk.edu.hk/teaching-timetable-classroom-booking/classroom-booking/list-of-communal-classrooms/)
- [RES sitemap](https://www.res.cuhk.edu.hk/wp-sitemap-posts-page-1.xml)
- [OSA University Swimming Pool](https://www.osa.cuhk.edu.hk/campus-life/amenities/swimming-pool/)
- [OSA Swimming Pool WordPress REST](https://www.osa.cuhk.edu.hk/wp-json/wp/v2/pages?slug=swimming-pool&_fields=id,modified,link,slug,title,content)
- [OSA public swimming-pool ICS](https://calendar.google.com/calendar/ical/swimmingpoolcuhk%40gmail.com/public/basic.ics)
- [UMSO homepage](https://www.umso.cuhk.edu.hk/)
- [UMSO Medical Service](https://www.umso.cuhk.edu.hk/medical-service/)
- [UMSO dental booking guide](https://www.umso.cuhk.edu.hk/dental-service/when-how-to-book-appointment-for-check-up-and-what-to-be-expected-of-at-that-visit/)
- [UMSO Contact Us](https://www.umso.cuhk.edu.hk/contact-us/)
- [UMSO Location of University Health Centre](https://www.umso.cuhk.edu.hk/location-of-umso/)
- [UMSO sitemap](https://www.umso.cuhk.edu.hk/wp-sitemap-posts-page-1.xml)

### 平台和规范

- [RFC 5545: iCalendar](https://www.rfc-editor.org/rfc/rfc5545.html)
- [WordPress REST API: Pages](https://developer.wordpress.org/rest-api/reference/pages/)
- [Supabase Cron](https://supabase.com/docs/guides/cron)
- [Supabase compute usage and pricing](https://supabase.com/docs/guides/platform/manage-your-usage/compute)
- [GitHub Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions)
- [GitHub scheduled-workflow troubleshooting](https://docs.github.com/en/actions/how-tos/troubleshoot-workflows#scheduled-workflows-running-at-unexpected-times)
- [GitHub workflow automatic disable](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/disable-and-enable-workflows)
- [Vercel Cron usage and pricing](https://vercel.com/docs/cron-jobs/usage-and-pricing)
- [Vercel Functions usage and pricing](https://vercel.com/docs/functions/usage-and-pricing)
- [Vercel Function limits](https://vercel.com/docs/functions/limitations)
