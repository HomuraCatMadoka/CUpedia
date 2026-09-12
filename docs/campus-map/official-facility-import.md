# Campus Map 首批官方设施导入

Status: Current

Last verified: 2026-09-12

这是一项需要人工审核的一次性导入，不是定时爬虫。`fetch` 只访问白名单官方页面并写 JSON 清单，
不连接数据库；`publish` 只把已批准的清单交给现有 `publishCampusMapChangeset`，不直接写事实表。
数据库 migration `0131_campus_map_official_facility_floors` 先建立清单有明确来源的 Floor 目录；
它不发布 Place，也不按房间号或建筑最高层补全楼层。

仓库内的待审核清单是
[`data/official-facilities-2026-09-07.json`](data/official-facilities-2026-09-07.json)。它记录 13 个
来源页面的原始内容哈希和规范化内容哈希、257 条 RES 课室、OSA/UMSO 候选、每条候选的发布或
明确跳过决定，以及所用的 canonical Building 证据。清单不保存整页网页正文。

## 合并与生产导入的顺序

先合并代码、待审核清单和楼层 migration，再等对应版本的生产部署成功。按当前 `package.json`，
Vercel 的生产构建会运行 `db:migrate:deploy`，但不会运行本设施导入命令；migration 只建立楼层
目录及其来源，285 个地点仍需单独发布。部署成功后，确认楼层 migration 已应用，再审核和批准
用于生产的清单。

导入可在本机或受控的一次性终端运行，使用已合并版本的代码，并通过临时环境变量注入生产
`DATABASE_URL` 和生产管理员 UUID。先核对目标数据库与管理员身份，不要直接使用 QA 的
`.env.local` 或本地测试批准副本，也不要上传或恢复整份 QA 数据库。生产连接和批准副本不提交
到 Git；本命令不会自动抓取后批准，也不接入每次构建或定时任务。

按下文先发布并抽查 28 条 OSA/UMSO canary，再发布 257 条 RES 课室。完成生产抽查和一个工作日
观察后，才把 issue 的上线验收视为完成；仅合并 PR 不代表地点已导入生产。

## 重新抓取与审核

在固定工作树中运行：

```bash
pnpm campus-map:official-facilities -- fetch /absolute/path/pending.json \
  --accessed-on YYYY-MM-DD --manifest-version YYYY-MM-DD.N
pnpm campus-map:official-facilities -- validate /absolute/path/pending.json
git diff --no-index /absolute/path/previous.json /absolute/path/pending.json
```

抓取器要求 RES 页面仍有三张课室表、一张位置代码表和正好 257 条课室。能按已知格式解析的 OSA
开放时间、泳池时段和 UMSO 门诊时间或预约电话变化会写入新的待审核清单，由审核人查看 JSON diff；
不会自动批准或发布。页面结构、计数、白名单链接或 canonical 位置证据无法确定时，命令才会停止，
不会产生数据库写入。RES 官网的证书链若不能被 Node.js 验证，命令会退回使用系统 `curl`；这个
后备路径仍验证 TLS，并只允许 HTTPS、最多三次 HTTPS 重定向、20 秒超时和 5 MiB 响应。

审核人应逐项检查：

- `sourceSnapshots` 的 URL 全在白名单内；
- `resLiveCount` 是 257，且每条 RES 行都有 `publish` 决定；
- `CK TSE`、`LPN LT`、`SWH`、`TYW LT` 指向真实父 Building，而不是新造 Building；
- `SWC LT` 指向官方 Building Directory 中的 S5 Shaw College Lecture Theatre；
- RES 的单一 `sourceFloor`、BFC 明写的 `G/F` 和 i-LOUNGE 明写的 `3/F` 对应 migration 中的
  canonical Floor；250 条 RES 课室和 4 条 OSA 设施带 `floorId`。容量和座椅类型仍只供审核；
- 5 条未填 Floor 的 RES 课室，以及 `4/F & 5/F`、`8/F & 9/F` 两条跨层课室保持
  `floorId: null`。跨层值能证明两个 Floor 目录存在，但不能证明 Place 只属于其中一个；
- 不从 `305`、`G18`、`B6` 等房间号猜楼层；没有来源明确支持的 Floor 不补；
- OSA 的海报架、宣传架、推广区因没有独立可寻址位置而跳过；PGH 2/3 多用途礼堂因来源不能在
  两座 canonical Building 中确定唯一父级而跳过；
- 游泳池继续使用已有、带来源的近似 WGS84 室外点；门诊与牙科位于 University Health Centre。

不要在仓库中假装完成人工审核。实际审核人把批准副本写到受控的本地路径：

```bash
pnpm campus-map:official-facilities -- approve /absolute/path/pending.json \
  --reviewed-by "REVIEWER" --reviewed-on YYYY-MM-DD \
  --output /absolute/path/approved.json
```

批准操作会把审核人和日期纳入清单哈希。之后再修改任何字段都会令发布前校验失败。

## 发布、观察与续跑

`.env.local` 需要可信管理员的 UUID；可选 IP 只用于现有发布限流：

```bash
CAMPUS_MAP_OFFICIAL_FACILITY_ACTOR_ID=...
CAMPUS_MAP_OFFICIAL_FACILITY_CLIENT_IP=127.0.0.1
```

运行 `publish` 前必须先用正常部署流程应用 migration；若任一已审核 Floor 不存在，导入器会在首次
写入前返回 `canonical-floor-missing`。

批准前还应核对目标库已有的 Floor。同一 Building、同一楼层标签若已有不同 UUID，migration 会保留
已有行，不会覆盖它。此时应停下来人工确认该行；若复用已有 Floor，须同时修正待审核清单中的
`decision.floorId` 和 `fact.floorId`，用 `finalizeCampusMapOfficialFacilityManifest` 重算哈希，
重新校验后再批准。不要删除已有 Floor，也不要改动已经批准的副本来绕过检查。

先发布 OSA/UMSO canary：

```bash
pnpm campus-map:official-facilities -- publish /absolute/path/approved.json \
  --batch canary --progress /absolute/path/progress.json
```

在生产环境抽查 canary Changeset、公开搜索、地点卡、官方操作、编辑入口、revision 历史和来源记录。
检查发布错误、重复名称警告、来源冲突和 Current fact 读失败。确认无异常后才发布 RES；导入器也会
在任一 canary 尚未存在或仍需从 #865 旧事实升级时拒绝 RES：

```bash
pnpm campus-map:official-facilities -- publish /absolute/path/approved.json \
  --batch res --progress /absolute/path/progress.json
```

RES 完成后，在桌面和手机宽度各抽查不同 Building 的代表课室，核对搜索、地点卡、官方链接、编辑、
revision 历史和来源。随后观察一个工作日，再用同一批准清单重跑 canary 与 RES；两次都必须返回
`already-present`，且不能产生新 Changeset。最后重新抓取全部来源并比较清单；只要出现未审核差异，
就停止 rollout。确认进度文件中的 Changeset ID 可由治理入口执行修正、retire 或 revert，不能用 SQL
回拨 Current revision。

每批按稳定来源标识排序，再拆成最多 25 条的 Changeset。命令在第一次写入前检查整份清单、全部
Building/Floor 和全部稳定来源；来源若歧义或只指向已停用 Place，就直接停止。稳定来源已经存在时，
导入器还会逐字段比较 Current fact 与批准清单：完全相同才视为已完成；只要不同就列出 Current 与
批准值并停止，绝不覆盖社区后续修改。唯一例外是 #865 的固定代表性清单：若 Current fact 仍逐字段
等于该固定旧值，导入器会以 Current revision 为基线发布本清单已批准的新 revision；只要旧值曾被
修改，同样停止。升级只提交本次快照，并保留已有来源历史；泳池坐标证据原样复用 #865 的不可变
来源元数据。每个成功分块会原子更新进度文件。若遇到限流、网络中断，或数据库提交后进度文件
尚未来得及写入，等待后用完全相同的批准清单和命令重跑。续跑以数据库中的完整来源历史为准；进度
文件只是操作记录，不是事实来源。

发布器不会自动确认重复警告。若出现校验或警告拒绝，应停止并重新审核清单，而不是绕过现有发布
规则。

## 修正与回退

保留进度文件中的 Changeset ID。错误资料不能用 SQL 删除或把 Current 指针拨回旧行；应通过现有
Campus Map 治理路径发布新的修正、retire 或 revert Changeset，让旧 revision 和来源记录继续可审计。
任何修正同样要引用操作开始时的 Current revision。

## 本地验证记录（2026-09-10）

基于 main `0e17c0037`，在独立本地数据库 `cuclaw_issue867` 完整重放 migration（包括 67 个
本次有来源的 Floor）并加载开发账号，先通过现有 publisher 发布 #865 四条代表资料，再使用明确
标记为本地测试的批准副本运行导入。真实数据库先暴露了泳池坐标来源元数据冲突；修复为原样复用
已有证据后，重建数据库完整复跑。RES 在第八批触发正常限流，等待后从断点完成剩余四批。

最终为 285 个 Place（28 条 OSA/UMSO、257 条 RES）、73 个 Floor（其中 67 个来自本清单）、
14 个 Changeset、288 个 revision；254 个 Place 有 Floor，30 个 Building-only，1 个室外点。
重复运行 canary 与 RES 均返回 `already-present`，没有新增 Changeset、Place 或 revision。浏览器验证
了 CKB 的 UG/1/7 楼筛选、BFC 地下设施、课室楼层展示，以及“琴室”“会议室”等 OSA 中文搜索。
生产清单仍待人工审核；本地验证不代表已经完成生产发布或一个工作日观察。

## 本地复验记录（2026-09-12）

重新 fetch `origin/main` 后，远端仍为 `0e17c0037`。重新抓取全部 13 个官方页面，得到 289 条
候选；与 9 月 7 日清单相比，候选、提取字段、审核决定和拟发布事实均无变化。清单通过完整校验：
257 条 RES、26 条 OSA 和 2 条 UMSO 发布，4 条 OSA 明确跳过。

逐项核对 `cuclaw_issue867` 中全部 285 个 Place 的稳定来源与 Current fact：无缺失、无多余来源、
无来源歧义，全部事实字段与清单一致。67 个本次来源支持的 Floor 已存在；这不是全部校园建筑的
完整楼层目录，没有明确单层证据的设施仍保留 Building-only，不能从房间号补猜楼层。

带真实高德配置的开发服务恢复至 `http://localhost:3000`，手机宽度实测 CKB 108 的地图、1 楼位置、
RES 官方链接和详情入口。使用管理员账号通过正常地点编辑器发布测试备注，在历史页确认记录后，
再通过同一编辑器发布恢复 revision；没有用 SQL 删除记录或回拨 Current 指针。恢复后全量事实
再次与清单一致；数据库现为 285 个 Place、73 个 Floor、16 个 Changeset、290 个 revision。

用明确标记为 `LOCAL QA ONLY - NOT PRODUCTION APPROVAL` 的本地批准副本重跑 canary 与 RES，
分别识别 2 个和 11 个已有分块，均返回 `already-present`，没有新增 Changeset、Place 或 revision。
仓库内清单仍为 `pending`，本次复验不提供生产批准。

在仓库使用的 Node.js 20 下，`pnpm lint`（无错误，13 条已有警告）、`pnpm test`（2,991 条通过）、
`pnpm typecheck` 和隔离输出目录的 `pnpm build` 均通过。另对真实本地数据库运行清单、导入器和
楼层 migration 三组定向测试，22 条全部通过。全量单元测试中未配置数据库而跳过的用例，不计作
数据库验收；本次数据库结论来自定向测试和完整事实核对。最初使用本机 Node.js 25 的全量测试
因其内置 `localStorage` 缺少测试所需方法而失败，切回仓库 Node.js 20 后通过，未为此修改应用代码。

另用 production build 在独立的 `cuclaw_issue867_acceptance_e2e` 数据库运行 10 个 Chromium 交互
用例，全部通过：新增 Building-only / Floor 设施后编辑、Building 卡新增继承位置与不合资格编辑者
拦截、手机/平板/桌面的历史深链、登录限制、搜索与标记使用同一地点卡，以及详情返回搜索和
地点返回建筑卡。测试使用受控地图替身与测试设施；真实高德及已导入地点另由上述手工检查覆盖。
首跑因本机缺少对应版本的 Chromium 而未执行交互；安装官方测试浏览器后重跑通过。

剩余 rollout 检查仍包括实际审核人的批准、生产 canary / RES 发布与抽查、治理 retire / revert
操作验证，以及一个工作日观察；本地编辑器的修正与恢复不等于已经验证治理 revert。
