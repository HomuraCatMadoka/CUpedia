# PRD: CU 课程测评（浏览 + 评分 + 匿名评论）— MVP

> 权限与账号术语见根目录 `CONTEXT.md`（User / Admin / 站长 / Eligible account）；读公开、写/账号受限，与 ADR 0001 一致。课程技能树（#156）以课号为稳定锚点——本 PRD 的**课程（Course）**同样以四字母+四数字课号为主键，便于将来与技能树节点互链。本 MVP **不与**技能树/wik i 互链。

## Problem Statement

CUHK 学生在选课前几乎只能依赖零散的口耳相传或第三方课程评价站（如 CUtopia），缺少一个与 CUpedia 社区/wiki 同域、面向中大学子的**轻量课程测评入口**：能快速按学院/学分/课号找到一门课、看到同学对它的综合评分与匿名评论，并在登录后参与打分与讨论。

目前 CUpedia 尚无课程数据源与后端 API；团队需要先交付可本地运行的 **MVP**：mock 课程目录 + 真实登录态下的评分/评论/点赞交互，并预留 repository 接口以便后续接入真实数据与 PostgreSQL 持久化。

## Solution

在 `/courses` 下提供**课程测评模块**：

1. **列表页**：卡片展示课号、名称、学分、综合推荐指数；左侧学院/学分筛选 + 课号/名称搜索（代码匹配优先）。
2. **详情页**：课程信息 + 综合推荐指数（用户评分均值，无评分时回退 mock 基线）+ **打分面板**（0–10，一位小数，同一用户同一课程 5 分钟冷却可多次更新）+ **匿名评论区**（发表/撤回/点赞）。
3. **数据边界**：只读 mock 课程目录；用户产生的评分/评论/点赞暂存本地 JSON（开发期），经 `course-actions` repository 统一读写，将来可无痛替换为 DB/API。
4. **导航**：首页「课程」模块与顶栏「课程」入口启用，指向 `/courses`。

## User Stories

1. As a 匿名访客, I want 浏览课程列表与详情, so that 我不登录也能了解课程概况与他人评价。
2. As a 匿名访客, I want 按学院（ERG/SCI/ARTS/BA/Others）筛选课程, so that 我缩小搜索范围。
3. As a 匿名访客, I want 按学分（1/2/3/4+）筛选课程, so that 我按修读负担浏览。
4. As a 匿名访客, I want 输入课号或名称搜索, so that 我快速找到目标课（课号匹配优先于标题）。
5. As a 匿名访客, I want 在列表卡片上看到课号、名称、学分、综合推荐指数, so that 我一眼比较多门课。
6. As a 匿名访客, I want 点击卡片进入课程详情, so that 我看到更完整的课程信息与评论。
7. As a 匿名访客, I want 在详情页看到课程描述、学院、学分与综合推荐指数, so that 我获得决策所需基本信息。
8. As a 匿名访客, I want 阅读匿名评论及每条评论的点赞数, so that 我了解他人体验而不暴露评论者身份。
9. As a 登录 User（Eligible account）, I want 为课程打 0–10 分（一位小数）, so that 我贡献对课程的主观评价。
10. As a 登录 User, I want 用滑块与快捷分（6/7/8/9/10）打分, so that 我快速提交常见分数。
11. As a 登录 User, I want 对同一门课多次更新评分, so that 我可以在修读后修正看法。
12. As a 登录 User, I want 两次对同一课程的评分至少间隔 5 分钟, so that 系统避免短时间刷分。
13. As a 登录 User, I want 提交评分后看到更新后的综合推荐指数, so that 我的贡献立刻反映在聚合结果中。
14. As a 登录 User, I want 在冷却期内看到剩余等待时间, so that 我知道何时能再次打分。
15. As a 登录 User, I want 匿名发表评论, so that 我分享体验而不暴露昵称。
16. As a 登录 User, I want 撤回自己发表的评论, so that 我可以删除不当内容。
17. As a 登录 User, I want 给评论点赞或取消点赞, so that 我标记有用的评价。
18. As a 登录 User, I want 每条评论显示点赞总数, so that 我能看出哪些评论更有参考价值。
19. As a Admin, I want 撤回任意用户的评论, so that 我能处理违规内容（与 wiki Discussion 管理立场一致）。
20. As a 未登录访客, I want 在尝试打分/评论/点赞时被引导登录, so that 我知道交互需要 CUHK 账号。
21. As a 维护者, I want 课程事实与用户 UGC 通过 repository 层隔离, so that 将来替换 mock/JSON 为 DB 时 UI 无需大改。
22. As a 维护者, I want 课号作为稳定主键（四字母+四数字）, so that 将来可与 #156 技能树节点及外部数据源对齐。

## Implementation Decisions

遵循 ADR 0001（读公开、写需登录）。不含具体文件路径。

### 已实现 MVP（feat/courses）

1. **课程目录（只读 mock）** — 约 30 门 CUHK 课程，覆盖 ERG/SCI/ARTS/BA/Others；课号/名称/学分为手工整理；mock 基线推荐指数（0–10 一位小数）在无用户评分时作为列表/详情展示值。
2. **Repository + Server Actions** — 单一数据边界，导出类型即契约：
   - 读：`getCourses(filter)`、`getCourse(code)`、`getCourseReviews(code)`、`getCourseRatingState(code)`
   - 写：`submitCourseRating(code, score)`、`addReview(code, content)`、`deleteReview(reviewId)`、`toggleLike(reviewId)`
3. **综合推荐指数** — `aggregateRating`: 有用户评分时取全部评分算术平均（一位小数）；否则回退 mock 基线。
4. **评分冷却** — 同一 `userId` + 同一 `courseCode`，相邻两次 `submitCourseRating` 间隔 ≥ 5 分钟；服务端校验，客户端展示倒计时。
5. **匿名评论** — 前端一律显示「匿名用户」；服务端存 `userId` 用于撤回、点赞去重、本人「撤回」按钮。
6. **持久化（开发期）** — 评分/评论/点赞写入本地 JSON（`ratings` + `reviews` 数组）；读-改-写、无并发锁，仅适合本地/demo。
7. **鉴权** — 浏览 `getOptionalUser`；变更 `requireAuth`；Admin 可删任意评论。与 better-auth + `auth-guard` 一致。
8. **UI** — 列表参考 `refer_html/1(1).html` 极简卡片风；筛选/搜索通过 URL query（`faculty`/`credits`/`q`）驱动 Server Component 重渲染；交互区为 Client Component + `useTransition` + `router.refresh()`。
9. **导航** — 首页模块与 Navbar「课程」链至 `/courses`。

### 深模块（纯逻辑，待 TDD 补全）

1. **aggregateRating(courses, ratings) → number** — 给定某课全部评分记录，返回一位小数的综合分；空集回退基线。
2. **filterCourses(courses, { faculty, credits, query }) → Course[]** — 学院/学分桶/搜索；搜索时课号前缀匹配优先于标题子串。
3. **ratingCooldown(lastRatedAt, now, cooldownMs) → { allowed, secondsRemaining }** — 冷却判定（当前 5 分钟）。

### Schema 变更（Phase 2 — 生产持久化，本 MVP 未做）

* `course_ratings` — `id`、`courseCode`、`userId`、`score`(numeric 1dp)、`createdAt`
* `course_reviews` — `id`、`courseCode`、`userId`、`content`、`createdAt`
* `course_review_likes` — `reviewId`、`userId`（或 `likedBy` 数组的规范化表）
* `courses` — 与 #157/#161 对齐后取代 mock（`code` PK、`subject`、`title`、`units`、`faculty`、`description`…）

### 鉴权与 API 契约

* 匿名：列表/详情/读评论/读聚合分。
* 登录 User：打分、评论、点赞、撤回自己的评论。
* Admin：撤回任意评论。
* Server actions 见上；`"use server"` 文件仅导出 async 函数（常量如冷却毫秒数须模块内私有）。

## Testing Decisions

* **好测试只验外部行为**：给定 mock 课程集 + 内存 store fixture，断言 filter 结果、聚合分、冷却拒绝/允许、评论 CRUD 权限——不耦合 JSON 文件路径。
* **Prior art**：纯函数参照 `tests/lib/slug.test.ts`；server actions 用 `vi.mock` 打桩 auth/fs，参照 `tests/lib/discussion-actions.test.ts`。
* **应覆盖**：
  - `aggregateRating`：无评分回退基线、多评分均值、一位小数四舍五入
  - `filterCourses`：五学院桶、学分 other(≥4)、课号搜索优先排序
  - `ratingCooldown`：边界（恰好 5 分钟、差 1 秒）
  - `submitCourseRating` / `addReview` / `deleteReview` / `toggleLike`：未登录拒绝、本人撤回、Admin 撤回、点赞去重
* **E2E（后续）**：登录 → 打分 → 冷却提示 → 评论 → 点赞；参照 `e2e/` 现有模式（seed 账号经 API 登录绕过 CUHK 邮箱客户端校验）。

## Out of Scope

* **课程技能树 / 加点模拟器**（#156 及 S1–S7 子 issue）— 本产品为测评入口，非 RPG 探索器。
* **真实课程数据源摄取**（#157/#161）— MVP 用 mock；课号/名称/学分为手工样本。
* **PostgreSQL 持久化** — Phase 2；MVP 用本地 JSON。
* **评论回复线程 / @提及 / 富文本** — 扁平匿名评论即可。
* **评分分布图 / 按学期 / 按教师** — 未来增强。
* **与 wiki `[[互链]]` 或技能树节点 UI 互链** — 仅预留课号锚点。
* **生产级并发与审计日志** — demo 阶段不做。

## Further Notes

* **设计参考**：`refer_html/1(1).html`（列表卡片）、虎扑式大字推荐指数（详情页）。
* **本地验证**：`pnpm dev` → `/courses`；seed 账号密码 `password123`（登录表单有 CUHK 邮箱客户端校验，E2E/控制台 API 登录可绕过，见 `e2e/issue-89.spec.ts`）。
* **实现总结**：`src/app/(main)/courses/course_function_summary.md`。

## 执行切片（Sub-issues，建议）

* **S1（本 PRD / feat/courses）** · MVP：mock 目录 + 列表/详情 + 打分/评论/点赞 + repository 接口
* **S2** · 单测：`aggregateRating` / filter / cooldown + server actions
* **S3** · DB 持久化：`course_ratings` / `course_reviews` / likes 表 + 迁移
* **S4** · 接入 #157 真实 `courses` 数据源，移除 mock 基线分
* **S5** · E2E 套件 + 修复 dev seed 账号与 CUHK 邮箱客户端校验不一致
