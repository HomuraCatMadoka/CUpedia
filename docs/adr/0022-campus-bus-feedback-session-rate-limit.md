# ADR 0022: 校巴匿名反馈使用短期会话限流

## Status

Accepted

## Context

- 校巴到站反馈必须允许匿名写入，并将原始观测作为不可变模型证据保存。
- 稳定的 IP 派生 hash 会让同一网络来源在观测历史中长期可关联。
- CUHK 校园 NAT/VPN 下，按 IP 限流会让大量独立乘客共享额度。

## Decision

1. 匿名反馈使用 HMAC 签名、`HttpOnly`、`SameSite=Lax` 的一小时随机会话 cookie。
2. 默认限额是每个会话每 10 分钟 12 次；检查与计数在同一事务中，并通过会话级 advisory lock 串行化。
3. 限流状态保存在 `campus_bus_feedback_rate_limits`；每次反馈利用 `expires_at` 索引最多回收 100 个到期会话，避免无界增长或一次删除过多记录。
4. `campus_bus_arrival_observations` 不保存 IP、网络 hash、会话 ID 或其他限流标识。
5. 该额度是防止误操作和低成本脚本的礼貌限流；清除 cookie 可以取得新会话，不将其宣传为强身份防滥用。
6. 原始观测的不可更新、不可删除约束由 PostgreSQL trigger 强制。Drizzle schema DSL 不能声明 trigger，因此 `0071_immutable_campus_bus_observations` 是用 `drizzle-kit generate --custom` 建立并纳入 journal 的 custom migration；后续只能新增迁移修改该约束，不得改写已经应用的文件。

## Consequences

- 校园 NAT/VPN 用户互不影响，观测数据也不带可用于长期关联的网络标识。
- 强对抗滥用需在不污染观测数据的独立边界追加，例如边缘 WAF、验证码或设备证明。
