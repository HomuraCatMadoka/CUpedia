# 编辑冲突用块级 diff3，不经 markdown 绕行

wiki 编辑的三方合并（`src/lib/merge-content.ts` 的 `threeWayMergeContent`）在**规范化后的顶层 Plate 块**上跑 node-diff3，而不是把 JSON 降成 markdown 再按行 diff。合并路径上彻底去掉 `toMarkdown`/`fromMarkdown` 的往返。触发场景是乐观锁命中后、autosave 每个 tick 都可能跑一次合并；即将开放全员编辑后并发合并成为常态。

## Considered Options

- **markdown 行级 diff3（原实现）**：把三份 Plate JSON 各 `toMarkdown` 成文本，node-diff3 按行合并，干净则 `fromMarkdown` 回 JSON。复用现成 diff3，但有两个硬伤——(1) **有损**：markdown 桥的保真度依赖每种节点类型都有一对无损双向规则，而 `calloutMarkdownRules` 只有 `serialize`、没有 `deserialize`，实测（临时探针，已删）证明**一次不相邻的干净合并**就会把整页 callout 降级成 `blockquote` 并注入字面量 `[!NOTE]` 正文，且 `clean=true` 不报冲突；任何今后只写一半规则的新节点类型都会同样静默腐蚀。(2) **重**：每次合并 4 次 headless Plate（`toMarkdown`×3 + `fromMarkdown`×1），跑在 serverless 的 autosave 路径上。
- **CRDT（Yjs）**：Plate 官方的并发路径，无损、可实时协作。但要引入持久化 / 传输 / presence 一整套，对"乐观锁 + 偶发合并"的模型是过度投资。
- **块级 diff3（选定）**：把每个顶层块规范化（递归排序 key、剥掉易变的 `id`）成规范字符串，node-diff3 在块字符串数组上合并，再从原始块对象重组。**全程不离开 JSON → 无损**；**不碰 headless Plate → 轻**；`threeWayMergeContent` 接口不变。实测：不相邻的干净合并逐字节保留 callout / equation / toc / table，同块并发仍正确判 `clean=false`。

## Consequences

- `threeWayMergeContent` 签名不变；`mergeMarkdown` 及合并路径上的 `toMarkdown`/`fromMarkdown` 退场（`toMarkdown` 仍服务历史 / diff 路径，不删）。
- 冲突粒度是**顶层块**：两笔编辑落在同一个顶层块（如同一段落）内 → 判冲突、退回手动解决；落在**不同**顶层块的编辑一律自动合并（相邻与否都合并——块键之间织入一个稳定分隔哨兵，给 diff3 提供上下文，复刻 markdown 空行免费带来的自动合并）。这是有意的取舍，覆盖 95% 的"两人改不同段落"高频场景。
- 规范化必须剥掉一切**易变的 per-node 字段**。当前没有注册 NodeId 插件、块里没有易变 id，但仍要**防御性剥掉 `id`**——否则未来一旦引入 NodeId 插件，每个块都会因 id 不同而变成假冲突。
- 冲突 UX 按触发路径分流：**后台 autosave** 撞冲突用被动提示条（静默停 autosave、让用户继续打字），**显式 Cmd+S** 撞冲突才弹 modal。理由是区分"停留 vs 离开"意图——autosave 是环境性的、用户还在写；Cmd+S 是用户主动保存、准备离开，需要不可错过的强反馈。块级 diff3 落地后改动不同块的编辑无损自动合并，modal 只在"两人同改一个顶层块"的罕见情况才弹。
