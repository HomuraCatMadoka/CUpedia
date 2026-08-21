---
status: accepted
---

# ADR 0022：Campus Map 采用 OSM 式直接 Changeset 发布

Campus Map 不再采用管理员预审 Application，而采用 CUpedia 自有数据库上的 OSM 式直接发布。
这让校园事实可以低摩擦更新，同时以不可变 Changeset、revision、CAS 和事后治理控制风险。

## 决议

完成贡献者资料的 CUHK User 可以把通过校验的 Place 新增、字段修正、位置修正、停用和恢复
直接发布到 CUpedia 自有 Campus Map 数据库，不经过管理员预审。一次用户任务作为一个
Changeset 原子发布：它保存作者、必填说明、来源摘要和可选 Review request，并为每个受影响
Place 追加不可变 Fact revision、推进 Current revision；active revision 更新 Current fact，
retired 或 merged revision 移除 active 投影。普通贡献者的一个 Changeset 只包含一个 Place；
管理员 bulk command 才能包含多个 Place。Review request 只把已经公开的 Changeset 提升到
社区或管理员 review feed，不是待审状态，也不改变可见性。

每个既有 Place 变化必须引用开始编辑时的 Current revision ID。发布事务重新校验权限、字段、
来源和所有 base revision；任一目标已变化时，整个 Changeset fail closed，不产生部分公共
修改，用户保留 Edit draft 并基于最新版重新确认。发布重试以贡献者和客户端幂等键去重。
服务器不自动合并不同字段，因为合并后的事实组合没有被用户作为一个整体复核。

公开错误通过后续 Changeset 修正。Revert 复制目标旧值形成新的 Fact revision，不删除或移动
历史；Retirement 与 restore 同样是可追踪修订。普通贡献者可以发布单个 Place 的新增、修正、
停用和恢复；stable-ID merge、Changeset 级批量 revert、bulk edit、schema 变更、Redaction、
封禁和解除封禁仅限管理员。Merge loser 永久重定向到 survivor，不能由 restore 或 revert
复活；误合并只能建立新 Place 并保留旧 redirect 历史。

Changeset、Fact revision、来源安全投影和讨论默认公开；发布接口使用的幂等键、Edit draft、
认证恢复数据和 abuse 调查材料保持私有。地图备注、Changeset discussion、举报和评分不属于
Place fact。用户被封禁后不能继续发布，但其既有署名历史不会被删除；只有隐私、版权或法律
理由可以触发带审计占位的 Redaction。

## 考虑过的方案

- **管理员预审申请**：发布风险较低，但把每次校园事实修正变成运营队列，延迟公开并让
  Application 状态与 Place 事实状态长期耦合，因此放弃。
- **无历史地直接覆盖 Current fact**：交互最简单，但无法讨论、纠错、归因或安全回退，因此
  放弃。
- **直接写 OpenStreetMap**：无法承载 CUpedia 的 Building/Floor/Place 身份、访问事实和
  provider-neutral 边界，也引入独立许可与账户约束，因此放弃；“OSM 式”只指发布治理与
  编辑交互，数据仍写入 CUpedia。

## 后果

- ADR 0021 中“批准后才形成 Current fact”的发布语义被本决议取代；其身份、位置、来源和
  provider 边界保持有效。
- `submitted / approved / rejected / withdrawn` 不再是 Place 编辑状态；服务端只接收一次
  原子 publish command，并返回 published、conflict 或 validation/auth failure。
- 发布后的公开 history、discussion、review feed、revert 与管理员 abuse 工具成为必要治理
  能力，而不是后续可选装饰。
- MVP 只编辑 Place 点与结构化事实，不暴露 OSM raw tags、node/way/relation、道路/建筑几何、
  影像校准或批量 GIS 操作。
- AMap 继续作为 MVP basemap；canonical WGS84、GCJ-02 adapter 和 provider mapping 仍遵循
  ADR 0021，Changeset 不改变底图选型。
