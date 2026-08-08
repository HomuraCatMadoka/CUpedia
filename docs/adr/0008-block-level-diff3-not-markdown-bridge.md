# 编辑冲突用块级 diff3，不经 markdown 绕行

wiki 编辑的三方合并（`src/lib/merge-content.ts` 的 `threeWayMergeContent`）在**规范化后的顶层 Plate 块**上跑 node-diff3，而不是把 JSON 降成 markdown 再按行 diff。合并路径上彻底去掉 `toMarkdown`/`fromMarkdown` 的往返。触发场景是乐观锁命中后、autosave 每个 tick 都可能跑一次合并；即将开放全员编辑后并发合并成为常态。

## Considered Options

- **markdown 行级 diff3（原实现）**：把三份 Plate JSON 各 `toMarkdown` 成文本，node-diff3 按行合并，干净则 `fromMarkdown` 回 JSON。复用现成 diff3，但有两个硬伤——(1) **有损**：markdown 桥的保真度依赖每种节点类型都有一对无损双向规则，而 `calloutMarkdownRules` 只有 `serialize`、没有 `deserialize`，实测（临时探针，已删）证明**一次不相邻的干净合并**就会把整页 callout 降级成 `blockquote` 并注入字面量 `[!NOTE]` 正文，且 `clean=true` 不报冲突；任何今后只写一半规则的新节点类型都会同样静默腐蚀。(2) **重**：每次合并 4 次 headless Plate（`toMarkdown`×3 + `fromMarkdown`×1），跑在 serverless 的 autosave 路径上。
- **CRDT（Yjs）**：Plate 官方的并发路径，无损、可实时协作。但要引入持久化 / 传输 / presence 一整套，对"乐观锁 + 偶发合并"的模型是过度投资。
- **块级 diff3（选定）**：先用稳定顶层块 `id` 合并结构序列；三份文档不能证明共享同一套身份时，退回“规范内容 + 同值块出现序号”。再从原始块对象重组。**全程不离开 JSON → 无损**；**不碰 headless Plate → 轻**；`threeWayMergeContent` 接口不变。实测：不相邻的干净合并逐字节保留 callout / equation / toc / table。

## Consequences

- `threeWayMergeContent` 签名不变；`mergeMarkdown` 及合并路径上的 `toMarkdown`/`fromMarkdown` 退场（`toMarkdown` 仍服务历史 / diff 路径，不删）。
- 默认冲突粒度仍是**顶层块**：落在不同块的编辑一律自动合并（相邻与否都合并——块键之间织入稳定分隔哨兵）。对于 children 全为文字 leaf 的普通段落、标题、引用，允许第二层保守合并：文字位置不同、或同一文字上互不冲突的 mark / 块属性可以合并；同一属性取不同值、删除与修改同一块、以及 equation / callout / table 等富结构块仍退回手动解决。这样排版 autosave 的连续提交不会产生假冲突，同时不对复杂节点猜测意图。
- `normalizeInitialValue` 会为缺少身份的顶层元素生成确定性 ID，编辑和保存后 ID 随块持久化，因此重复文字块必须用 ID 定位，不能靠“第几个相同段落”猜测。只有三方都带唯一 ID、且两份后代至少保留一个 base ID 时才启用身份路径；旧数据或确实易变的 ID 继续走规范内容 fallback。内容相等比较仍递归剥掉 `id`，避免把身份本身误当正文差异。
- 冲突 UX 按触发路径分流：**后台 autosave** 撞冲突用被动提示条（静默停 autosave、让用户继续打字），**显式 Cmd+S** 撞冲突才弹 modal。理由是区分"停留 vs 离开"意图——autosave 是环境性的、用户还在写；Cmd+S 是用户主动保存、准备离开，需要不可错过的强反馈。块级 diff3 落地后改动不同块的编辑无损自动合并，modal 只在"两人同改一个顶层块"的罕见情况才弹。
