# ADR 0008: 食堂硬删除与开发 mock 模式

## Status

Accepted

## Context

- Wiki 页面使用软删除（`deletedAt`）；食堂子系统 MVP 要求删除食堂/菜品时硬删并 CASCADE 关联投票与评论（后续表）。
- 本地开发可能暂无 PostgreSQL，需要无库预览 Admin 与公开浏览。
- Issue #187 禁止在代码/seed 中写死生产菜品名。

## Decision

1. `canteens` 与 `canteen_menu_items` **无** `deletedAt`；删除为 `DELETE` + FK `ON DELETE CASCADE`。
2. 开发可选 `CANTEEN_MOCK_DATA=true`：内存 store + `/canteen/manage` 预览路由（仅 `NODE_ENV=development`）。
3. Mock 种子仅允许极简占位名称；正式数据由 Admin 录入。
4. 餐段排序使用显式序数（早/午/晚），不用字典序。

## Consequences

- 删除不可恢复；UI 必须展示爆炸半径确认框。
- Mock 与 DB 路径在 `*-actions.ts` 分支，合并前须 `pnpm tsc --noEmit` 与测试双路径覆盖。
- 新子系统须注册 `docs/canteen/CONTEXT.md` 与 `CONTEXT-MAP.md`。
