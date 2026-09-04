# Campus Map 开放编辑契约

本契约落实 ADR 0035，定义 Place 直接发布、Changeset、Fact revision、冲突与事后治理边界。
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
普通贡献者可以新增 Place、修改结构化字段和修正位置；单 Place 的 `retire` 与 `restore`
是管理员专用动作。发布事务必须重新读取行为者角色，普通用户直接提交这两类 command 时
返回 `forbidden / admin-required`；隐藏管理按钮不是授权检查。

| 动作                              | Eligible contributor | Admin |
| --------------------------------- | -------------------- | ----- |
| 新增 Place                        | 是                   | 是    |
| 修改结构化字段或位置              | 是                   | 是    |
| 停用、恢复单个 Place              | 否                   | 是    |
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
- **Retire**：管理员提交必填理由，追加 retired revision，并从默认搜索、附近和路线候选
  移除。旧 deep link 继续返回可读 tombstone，显示名称、停用状态、理由、稳定 ID 和公开历史，
  不得返回空白页或 404。
- **Restore**：只有管理员能从普通 retired Place 的 tombstone 追加 active revision；不能恢复 merge loser。
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
- retired Place 对所有读者保留同一份可读详情 tombstone 和公开历史；只有管理员看到恢复入口。
- Edit draft、认证恢复记录和未发布 payload 只对 owner 可见。
- Review request 只影响 review feed 排序或筛选；地图立即显示同一 Current fact。
- 来源公开投影不得泄露私人联系方式、未授权附件或内部 abuse note。
- 被封禁用户的既有署名历史继续公开；封禁只阻止后续写入。
- Map note 表达“这里可能有问题但我不知道正确值”，不能直接修改 Current fact。
- Abuse report 与管理员内部 note 私有，并与 Changeset discussion 分开。

地点照片现由 ADR-0037 定义的 revision-bound 管线处理。本次 Add 流程简化不改变照片存储、审核
或来源契约；新增设施时不要求照片，贡献者可以在后续 Edit 中补充。私有证据附件和任意文件仍不在
本流程内；现有 Wiki asset 不能作为绕过该管线的替代方案。

## 8. 编辑交互契约

#562 验收的 Variant A 是正式交互：

```text
Browse
 ├─ 全局 / 类别 Add → 地图上选择 canonical Building ───────────┐
 │                 └─ 明确选择“选择室外位置” → center pin ──────────────┤
 ├─ Building 卡片 Add → 固定 Building / 当前 Floor ────────────┤
 └─ Place card → Edit ─────────────────────────────────────────┤
                                                               ↓
                                                同一张 Sheet → Publish
```

- `Browse`、`Select Place` 与 `Add Point` 是互斥模式；MVP 不展示 Line、Area 或 Relation。
- Add 与 Edit 共用同一 session 与 Sheet shell，不增加多步骤 wizard。全局与类别 Add 先显示紧凑的
  地图选 Building 状态；地图上的临时按钮只来自 CUpedia canonical Building 锚点，provider hotspot
  不参与 Building 选择。现有校园搜索在此状态保持可用，并把所选 Building 带入同一个 Add session；
  地图加载失败时仍可搜索或退出。距离、地图中心和 provider 名称都不能推断 containment。
- Building 卡片 Add 固定 Building，只允许楼层保持当前值、改选或设为未知；全局 Add 选定 Building
  后，“更改位置”返回地图选择，而不是打开长 Building 下拉框。类别入口在整个过程保留 Pin type。
- Add 表单只显示位置、可选楼层、设施类型和发布。名称采用 Pin type 的 canonical 默认名且不在 Add
  暴露输入；照片、开放对象、凭证、预约、开放时间和临时状态不作为新增门槛，typed 值保持 unknown。
  这些详情与自定义名称可以在发布后的 Edit 中补充。普通贡献者界面仍不显示“资料依据”自由文本。
- 用户明确点击“选择室外位置”后，center pin 与键盘路径先更新可恢复、provider-neutral 的 WGS84 placement
  candidate。candidate 本身不是 Current fact，也不单独产生 dirty；两条路径都经同一
  `CONFIRM_POSITION` transition 锁定 position、CRS 和诚实 precision。锁定后地图手势不能改写
  位置，除非用户明确选择重新定位。
- `placing` 只通过 center pin、拖图和键盘坐标确定位置。高德底图地点不作为可点击产品目标；
  这样编辑与浏览共用同一个 canonical-only 交互边界，也不会把供应商名称或 ID 混入 draft、
  来源、`placeId` 或其他 canonical fact。
- 移动地图时 center pin 提起，`moveend` 后由小型 AMap Geocoder boundary 提供带归属
  的瞬时地址/附近 POI 参考。高德同时返回校园容器与多个具体 POI 时，只显示带可用距离、距图钉
  不超过 30 米且最近的具体 POI；更远的“附近”结果不能冒充图钉位置。没有可信具体 POI 或查询
  失败时，候选位置仍可使用。provider 结果不得自动填名称、来源、
  `placeId` 或其他 canonical fact；过期回调在新候选、关闭、Back、Escape、刷新或新任务后失效。
- 定位卡始终把六位 WGS84 坐标作为主确认信息；高德行政区/道路地址只作为带归属的次级参考，
  不能取代坐标。若候选点距现有 CUpedia Building 原型锚点不超过 50 米，可显示“建筑名附近”帮助
  用户辨认，但这只是 presentation，不自动产生 Building containment 或精确位置事实。
- Add 新建的是饮水点、洗手间、打印服务等独立 Place。schema 的 preset 同时提供 `pinType` 和
  `defaultName`；Add 随设施类型同步 canonical 默认名，Edit 始终保留并允许修改已有名称。只有用户
  明确选择 canonical Building/Floor 后才形成 containment；building-only 明确表示楼层未知，不能
  复制 Building anchor 作为设施点。
- 移动端 Building 选择与 `placing` 只显示定位所需内容，保留约一半地图；`editing` 在 390px 与 720px 高度下至少
  保留 35% 地图。地图根容器不得用大于视口的最小高度制造整页滚动，Sheet 主操作始终留在视口
  内；字段内容可在 Sheet 内滚动。地点类型使用自适应网格，不能把最后一个选项单独挤到窄行。
- Edit 绑定不可变 `placeId + baseRevisionId`；初始载入不 dirty，只有事实或位置变化才启用发布。
- preset schema 继续驱动默认值、适用字段、公开标签和本地基础校验；Edit 界面暴露名称、设施类型、
  三种位置断言及现有受控访问条件，并明确说明 `unknown` 不等于无限制。服务器结果仍是最终校验来源。
- typed draft/diff 自动生成 Changeset comment 与安全 source summary；MVP 固定
  `reviewRequested: false`。若用户没有显式来源，纯 transition 在发布时加入 `kind=other` 的
  “地图提交” provenance，记录提交日期、typed client reference 及“提交名称、位置、类型与结构化
  访问条件、没有独立资料来源”的 limitation；不得伪装成现场观察或高德官方资料。
- warning 只消费服务器签发的 code/fingerprint；确认使用新 publish attempt，相关输入变化会清除
  acknowledgement。认证返回不自动发布；transient retry 沿用幂等键；conflict 不自动合并。
- 每个编辑任务只有一个 React session owner。搜索结果、marker、地点卡、类别空态和明确的
  “新增设施”操作只产生一次 intent；长按或右键地图不直接开始贡献。browser history、camera、focus 和 sheet 仍只由 #645 canonical
  driver 执行，发布仍只由 #718 `publishCampusMapChangeset` 执行。
- Back 返回任务前 scene；X/Escape 在 dirty 时允许继续编辑或丢弃。刷新、快速 Place 切换、地图
  手势与认证回跳不能覆盖已锁定 placement 或别的 Place draft。
- 发布成功清除 draft 并直接打开 canonical Place；界面只播报一次“发布成功”，紧凑 Place 卡提供
  稳定详情入口，完整详情页只保留一个“查看编辑记录”入口。不得展示独立发布回执，也不得由 Back
  或刷新重复播报或恢复表单。
- 管理员的停用入口位于 active Place 完整详情底部，使用危险样式、明确影响说明、必填理由和
  确认步骤，不使用“永久删除”文案；地图卡不承载该危险动作。普通读者不看到停用或恢复入口。
- 危险确认必须把初始焦点放入对话框，支持 Escape 取消并把焦点返回触发器，为控件提供读屏
  名称，并显示 pending 与可操作的 error 状态。Back、刷新、direct deep link 和从详情返回地图仍由
  现有 card/session/history owner 恢复正确 Place selection，不建立第二套 owner。
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

1. 普通贡献者新增、字段修改和位置修正的成功发布；
2. 选择 Place 但没有 diff 时 Save 禁用；
3. 缺 comment、来源、必填字段、CRS 或证据精度不符时阻断；
4. Warning 确认后发布，Review request 不延迟公开；
5. 双击、超时重试和认证回跳只产生一个 Changeset/Place；
6. 两用户从同一 base 发布时，后者全量 conflict 且公共事实不被部分更新；
7. 管理员 multi-Place Changeset 任一冲突时全部回滚，普通贡献者多 Place payload 被拒绝；
8. 管理员直接编辑仍产生 Changeset、revision、provenance 和 actor history；
9. 普通贡献者直接提交 retire/restore 返回 `admin-required`；管理员 Retire 后默认结果消失、
   deep link 保留名称、状态、理由、稳定 ID 和历史，restore 追加新 revision；
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
