# e2e 测试按功能命名，不按工单编号

e2e spec 按它**验证的功能/行为**命名（`wiki-read.spec.ts`、`sidebar.spec.ts`），放弃早期「一个 issue 一个 `issue-<N>.spec.ts`」的习惯。issue 可追溯性移入测试内部（`describe` 标题或文件头 `ref #N`）。同域多文件用前缀（`wiki-*`、`auth-*`）聚类；单功能膨胀后用点号后缀切变体（`wiki-edit.autosave.spec.ts`）。

这条只约束**文件名**，与「每 issue 一独立 PR」（见 AGENTS.md PR Requirements）并存——PR 仍按 issue 走。

## Considered Options

- **维持 `issue-<N>.spec.ts`**：与「每 issue 一 PR」工作流同构，issue ↔ 验收测试一一对应，对 AFK agent 友好。但文件名零信息量（半年后没人记得 `#92` 是搜索），且 1:1 模型在实践中已破裂——`issue-89` 与 `issue-94` 互相混入对方的 sidebar / 编辑器测试，autosave/Cmd+S 镜像重复并已漂移（一处写 `beforeunload guard`、一处写 `in-app navigation guard`）。
- **功能 / 行为命名（选定）**：文件名自解释；同一功能的回归自然聚到一处；与 `tests/` 下单元测试既有命名一致。参照 Cal.com（`booking-pages` / `login.2fa`）、Rocket.Chat（`account-*` / `create-*`）——主流大项目均按功能命名，无一用工单号。

## Consequences

- 可追溯性从文件名转移到测试内部，必须在 `describe` / 文件头保留 `#N`，否则丢失「这条断言为何存在」的历史。
- 存量迁移是一次性大爆破：CI 跑整套 `pnpm test:e2e`、不按文件名映射必需检查，故改名零门禁风险；用 `git mv` 保留 `git log --follow` 历史，代价是一次 git blame 噪声。
- 新增 e2e 必须按功能命名；`issue-<N>.spec.ts` 应在评审时被拦下。
