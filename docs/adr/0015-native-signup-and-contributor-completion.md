# 原生注册与按需完善署名账户

注册与登录必须是两条不同边界。新用户先通过 better-auth 原生 email/password signup 一次性提交邮箱、昵称和密码，再用 `email-verification` OTP 验证邮箱并建立会话。OTP 登录只服务已有用户，启用 `disableSignUp`，不再隐式创建缺少昵称和密码的账户。

历史 OTP-only 账户不做批量回填，也不在浏览时持续提醒。用户仍可正常登录和阅读；只有在新增需要公开展示身份的内容前，服务端才要求同时存在有效昵称和 credential password。客户端在同一页面打开账户完善框，成功后继续原动作，以保留编辑中的草稿。

## Considered Options

- **继续让 OTP 登录自动建号**：入口短，但会生成没有 nickname/password 的半成品账户，注册与登录语义混在一起。
- **登录后全站强制 onboarding**：数据最整齐，但历史用户无法先浏览，也会产生持续打扰。
- **原生完整注册 + 写入时按需完善（选定）**：新账户从创建时完整；历史账户只在公开署名写入前补齐，迁移成本和用户打扰都较小。
- **批量生成昵称或密码**：无法替用户选择公开身份，也不应生成用户不知道的密码。

## Consequences

- `nickname` 是 signup 必填附加字段；password 由 better-auth credential provider 创建和散列。
- email/password 登录要求邮箱已验证；验证 OTP 成功后自动建立会话。
- 账户完善密码必须调用 better-auth `setPassword`，不得直接写 account 表，也不得覆盖已有密码。
- 服务端是最终边界。Wiki 新建/编辑/回滚、讨论及回复、署名课程测评、食堂评论和弹幕都检查账户完整性；删除、管理、浏览和明确匿名的测评不检查。
- 完善操作允许部分成功后重试，并处理并发请求已经设置密码的竞态。
