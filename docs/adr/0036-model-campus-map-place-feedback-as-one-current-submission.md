---
status: accepted
---

# ADR 0036：Campus Map 将星级和评价建模为一份当前地点反馈

> 部分由 ADR 0037 取代：仅“未来照片附件沿用 feedback ID”的预告失效；本 ADR 的评分、
> 评价、可见性和治理决议继续有效。

Campus Map 需要公开的地点口碑，但主观体验不能进入 canonical Place fact。每个符合资格的
User 因此只在一个 Place 上维护一份当前 Place feedback：必填 1–5 整数星级，可选一段有界
评价文字。星级和文字共享创建、编辑、删除、隐藏、停用和合并语义，不引入两套身份或历史。

## 决议

1. `campus_map_place_feedback` 使用独立 UUID，引用稳定 `place_id` 和作者 `user_id`，保存
   `rating`、可空 `content`、正整数 `version`、`created_at` 与 `updated_at`。
   Place 外键限制删除，User 外键级联删除；`(place_id, user_id)` 唯一，`rating` 只能是 1–5，
   `updated_at` 不早于 `created_at`。非空文字去除空白后不得为空，并同时限制在 2,000 字符和
   8,192 UTF-8 bytes 以内。`version` 只服务当前反馈的 CAS 并发控制，不建立反馈修订历史。
2. `campus_map_place_feedback_visibility` 以 `feedback_id` 为主键，保存 `public | hidden`、
   `decision_ref` 和 `updated_at`。公开状态没有 decision ref，隐藏状态必须有；创建反馈和
   visibility 在同一事务完成。公开读取必须内连接并明确筛选 `public`，缺失 visibility 时
   fail closed。管理员隐藏整份反馈，因此它的星级、文字和未来附件都退出公开读取与聚合；
   用户编辑隐藏反馈不会自动恢复公开。举报、案件和裁决复用现有治理模型，并增加 feedback
   作为稳定目标类型。
3. active Place 接受创建、修改和删除；retired Place 保留既有反馈和聚合，但拒绝普通 User
   创建、修改或删除，管理员仍可执行隐藏和恢复公开。用户删除采用 hard delete，并级联删除
   visibility。已有举报、案件和裁决继续保留，将目标显示为已删除或不可用；MVP 不额外保存
   被删除原文的私有快照。删除后再次发布使用新的 feedback ID 和公开 visibility，重复违规
   由再次隐藏或贡献限制处理，不跨删除保留隐藏状态。
4. Place merge 与反馈搬移使用同一事务。用户只在 loser 上有反馈时，原反馈行改为引用
   survivor，保留 feedback ID、visibility、举报和未来附件引用。用户在两边都有反馈时，
   survivor 上的反馈胜出且保持不变；loser 反馈留在永久 redirect tombstone 上，不进入
   survivor 的公开列表或聚合。实现按稳定顺序锁定反馈行，不以“最后编辑”复制内容或删除
   另一条反馈。
5. 公开摘要只从 `public` feedback 即时计算普通平均分、评分数和有文字的评价数；首版不建立
   聚合表。分类结果通过批量读取接口获取摘要，评价列表以 `(created_at, id)` keyset 分页。
   唯一索引之外只预置 `user_id` 和 `(place_id, created_at desc, id desc)` 索引，其他索引以
   实际查询计划为依据。
6. 原始反馈和治理表保持 RLS/fail-closed，由服务端安全投影提供游客读取。创建发生唯一冲突时
   不静默覆盖；更新和删除以反馈 ID、作者及预期 `version` 做 CAS。

## 后果

- 评分和评价拥有一个清楚的用户心智模型，管理员也不会出现“文字已隐藏但评分仍影响平均分”
  的半隐藏状态。
- 合并规则牺牲极少数重复反馈中的“最近编辑者胜出”，换取稳定引用、治理状态和未来附件不被
  混合或删除。
- 首版不加入 withdrawn/merged 状态、反馈历史、幂等请求、作者快照、预计算聚合或图片字段。
  #818 增加附件时沿用 feedback ID，并单独负责对象存储清理。
- 如果产品以后要求只隐藏文字但保留星级，或删除后仍向管理员展示原文，需要以新决议扩展
  当前模型，而不能在读取查询中暗中改变这些语义。
