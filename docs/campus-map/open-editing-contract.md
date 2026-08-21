# Campus Map 开放编辑契约

本契约落实 ADR 0022，定义 Place 直接发布、Changeset、Fact revision、冲突与事后治理边界。
它约束后续 schema、API、编辑器和管理员工具；不规定具体表名、路由或组件结构。

## 1. 对象边界

### Edit session

Edit session 是单个浏览器任务的唯一草稿 owner，持有编辑模式、目标 Place、
`baseRevisionId`、位置、preset 字段、来源、Changeset 说明、Review request、dirty 状态和
Undo/Redo 历史。它是本地私有状态，不是服务器 Application，也不会出现在公共地图。

登录往返、刷新和发布失败可以恢复同一个 session。恢复只返回复核页面，不得自动发布。

### Publish command

一次发布请求包含：

- stable client `idempotencyKey`；
- 必填 Changeset comment；
- 可选 `reviewRequested`；
- 普通贡献者恰好一个 Place change，管理员 bulk command 可以包含多个；
- 每项变化引用的结构化 provenance；
- 对既有 Place 的不可变 `placeId` 与 `baseRevisionId`。

客户端 diff、history metadata 和服务器 publish payload 是三个边界。服务器不信任客户端
计算的 before value、权限、精度标签或校验结果，必须从当前事实重算。

### Changeset

Changeset 是一次成功、原子的公开发布记录。它只存在于发布成功之后；没有 pending、approved、
rejected 或 withdrawn 状态。作者、发布时间、comment、来源摘要、Review request、发布客户端
名称/版本和包含的 Place changes 发布后不可改写。请求幂等键不是 Changeset 字段或公开 metadata。

Changeset discussion 是独立的追加式公开对话。评论不能改变事实；解决问题必须发布新的
Changeset。

### Place change 与 Fact revision

Place change 是 Changeset 内针对一个 Place 的 `create | update | retire | restore` 变化及其
field-level diff。每项成功变化产生一份新的不可变 Fact revision；revision 保存完整事实快照、
前一 revision、Changeset、作者、时间和 provenance 引用。

Current revision 是 Place 最近成功发布的 revision，包括 active、retired 或 merged redirect；
CAS 与 restore 始终引用它。Current fact 是 active Current revision 的公开搜索与地图投影，
不是另一份可独立编辑的数据；retired Place 没有 active Current fact，但仍有 Current revision。

### Publish attempt

失败的网络或业务尝试不是 Changeset。服务端只返回以下结果之一：

- `published`：返回同一个 Changeset ID、受影响 Place ID 与新 revision ID；
- `conflict`：返回每个陈旧目标的 expected/current revision；
- `validation-failed`：返回稳定 field/error code；
- `authentication-required` 或 `forbidden`；
- `temporarily-unavailable`：允许使用同一幂等键重试。

## 2. 发布状态与原子性

```text
Edit draft
  → Local validation
  → Review publish
  → Authenticate and return to review（如需要）
  → Publish command
      ├─ published → Changeset + Fact revisions + Current revisions + active projections
      ├─ conflict → 保留 draft，基于最新版重新确认
      ├─ validation/auth failure → 保留 draft，修复后重试
      └─ transient failure → 同一 idempotencyKey 重试
```

服务端发布必须在一个事务中完成：

1. 重新读取并验证贡献者资格；
2. 以 `(actorId, idempotencyKey)` 查找已完成结果；
3. 校验 comment、preset fields、位置、精度、provenance 与操作权限；
4. 锁定所有目标 Current revision，并验证全部 `baseRevisionId`；
5. 创建一个 Changeset；
6. 为每项变化追加 Fact revision；
7. 推进全部 Current revision，并按 active/retired/merged 状态更新或移除 Current fact 投影；
8. 提交事务并返回公开 ID。

任一步失败都不能留下空 Changeset、孤立 revision、部分更新或“已发布但地图未变化”。同一
Changeset 的任一目标冲突时全部失败；MVP 不做字段级自动合并或部分成功。

## 3. 校验等级

| 等级       | 语义                                         | 发布行为           |
| ---------- | -------------------------------------------- | ------------------ |
| Error      | payload 无法形成诚实且符合领域不变量的事实   | 阻止发布           |
| Warning    | 可能重复、异常或需要额外检查，但事实仍可表达 | 用户确认后允许发布 |
| Suggestion | 可改善质量的非必要建议                       | 不阻止发布         |

至少以下情况是 Error：

- 缺失 Changeset comment；
- 缺失 Place type 必填字段或结构化 provenance；
- `unknown` 被客户端提升为 unrestricted、yes 或 no；
- Point precision 高于证据，或坐标缺少声明 CRS；
- Floor 不属于 Building；
- 修改目标不是 active/retired 状态允许的操作；

陈旧 `baseRevisionId` 返回 `conflict`；未登录、资料未完成、被封禁或权限不足分别返回
authentication/forbidden 结果。它们不能伪装成字段 validation error。

重复候选是 Warning，不是自动拒绝或唯一约束。名称、距离、Building、Floor 和 Pin type 不能
自动合并 Place。

## 4. 贡献者与管理员权限

**Eligible contributor** 是已认证、完成昵称和 credential、当前未被封禁的 CUHK User。
权限必须在 publish transaction 重新确认，不能只信任页面加载时的 session。

普通贡献者的 publish command 恰好包含一个 Place change；只有管理员 bulk command 可以在一个
Changeset 中原子修改多个 Place。服务端按 command kind 校验该基数，不能只由 UI 隐藏入口。

| 动作                              | Eligible contributor | Admin |
| --------------------------------- | -------------------- | ----- |
| 新增 Place                        | 是                   | 是    |
| 修改结构化字段或位置              | 是                   | 是    |
| 停用、恢复单个 Place              | 是                   | 是    |
| 请求发布后复核                    | 是                   | 是    |
| 讨论 Changeset、留下地图备注      | 是                   | 是    |
| 将旧 revision 的值作为新修正起点  | 是                   | 是    |
| 一键反向整个 Changeset、bulk edit | 否                   | 是    |
| 合并 stable Place identity        | 否                   | 是    |
| Redaction、schema 变更、封禁      | 否                   | 是    |

管理员直接编辑不绕过同一 validator、provenance、CAS、Changeset 和 Fact revision writer。管理员
身份只扩大可用命令，不允许无历史覆盖 Current fact。

## 5. 修订、停用、恢复、反向修改与合并

- **Update**：保持 `placeId`，追加新 revision；改名、改变位置或 provider mapping 不换 ID。
- **Retire**：追加 retired revision，从默认搜索、附近和路线候选移除；旧 deep link 显示停用
  状态与历史。
- **Restore**：针对普通 retired Place 追加 active revision；不能恢复 merge loser。
- **Revert**：复制目标旧 revision 的事实值形成新的 Changeset/revision，并记录
  `revertsChangesetId` 或 `revertsRevisionId`；不移动 Current 指针到旧行。
- **Merge**：管理员原子锁定 survivor 与 loser；survivor 保持 ID，loser 追加永久 redirect
  tombstone。历史、来源、讨论和旧 deep link 保留，ID 不删除、不复用。
- **Redaction**：只限制敏感历史内容的读取，版本链保留占位和管理员审计；不能作为普通纠错。

若误合并，不能复活 loser；应创建新的 Place，并以修正 Changeset 解释 split。这样旧链接继续
稳定指向原 merge 结果。

## 6. 冲突与幂等

### CAS conflict

任何 update、retire、restore、merge 或 revert 都必须引用操作开始时的 Current revision。即使
两个 Changeset 修改不同字段，后发布者也不能把自己的旧草稿自动套到新 Current revision；
用户必须看到最新版与自己的 diff，重新确认一个新的完整 payload。

示例：

1. A 与 B 都从 `r17` 开始；
2. A 发布楼层修改，Current revision 成为 `r18`，并更新 active Current fact 投影；
3. B 发布开放对象修改并携带 `baseRevisionId=r17`；
4. B 的整个 Changeset 返回 conflict，不产生 `r19`；
5. B 基于 `r18` 复核后再发布。

### Idempotency

唯一域是 `(actorId, idempotencyKey)`。该 key 只存在于私有发布请求/去重记录，不进入公开
Changeset 投影。相同 key 重试必须返回最初的成功结果，不能创建第二个 Changeset；相同 key
配不同 payload 必须返回错误，不能以 payload hash 代替客户端 key。

双击发布、网络超时后重试和认证回跳不得重复新增 Place。`placeId` 在 create Changeset 成功时
分配；失败或被放弃的本地草稿不占用公开 Place identity。

## 7. 可见性与事后治理

- 游客和所有用户读取同一份已发布 Current fact、Changeset、Fact revision 安全投影与公开讨论；
  作者只公开 stable contributor ID、昵称快照等安全署名，不公开 email、credential 或幂等键。
- Edit draft、认证恢复记录和未发布 payload 只对 owner 可见。
- Review request 只影响 review feed 排序或筛选；地图立即显示同一 Current fact。
- 来源公开投影不得泄露私人联系方式、未授权附件或内部 abuse note。
- 被封禁用户的既有署名历史继续公开；封禁只阻止后续写入。
- Map note 表达“这里可能有问题但我不知道正确值”，不能直接修改 Current fact。
- Abuse report 与管理员内部 note 私有，并与 Changeset discussion 分开。

MVP 不接收证据照片或任意附件。现有 Wiki asset 上传后公开且缺少 pending ACL、EXIF 清理和
权利治理，不能复用于 Campus Map；首版只接受结构化来源引用、现场观察信息和纯文本 comment。

## 8. 编辑交互契约

Campus Map 采用 iD 的交互原则，而不暴露 OSM 数据模型：

- `Browse`、`Select Place` 与 `Add Point` 是互斥模式；MVP 不展示 Line、Area 或 Relation。
- 桌面地图常驻、左侧显示 preset/fields；移动端使用同一 session 的 sheet 投影，不另建表单。
- 选择现有 Place 不自动产生 dirty；只有事实或位置变化才启用 Save。
- Add Point 点击地图产生位置 intent，然后选择 preset；category 不是 identity。
- preset schema 同时驱动字段组件、默认值、校验、diff 和公开展示。
- Undo/Redo 只改变未发布 session；公开纠错必须发布新 Changeset。
- Review publish 显示地图位置、field-level diff、Errors/Warnings/Suggestions、comment、source 与
  Review request；错误项可以返回对应 Place/字段。
- 每个编辑任务只有一个 session owner。搜索结果、marker、地点卡和全局 Add 按钮只产生一次
  用户 intent；browser history、camera、focus 和 sheet 的具体协调沿用 #645 canonical driver，
  不属于本治理契约的业务状态。
- Back 返回任务上一步；X/Escape 在 dirty 时允许继续编辑或丢弃；快速切换地点、地图手势与认证
  回跳不能覆盖已锁定的 placement 或别的 Place draft。

## 9. 必测场景

后续实现至少覆盖：

1. 新增、字段修改、位置修正、停用和恢复的成功发布；
2. 选择 Place 但没有 diff 时 Save 禁用；
3. 缺 comment、来源、必填字段、CRS 或证据精度不符时阻断；
4. Warning 确认后发布，Review request 不延迟公开；
5. 双击、超时重试和认证回跳只产生一个 Changeset/Place；
6. 两用户从同一 base 发布时，后者全量 conflict 且公共事实不被部分更新；
7. 管理员 multi-Place Changeset 任一冲突时全部回滚，普通贡献者多 Place payload 被拒绝；
8. 管理员直接编辑仍产生 Changeset、revision、provenance 和 actor history；
9. Retire 后默认结果消失、deep link 保留，restore 追加新 revision；
10. Revert 追加新 revision，旧历史仍可读；
11. Merge loser 永久 redirect，restore/revert 不能复活；
12. 被封禁用户不能重试旧草稿发布，既有署名历史仍存在；
13. Back、X、Escape、刷新、登录回跳、快速 marker 切换与地图手势不丢错草稿；
14. 发布回执、Changeset history、discussion 和错误提示具备键盘与读屏反馈；
15. 两个相似 create 可以各自直接发布为不同 Place，duplicate warning 不自动合并；管理员后续
    merge 时保留 loser redirect 与双方历史。

## 10. 明确延后

- 数据库表、迁移、API 与管理员 review/abuse UI；
- 离线发布队列、自动字段合并、多人实时协作和贡献者信誉分；
- raw OSM tags、node/way/relation、Line/Area 编辑、建筑轮廓和道路拓扑；
- 影像选择与 offset、室内楼层图、室内定位和逐步导航；
- 公共 Place 照片、私有证据附件及其许可、EXIF、保留和删除政策；
- basemap/provider 迁移。MVP 继续使用 AMap，事实保持 provider-neutral。
