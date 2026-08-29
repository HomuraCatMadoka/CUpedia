# Campus Map 开放编辑契约

本契约落实 ADR 0022，定义 Place 直接发布、Changeset、Fact revision、冲突与事后治理边界。
它约束后续 schema、API、编辑器和管理员工具；不规定具体表名、路由或组件结构。

## 1. 对象边界

### Edit session

Edit session 是单个浏览器任务的唯一草稿 owner，持有编辑模式、目标 Place、
`baseRevisionId`、位置、preset 字段、来源、dirty 状态、服务器 warning acknowledgement 和
稳定幂等键。Changeset 说明与来源摘要由 typed draft/diff 自动生成，普通用户不填写自由文本
comment；MVP 固定 `reviewRequested: false`，也不维护 Undo/Redo action journal。它是本地私有
状态，不是服务器 Application，也不会出现在公共地图。

登录往返、刷新和发布失败可以恢复同一个 session。恢复返回同一张编辑 Sheet，不得自动发布。

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
  → Publish
  → Authenticate and return to edit Sheet（如需要）
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

#562 验收的 Variant A 是正式交互：

```text
Browse
 ├─ Add → 同一张 Sheet 的 focused placing：center pin / 高德标签 / 键盘候选位置
 │                                      ↓ “使用此位置”
 │                            显示位置与设施类型 ──────────────┐
 └─ Place card → Edit ────────────────────────────────────────┤
                                                              ↓
                                                           Publish
```

- `Browse`、`Select Place` 与 `Add Point` 是互斥模式；MVP 不展示 Line、Area 或 Relation。
- Add 与 Edit 共用一张单页 Sheet。`placing` 与 `editing` 保持同一 Sheet shell；主操作先是
  “使用此位置”，确认后只显示位置、设施类型与发布。普通贡献者界面不显示“设施名称或编号”、
  “资料依据”或“开放与使用条件”。它是同一 session 内的两种 presentation，不是独立定位页、
  preset 或 Review 页面，也不增加常驻 Undo/Redo 或 action journal。
- Add 的 center pin 与键盘路径先更新可恢复、provider-neutral 的 WGS84 placement
  candidate。candidate 本身不是 Current fact，也不单独产生 dirty；两条路径都经同一
  `CONFIRM_POSITION` transition 锁定 position、CRS 和诚实 precision。锁定后地图手势不能改写
  位置，除非用户明确选择重新定位。
- `placing` 时轻点高德底图上可交互的地点名称，表示用户明确选择该 provider hotspot。现有 #645
  driver 把 center pin 移到 hotspot，Sheet 可瞬时显示该高德名称；用户继续拖图或输入坐标时选择立即
  失效。hotspot 的名称和 ID 不自动写进 draft、来源、`placeId` 或其他 canonical fact。
- 移动地图时 center pin 提起，`moveend` 后由小型 AMap Geocoder boundary 提供带归属
  的瞬时地址/附近 POI 参考。高德同时返回校园容器与多个具体 POI 时，只显示带可用距离、距图钉
  不超过 30 米且最近的具体 POI；更远的“附近”结果不能冒充图钉位置。没有可信具体 POI 或查询
  失败时，候选位置仍可使用。provider 结果不得自动填名称、来源、
  `placeId` 或其他 canonical fact；过期回调在新候选、关闭、Back、Escape、刷新或新任务后失效。
- 定位卡始终把六位 WGS84 坐标作为主确认信息；高德行政区/道路地址只作为带归属的次级参考，
  不能取代坐标。若候选点距现有 CUpedia Building 原型锚点不超过 50 米，可显示“建筑名附近”帮助
  用户辨认，但这只是 presentation，不自动产生 Building containment 或精确位置事实。
- Add 新建的是饮水点、洗手间、打印服务等独立 Place，建筑名只是位置参考。schema 的首个
  preset 同时提供默认 `pinType` 和 `defaultName`，所以确认位置后不会落入“已选类型但名称空白”
  的 payload；切换设施类型会同步采用该类型的稳定默认名称。Edit 保留已有名称，不套用 Add
  默认值。名称仍是 typed fact，但此精简贡献界面不单独编辑名称。
- 移动端 `placing` 只显示定位所需内容，保留约一半地图；`editing` 在 390px 与 720px 高度下至少
  保留 35% 地图。地图根容器不得用大于视口的最小高度制造整页滚动，Sheet 主操作始终留在视口
  内；字段内容可在 Sheet 内滚动。地点类型使用自适应网格，不能把最后一个选项单独挤到窄行。
- Edit 绑定不可变 `placeId + baseRevisionId`；初始载入不 dirty，只有事实或位置变化才启用发布。
- preset schema 继续驱动默认值、公开标签和本地基础校验；此精简界面只暴露设施类型，其他字段
  保持 schema 默认值或既有值。服务器结果仍是最终校验来源。
- typed draft/diff 自动生成 Changeset comment 与安全 source summary；MVP 固定
  `reviewRequested: false`。若用户没有显式来源，纯 transition 在发布时加入 `kind=other` 的
  “地图提交” provenance，记录提交日期、typed client reference 及“仅提交位置与类型、没有独立资料来源”
  的 limitation；不得伪装成现场观察或高德官方资料。
- warning 只消费服务器签发的 code/fingerprint；确认使用新 publish attempt，相关输入变化会清除
  acknowledgement。认证返回不自动发布；transient retry 沿用幂等键；conflict 不自动合并。
- 每个编辑任务只有一个 React session owner。搜索结果、marker、地点卡、类别空态、地图长按和
  全局 Add 只产生一次 intent；browser history、camera、focus 和 sheet 仍只由 #645 canonical
  driver 执行，发布仍只由 #718 `publishCampusMapChangeset` 执行。
- Back 返回任务前 scene；X/Escape 在 dirty 时允许继续编辑或丢弃。刷新、快速 Place 切换、地图
  手势与认证回跳不能覆盖已锁定 placement 或别的 Place draft。
- 发布成功清除 draft 并直接打开 canonical Place；界面只播报一次“发布成功”，Place 卡仅保留一个
  “查看编辑记录”入口。不得展示独立发布回执，也不得由 Back 或刷新重复播报或恢复表单。
- publish receipt consumer 的 typed outcome 只在 edit session 投影为用户可理解的反馈：
  `reconciliation-unavailable`、`handoff-failed`、`projection-failed`、`missing-target` 和
  `receipt-state-unavailable` 表示原发布结果尚未确认，只允许调用同一个 consumer 检查原命令；
  明确可重试的 publish failure 才显示“重试发布”。身份不一致或暂时无法确认身份时隐藏草稿内容，
  不盲目重试；浏览器无法取得恢复锁时保留草稿并允许回到编辑，不绕过锁。
- `superseded` 与 `projection-superseded` 是静默结果：旧发布任务不得覆盖较新的 scene、Sheet、焦点
  或读屏播报。所有其他可见反馈只提供一个主要操作，并在离开 `publishing` 后更新 polite live
  region。产品文案不得显示 receipt、幂等键、“发布识别码”或“安全重试”等内部恢复协议术语。

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
14. 发布后的一次成功提示、Changeset history、discussion 和错误提示具备键盘与读屏反馈；
15. 两个相似 create 可以各自直接发布为不同 Place，duplicate warning 不自动合并；管理员后续
    merge 时保留 loser redirect 与双方历史。

## 10. 明确延后

- 数据库表、迁移、API 与管理员 review/abuse UI；
- 离线发布队列、自动字段合并、多人实时协作和贡献者信誉分；
- raw OSM tags、node/way/relation、Line/Area 编辑、建筑轮廓和道路拓扑；
- 影像选择与 offset、室内楼层图、室内定位和逐步导航；
- 公共 Place 照片、私有证据附件及其许可、EXIF、保留和删除政策；
- basemap/provider 迁移。MVP 继续使用 AMap，事实保持 provider-neutral。
