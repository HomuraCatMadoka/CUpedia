# 食堂 #187 / #188 踩坑记录

做 #189 及后续食堂 issue 前必读，配合 `.cursor/rules/pr-ready-checklist.mdc` 与 `canteen.mdc`。

## 流程

| 错误 | 正确做法 |
|------|----------|
| 未先读 `.cursor/rules/` 与 `docs/canteen/CONTEXT.md`、ADR | 动手前必读 `pr-ready-checklist`（alwaysApply）+ `canteen.mdc` + 相关 ADR |
| 提 PR 前未跑 `pnpm test` / `lint` / `tsc` / `build` | 四项全过再 push；`"use server"` 常量导出等仅 `build` 能抓 |
| 用 `npm` 代替 `pnpm` | 仓库包管理器为 pnpm |
| base 分支 `feat/canteen/187` 远端不存在 | 开 PR 前 `git fetch` 确认 base 存在；食堂栈用 `feat/canteen/main` |
| 测试计划勾选 mock 项却未跑真库路径 | 持久化/SQL 契约需 e2e 或 integration，不能全靠 mock |

## 数据库 / Server Actions

| 错误 | 正确做法 |
|------|----------|
| `onConflictDoUpdate` 未带 `targetWhere`，部分唯一索引首票即 `42P10` | 部分索引必须 `targetWhere: isNotNull(col)` 匹配谓词 |
| 从 `"use server"` 文件导出 `const` / 非 async 函数 | 常量放普通模块（如 `canteen-vote-queries.ts`）；server 文件只 export async |
| 辅助查询函数挂在 `"use server"` 文件成公开 action 端点 | 查询放无 `"use server"` 的 `*-queries.ts` |
| 限流在 `MENU_ITEM_NOT_FOUND` 之前执行 | 先校验实体存在，再消耗限流额度 |
| 投票写后不 `revalidateTag`，刷新后「我的票」高亮与计数矛盾 | 写路径 `revalidateTag` 与 `unstable_cache` tags 对齐 |

## 测试

| 错误 | 正确做法 |
|------|----------|
| `*.db.test.ts` 却 `vi.mock("@/db")` 全 mock | 改名 `*.drizzle-mock.test.ts` 或真连 Postgres；mock 只验证 drizzle 调用形状 |
| 无 `menu-item-vote-row` 组件测试 | 乐观 UI / 回滚 / 错误映射需 `@testing-library/react` |
| 无 e2e 覆盖 upsert + 部分索引 | 至少 `test.fixme` 骨架 + seed 前置说明 |
| API route 未在 route 层校验 required 字段 | `vote` 等字段 route 层校验；缺字段 400，非静默取消 |

## UI / 运行时

| 错误 | 正确做法 |
|------|----------|
| `middleware.ts` 引入 Node `crypto` 导致 Edge 崩溃 | 匿名 cookie 用 server action + client init，勿在 Edge middleware 用 Node crypto |
| `Button asChild`（Radix 模式） | 用 `<Link className={buttonVariants(...)}>` 或 Button `render` prop |
| `parseVote(undefined)` 经 API 静默当取消票 | 区分「缺字段」与「显式 null」 |

## 性能（非阻断但评审提过）

| 问题 | 建议 |
|------|------|
| `isBannedSessionUser` + `getVoteEligibleUser` 各查一遍 session/DB | 合并为 `getSessionVoterUser()` 一次 fetch |
