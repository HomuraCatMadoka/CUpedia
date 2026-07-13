# viewer 的"能否编辑"收敛为单一谓词,显示侧吃缓存、强制侧走 fresh

"这个访客在当前编辑策略下能否编辑"目前散成 **5 份**:4 个 wiki 页面组件里内联 `canEdit = !!user && (editRole === "user" || user?.role === "admin")`(`wiki/[...slug]`、`wiki/search`、`wiki/page`、`wiki/history/[...slug]`),外加 `auth-guard.ts` 的 `requireEditor` / `requireEditorOrRedirect`。布尔逻辑等价(内联是 guard 的德摩根),但**输入分叉** → 边缘漂移。收敛为单一纯谓词 `canViewerEdit`,两侧共用;新鲜度差异保留、且**有意为之**。

现状的两条真漂移:(1) **banned**——显示侧走 `getOptionalUser()` 读 session、不查封禁;强制侧走 `requireAuth()` 查库、banned 直接 redirect → 封禁用户看得到编辑按钮、点保存才被拒。(2) **新鲜度**——显示侧读 session 的 role(≤5min cookie 缓存)+ `getWikiEditRole()`(进程模块缓存);强制侧读 fresh DB role + `getWikiEditRoleFresh()`。

## Considered Options

- **两侧都统一到 fresh 输入(A)**:显示侧也 `requireAuth` + `getWikiEditRoleFresh`,与强制侧分毫不差、绝不漂移。但一次**热缓存浏览现在是零跨区往返**——`getWikiPage` / `getWikiTree` / backlinks 全走 `unstable_cache`(Vercel Data Cache),身份走 cookie session,editRole 走模块缓存。A 会在这条**最高频**路径上凿进 2 次 fresh 跨区查库(香港→新加坡),每个访客每次翻页都付,只为消一个**服务端已经兜住**的显示不一致——等于往作为护城河的 Data Cache 上凿洞。且"A 但缓存起来变便宜"会退化回 B:fresh 的全部意义就是不能缓存。
- **各写各的(原实现)**:5 份副本,逻辑一改要同步 5 处,漏一处即静默漂移。
- **单一谓词 + 两侧各自新鲜度(选定)**:纯函数 `canViewerEdit(viewer, editRole)`(`viewer: { role, banned } | null`)是唯一的家。**显示侧**喂 session 的 role+banned + 缓存 editRole(cache-only,不碰跨区);**强制侧** `requireEditor` 喂 fresh DB role+banned + fresh editRole。逻辑不可能漂(只一份);新鲜度差异有意——显示是装饰、容忍 ≤5min stale,强制是安全边界、必须 fresh。banned 本就在 session 附加字段上,显示侧顺手判 → **零额外查库修好 banned bug**。

## Consequences

- 新增纯谓词 `canViewerEdit`(放 `site-settings.ts` 或新建 permissions 模块)。4 个页面的内联布尔换成一个**显示适配器**(如 `getViewerEditContext()`:内部 `getOptionalUser` + `getWikiEditRole`,返回 `{ user, canEdit }`),页面从各自一段布尔降到一行调用。
- `requireEditor` / `requireEditorOrRedirect` 改为调同一谓词(喂 fresh 输入),对外行为不变(仍 `throw` / `redirect`)。
- **显示侧与强制侧新鲜度故意不一致**:显示 ≤5min stale(cookie session + 模块缓存 editRole),强制永远 fresh。**不要把这个"不一致"当 bug 修成显示侧也 fresh**——那会在最热的浏览路径重新引入跨区往返、凿穿 Data Cache 护城河(见 A 选项)。
- banned 显示 bug 顺带修好:谓词纳入 `banned`,显示侧读 `session.banned`(better-auth 附加字段,无额外查库)。
- 谓词是纯函数 → **接口即测试面**:`role × banned × editRole` 的真值表可直接单测,不必 mock 会话或 DB。原先"真正的 bug 藏在怎么调它"的散落逻辑就此集中。
