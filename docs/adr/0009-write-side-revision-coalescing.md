# wiki 修订在写入侧合并连续编辑，不每次插一条

`writeWikiPage`（`src/lib/wiki-actions.ts`）把**同一作者、5 分钟滑动空闲窗口内**的连续编辑合并成**一条** `wikiRevision`——就地 UPDATE 最新那条的 title/content 并刷新其 `createdAt`，而不是每次写入都 INSERT 一条新修订。`createWikiPage` 与 `rollbackToRevision` 永远直接 INSERT，不参与合并。

autosave 是 1500ms debounce、逐键触发的（`src/hooks/use-autosave.ts`），原实现每次写入都插一条修订 → 一次编辑 session 产出几十条近乎相同的修订。开放全员编辑后写者倍增，膨胀加剧。

## Considered Options

- **每次写入插一条（原实现）**：最简单、历史最全。但 autosave 下历史被逐键批次淹没、不可读，`wiki_revisions` 表快速膨胀。
- **固定时间桶**（如每 10 分钟墙钟一条）：可预测，但边界是任意的，会把"一次连续编辑"从中间劈成两条。
- **滑动空闲窗口 5 分钟、同作者（选定）**：同一作者在距上次合并 5 分钟内的连续编辑合并成一条；换作者、或空闲超过 5 分钟，则开一条新修订。语义对齐"一次编辑 sitting = 一条修订"。

## Consequences

- **schema 不变**——合并即 UPDATE 最新修订的 title/content + 刷新 `createdAt`，无需迁移。`wikiRevisions` 无 `updatedAt`，用 `createdAt` 承载"这条修订最后一次被写入"的时间。
- 历史（history/diff）每次编辑 sitting 显示一条，而非每个 debounce 批次一条。
- `createWikiPage` / `rollbackToRevision` **绕过合并**：回滚是一次有意的检查点，必须自成一条修订，不能被后续编辑就地吞掉。
- Cmd+S 只是 autosave 的一次 flush，不是特殊检查点；`editSummary` 在编辑器里是 sticky 的，合并后的那条修订自动带上最后一次的摘要。
- session 中途崩溃只丢未 flush 的尾部（与原实现相同）。
