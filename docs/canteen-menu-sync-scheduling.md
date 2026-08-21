# 菜单同步调度：Vercel Queue（B）与外部 Scheduler（C）

状态：调研结论（2026-08-13）
范围：只讨论菜单 GET 同步的调度、重试和隔离，不讨论代下单或支付。

## 结论

**当前选择 C：用 GitHub Actions 定时调用 production 的“领取并同步一个来源”接口。**

原因不是 Queue 在技术上不可行，而是当前项目实测处于 **Vercel Hobby（legacy iteration，active）**，启用来源约个位数、目标是每天一次或三餐前同步：

- Hobby 的 Vercel Cron 每个项目虽然可配置最多 100 个任务，但最短只能每天一次，且触发精度为目标小时内 `±59 min`，不能满足三餐前分别同步；[Vercel Cron usage and pricing](https://vercel.com/docs/cron-jobs/usage-and-pricing)
- Hobby Function 最长可配置 60 秒，正是现有 route 的 `maxDuration = 60`；Pro 才可配置至 300 秒。因此把所有来源串行放在一个 invocation 里没有剩余伸缩空间；[Vercel Hobby plan](https://vercel.com/docs/plans/hobby)
- GitHub Actions `schedule` 最短间隔 5 分钟，可一天配置三个时点；仓库 `HomuraCatMadoka/CUpedia` 已通过 GitHub API 确认为 public，使用 standard hosted runner 的执行分钟免费且不计入私有仓库月度分钟额度。不要选择 larger runner；它即使在 public repo 也收费；[GitHub schedule](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)，[GitHub Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions)
- Vercel Queues 的 durability、自动 retry、幂等键和 consumer concurrency 更强，但截至调研日仍标为 **Beta**。对于个位数来源，它会引入第二套运行抽象和 beta 依赖，收益暂时小于维护成本；[Vercel Queues](https://vercel.com/docs/queues)

不要把 C 实现成“GitHub Actions 远程执行全部抓取”。GitHub 只负责唤醒；实际 provider 请求、规范化和 DB transaction 仍运行在 production Vercel Function 中，避免把数据库凭据和供应商逻辑复制到 runner。

调度器与同步实体必须分离：Cron route 和 GitHub workflow 都只是 transport adapter；同步执行模块本身可以由 HTTP route、仓库 CLI 或未来本地服务器进程直接调用。迁移运行环境时只替换调度/启动 adapter，不复制 provider 或数据库事务逻辑。

## 已确认的当前状态

只读 Vercel 项目/团队信息表明 CUpedia 当前为 `hobby`、`legacy` plan iteration、状态 active，且没有 contract commitments。这里不记录无关的账号、邮箱或内部 ID。

仓库在 #634 前的实现：

- `vercel.json` 只有 `0 20 * * *`，即每天 20:00 UTC（香港次日 04:00）一次；
- `/api/cron/canteen-menu-sync` 固定 `maxDuration = 60`；
- route 一次读取全部 enabled sources，以并发 2 分批等待全部结束；
- provider request timeout 为 15 秒，部分 provider 需要多个串行请求；
- `CRON_SECRET` Bearer 校验正确保护了当前入口，但 route 仍是“全量 drain”，不是可恢复的单来源 job。

Vercel 官方说明可在 dashboard team switcher 旁查看 plan，Usage 页面查看项目近 30 日消费；后续升级或迁移后，应重新核对而不是依赖本文快照。[Vercel usage management](https://vercel.com/docs/pricing/manage-and-optimize-usage)

## B/C 对比

| 维度         | B：Vercel Cron → Queue → 每来源 worker                                                                                                                  | C：GitHub Actions → 单来源 production endpoint                                                                                                                |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 当前订阅适配 | Queue beta 对所有 plan 开放，但 Hobby Cron 仍只能每日一次；若三餐前派发，仍需外部 scheduler 或升级 Pro                                                  | 不要求升级 Vercel；Actions 可一天触发三次                                                                                                                     |
| 执行隔离     | 每来源一条 message；一个来源失败不会拦住其他来源                                                                                                        | 每次 HTTP 请求只领取一个来源；workflow 循环/并发请求，隔离效果相同但需自行实现领取协议                                                                        |
| 重试         | 未 ack 或 Function crash/timeout 后自动 redeliver；可按错误决定 retry/ack                                                                               | workflow step 要显式重试；GitHub 不会因业务 HTTP 失败自动重跑，需 shell/action retry 与 `workflow_dispatch` 补跑                                              |
| delivery     | at-least-once；最长保留期内重复投递是正常情况                                                                                                           | schedule 可能延迟，高负载时甚至可能丢弃；请求超时也可能发生“服务端已完成但 runner 未收到响应”                                                                 |
| 幂等         | publish 可带 idempotency key，但 consumer 仍须幂等                                                                                                      | 必须由 DB lease/run key 实现；不能把 HTTP 200 当成 exactly-once                                                                                               |
| 限流         | push consumer group 可设置 max concurrency，适合按 provider 控制下游并发                                                                                | GitHub workflow `concurrency` 只能控制整轮；provider 级并发/退避仍要由 endpoint 的 DB claim 和代码控制                                                        |
| 凭据         | push consumer 没有公网 URL，由 Vercel 内部触发；Queue API 使用 Vercel OIDC                                                                              | 最小方案需要 GitHub Actions secret + Vercel env 中同一长随机 secret；也可让 endpoint 验证 GitHub OIDC JWT，但需要自行实现 issuer/audience/repository/ref 校验 |
| Preview 安全 | Queue push 与 deployment 绑定，消息默认回到发布它的 deployment；生产 cron 只会发布生产消息                                                              | `schedule` 只运行 default branch；workflow 必须硬编码 production origin，禁止使用 PR/preview URL，生产 secret 不得暴露给 fork PR                              |
| 可观察性     | Queue 有 message age、throughput、consumer 等专用观测；无内建 DLQ，poison message 要在 retry callback 中终止/另存                                       | Actions 有每轮日志、通知和手动重跑；每来源真相必须落在 DB source health 与 run 历史，不能只依赖短期 runner log                                                |
| 成本         | Queue 仍为 beta；官方主页说明 all plans 可用，但本次没有在稳定 pricing 文档中确认独立 Queue operation 的长期价格。Function execution 仍计入 Vercel 用量 | 公开仓库标准 runner 免费；私有 GitHub Free 2,000 分钟/月，超额 Linux 2-core 当前为 US$0.006/min                                                               |
| 维护负担     | 增加 Queue SDK、topic/consumer deployment 配置、retry callback、消息版本与 beta 升级关注                                                                | 增加一个小 workflow、一个受保护 endpoint；复用既有 source claim 与 run 历史，当前团队更容易理解和排错                                                         |

Queue 的关键保证与限制来自官方文档：消息接受后复制、失败自动重投、at-least-once、idempotency key、push concurrency、没有内建 DLQ；消息重复仍必须由业务幂等兜底。[Vercel Queues](https://vercel.com/docs/queues)，[Queues API](https://vercel.com/docs/queues/api)

GitHub 的关键限制是：scheduled workflow 只从 default branch 运行；高负载时可能延迟甚至丢 job，整点更容易拥堵；公开仓库 60 天无活动会自动停用 schedule。[GitHub schedule](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)，[workflow disabling](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/disable-and-enable-workflows)

## C 的目标形态

### 1. 单来源领取接口，而不是全量 route

production endpoint 语义为：

```text
POST /api/internal/canteen-menu-sync/next
Authorization: Bearer <MENU_SYNC_TRIGGER_SECRET>

200 { disposition: "continue", window, sourceId, result }
200 { disposition: "retry-later" | "stop-for-review", window, sourceId, code }
200 { disposition: "no-work", window }
```

调用方不提交 source、canteen、provider、URL 或时间；这些事实全部来自数据库。一次 invocation 最多同步一个来源：

1. 用数据库时间划分固定香港窗口：早餐 `00:00–10:59`、午餐 `11:00–16:59`、晚餐 `17:00–23:59`；
2. 在短 transaction 内，从 enabled 来源中按现有 claim 与 run 历史原子领取一个；
3. transaction 提交后才拉取并应用菜单；
4. 写最终 run/source health 并释放 claim；
5. 返回调用方应继续领取、稍后重试、停止审查或结束。

`applied` 或 `unchanged` run 使该来源在当前窗口完成，即使 HTTP 响应丢失也不会重复领取。活跃 claim 不重复执行；过期 claim 沿用 source-sync fencing 接管。瞬时失败在同一窗口最多 3 次，第一次失败后退避 2 分钟、第二次失败后退避 5 分钟；达到上限、冲突、身份 churn、可疑下降或 `INVALID_*` 配置错误返回 `stop-for-review`。这些状态从既有 run 历史推导，不新增 job/lease 表或可漂移的 attempt 字段。

入口只在 `VERCEL_ENV=production` 可用，缺少 `MENU_SYNC_TRIGGER_SECRET` 时 fail closed。它与旧 Vercel Cron 的 `CRON_SECRET` 分离。Function 在领取后超时也没关系：claim 到期后下次调用可按 fencing 语义接管；同步 apply 继续保持幂等，不能依靠调度器提供 exactly-once。

### 2. Workflow 只唤醒 production

- 三个 schedule 避免写在整点，并落在对应窗口开始之后，例如香港时间 `07:07`、`11:07`、`17:07`；其中午餐必须晚于已观测的 `10:55` PinMe 开始边界。GitHub 已支持 IANA timezone，也可继续用 UTC；
- 加 `workflow_dispatch` 供补跑；
- `permissions: { contents: read }`，若 workflow 不 checkout，甚至可设 `contents: none`；
- 使用固定 production origin，不读取 deploy preview URL；
- workflow 级 `concurrency` 防止同一餐段重叠，DB lease 仍是最终保护；
- 循环调用 `next`，设置来源数上限（例如 12）和整轮时间预算；
- 只在 endpoint 明确返回 `retry-later` 时退避重试；网络 timeout、非 2xx、schema error 与 `stop-for-review` 立即失败并告警；
- secret 只放 GitHub Actions repository/environment secret 与 Vercel Production env，响应和日志不得打印它。

GitHub OIDC 能签发短期 JWT，云服务或自建 relying party 可按 issuer/audience/claims 验证，从而避免长期 secret；但 Vercel 应用 endpoint 不会自动替本项目完成这层验证。当前最小实现先用专用随机 secret，等已有统一 OIDC verifier 再迁移，避免为了一个低频 trigger 自造不完整认证。[GitHub OIDC hardening](https://docs.github.com/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-cloud-providers)

### 3. Provider 限流

若未来真实出现 provider 限流，再扩展 provider 级策略；#634 当前不预建第二套调度状态：

- 同一 provider 默认并发 1；不同 provider 可并发；
- 429 应尊重 `Retry-After`；在需要跨窗口保留 provider 指定时间前，不预先增加 `nextAttemptAt`；
- timeout/5xx 指数退避并加 jitter；
- 4xx 配置错误不自动重试；
- 每个来源保留最后成功快照，失败不下架现有菜单。

这套状态是 B/C 都需要的。Queue 的 dedupe 不能代替 source lease，因为 at-least-once redelivery 和管理员手动触发仍可能重叠。

## 部署与预览安全

1. production endpoint 默认拒绝 `VERCEL_ENV !== "production"`，或 preview 根本不配置 trigger secret；
2. GitHub schedule/dispatch 只调用固定 production domain；
3. 不让 PR 参数控制 URL、source ID 或 Authorization header；fork PR 默认拿不到 Actions secrets，也不能因此放宽 endpoint；
4. 只允许 DB 中 enabled、due 的来源被 `next` 领取，调用者不能提交 provider URL；
5. 可选记录 trigger 类型、GitHub run ID 的 hash 和 schedule window，不保存 token；
6. GitHub Actions 与 Vercel Production 使用同一个专用 `MENU_SYNC_TRIGGER_SECRET`；旧 `CRON_SECRET` 不再授权任何菜单同步入口。

## 何时升级到 B / Pro

当前继续 C，满足以下任一条件再评估 B：

- enabled sources 超过 **20**，或一轮需要超过约 **20 次 Function invocation**；
- 一天超过 **3 个同步窗口**，或需要在失败后分钟级自动恢复；
- 供应商 429/5xx 使人工补跑达到每月数次；
- 需要稳定的 per-message retry、message age、consumer concurrency，自己维护 job/lease 已成为主要负担；
- 产生不止菜单同步的一组异步任务，Queue 能被多场景复用；
- Vercel Queues 退出 beta，且价格/SLA 能被当前预算接受。

升级路径：

- **只升级 Pro、不上 Queue**：可用 Vercel 每分钟精度 Cron、最长 300 秒 Function；适合仍是个位数来源但想移除 GitHub scheduler 的情况。仍应保留单来源 endpoint/lease，不回到单 invocation 全量串行。
- **Pro + B**：当来源和失败重试显著增加时，Vercel Cron dispatcher 发布每来源消息，push consumer 限并发。生产链路完全在 Vercel 内，运维更统一。
- **Hobby + B**：Queue 技术上可用，但三餐调度仍需 GitHub Actions；会变成 C 负责 schedule、B 负责 delivery 的混合架构。当前规模没有必要承担两套系统。

## 决策

当前落地 C，并以可重复调用的单来源 `next` worker 作为唯一生产菜单同步入口。最终 cutover 同时删除原 Vercel Cron 与全量 cron route，不保留绕过 `next` 的低频兜底。

短期验收条件：

- 每日三个餐前 schedule；
- 单来源失败不阻塞其他来源；
- workflow/HTTP 重试不会重复创建、认领或下架菜品；
- 可手动 dispatch 补跑；
- production-only、secret 不出日志；
- DB 可查询每个来源的 last success、last failure、attempt、next attempt 和 lease；
- 模拟 Function timeout 后，lease 到期能继续处理。
