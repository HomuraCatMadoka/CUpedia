# CUpedia 上下文地图

CUpedia 现有十个限界上下文。本文件是上下文清单和关系的唯一入口；每个 `CONTEXT.md` 负责本领域的语言与边界。

## 上下文

- [权限与用户管理](./CONTEXT.md)：全站身份、账号资格、角色与访问控制
- [课程技能树](./docs/course-tree/CONTEXT.md)：面向新生的游戏化课程探索与构筑
- [分院帽](./docs/college-picker/CONTEXT.md)：面向新生的书院志愿推荐
- [课程测评](./docs/course-review/CONTEXT.md)：课程口碑、评分、评论与互动
- [食堂](./docs/canteen/CONTEXT.md)：食堂、菜单、菜品评价、榜单与外部菜单同步
- [通知](./docs/notifications/CONTEXT.md)：各业务上下文面向 User 的站内消息
- [校园交通](./docs/campus-transport/CONTEXT.md)：CUHK 官方校巴服务和今日出行信息
- [校园地图](./docs/campus-map/CONTEXT.md)：经核对的建筑、楼层、地点、通常时间与官方入口
- [产品更新](./docs/product-updates/CONTEXT.md)：已经上线的 CUpedia 产品变化
- [公告](./docs/announcements/CONTEXT.md)：需要全站读者及时知道或采取行动的消息

## 关系

- **课程技能树 → 权限与用户管理**：构筑（Build）归属于一个 User。匿名访客可以浏览和试玩，合规登录账号才能保存。
- **课程技能树 ↔ Wiki**：MVP 是独立子系统，不建立自动互链。
- **课程测评 ↔ 课程技能树**：两者共享 `courses` 课程目录和课号身份，但分别拥有口碑与课程探索数据。
- **课程测评 → 权限与用户管理**：评分、评论与点赞归属于 User；公开读取，写入需要合规登录账号。
- **课程测评 → 通知**：课程测评提供回复事件和收件人，通知上下文负责投递与阅读状态。
- **分院帽 ↔ 课程技能树**：两者都面向新生，但“专业大类”不是课程技能树的“主修”，数据和语言保持独立。
- **食堂 → 权限与用户管理**：评论和已登录投票归属于 User；匿名投票使用独立会话，并继续受封禁规则约束。
- **通知 → 权限与用户管理**：每条通知归属于唯一 User，只有该 User 能读取或改变阅读状态。
- **校园交通 → 校园地图**：校园交通拥有运营 Stop 与服务事实，只引用校园地图经复核的稳定 Place ID；地图不能反向改写线路、站序或班次。
- **校园地图 → 权限与用户管理**：Current facts 与公开追溯资料的可见性不因查看者身份改变；消耗高德配额的 runtime、config 和 provider search 只向登录用户开放。
- **校园地图 ↔ 地图供应商**：Campus Map 保存供应商无关的 canonical Building / Place 身份与 WGS84 室外事实；高德底图热点提供浏览态命中对象，预加载的显式映射把其外部 ID 翻译为 canonical 卡片。外部 ID 不进入 canonical scene、URL 或事实；无映射热点只显示瞬时参考卡。
- **校园地图 ↔ 评论与评分**：评论和评分引用 canonical `placeId`，但不属于地点事实或其来源/修订历史。
- **产品更新 → 权限与用户管理**：产品更新公开读取，只有 Admin 能编写与发布。
- **产品更新 ↔ 公告**：产品更新记录已经上线的变化且不自动通知；公告承载需要及时知道或行动的消息。
- **公告 → 权限与用户管理**：公告公开读取，只有 Admin 能编写和管理状态。
- **公告 → 通知**：公告首次公开时可以请求通知上下文向现有 User 投递消息，后续生命周期彼此独立。

## 关键决策

- 课程技能树的数据与产品边界见 [ADR 0005](./docs/adr/0005-course-tree-data-provenance.md) 和 [ADR 0006](./docs/adr/0006-explorer-not-graduation-auditor.md)
- 食堂删除与开发模式见 [ADR 0023](./docs/adr/0023-canteen-hard-delete-and-mock-mode.md)，匿名投票边界见 [ADR 0024](./docs/adr/0024-canteen-anonymous-vote-only.md)
- 通知与来源的生命周期见 [ADR 0016](./docs/adr/0016-notification-source-lifecycle.md)
- 校园交通与地图的身份边界见 [ADR 0021](./docs/adr/0021-campus-transport-owns-operational-stops.md)
- 校园地图的 canonical 事实、直接 Changeset 发布与主观 Place feedback 边界见
  [ADR 0034](./docs/adr/0034-campus-map-provider-neutral-place-facts.md)、
  [ADR 0035](./docs/adr/0035-campus-map-direct-changesets.md) 和
  [ADR 0036](./docs/adr/0036-model-campus-map-place-feedback-as-one-current-submission.md)；
  高德热点与 canonical 卡片的交互边界见
  [ADR 0038](./docs/adr/0038-canonical-campus-map-browse-targets.md)，精简后的 V2 运营事实见
  [ADR 0040](./docs/adr/0040-campus-map-minimal-place-facts-v2.md)

完整决策清单见 [ADR 索引](./docs/adr/README.md)。
