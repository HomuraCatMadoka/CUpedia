# ADR 0009: 食堂匿名投票写权限

## Status

Accepted

## Context

- [ADR 0001](./0001-public-read-cuhk-gated-write.md) 规定读路径公开、写路径需 CUHK 登录。
- 食堂大众口味测评要求**未登录用户也能投票**，否则校园场景下参与门槛过高。
- 匿名写入若完全开放，易被脚本滥用，消耗 Supabase 额度。
- CUHK 校园 NAT/VPN 下按 IP 限流会误伤大量用户。

## Decision

1. **唯一例外**：食堂菜品点赞/点踩是 CUpedia 中唯一允许匿名写入的用户生成内容；评论、弹幕、Admin 仍遵循 ADR 0001。
2. 匿名写入凭证为 **HMAC 签名 cookie** `canteen_anon_session`（`HttpOnly` + `SameSite=Lax`），绑定 `anonymousSessionId`；无有效签名 cookie 时**拒绝写库**。
3. 登录用户以 `userId` 标识票；匿名与登录票**不合并**（MVP 已知双票）。
4. 投票 upsert：同 `(userId|anonymousSessionId, menuItemId)` 覆盖更新；取消为 `vote = NULL` 留行。
5. 限流按 **cookie / userId**，不按 IP；`CANTEEN_VOTE_RATE_LIMIT_PER_MIN` 为礼貌限流。
6. 菜单赞踩计数经 `unstable_cache`（`revalidate: 60`，tag `canteen-vote-counts`）缓存；**投票写入时** `revalidateTag` 该 tag，避免硬刷新后「我的投票」高亮与计数不一致。他人投票的聚合计数在未写入时仍最多约 60s 延迟。「我的投票」走不缓存查询 + 乐观 UI。
7. Cookie 禁用者：投票 UI 显示「投票需允许 Cookie」，不开无 cookie 后门。

## Consequences

- 与 ADR 0001 的关系须在代码审查中显式核对：新增匿名写能力不得扩散到其他子系统。
- 匿名 cookie 过期后可再投；排行计数最多约 60s 延迟。
- 实现见 `src/lib/canteen-anon-session.ts`、`src/lib/canteen-vote-actions.ts`。

## Related

- [ADR 0001 — 读公开，写与账号受 CUHK 限制](./0001-public-read-cuhk-gated-write.md)
- [ADR 0008 — 食堂硬删除与 mock 模式](./0008-canteen-hard-delete-and-mock-mode.md)
