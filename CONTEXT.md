# CUpedia 权限与用户管理

CUHK 学生 wiki 的用户身份与访问控制术语。本文件只是术语表，不记录实现。

## Language

**User（普通用户）**:
通过 CUHK 邮箱注册的账号，默认角色。
_Avoid_: Account、Member

**Admin（管理员）**:
`role === "admin"` 的 User。当前只能通过 seed 或手改数据库产生——应用内缺少提升入口，这一缺失被认定为完整性缺陷，待补一个受保护的提升 action。
_Avoid_: Superuser、Owner

**Editor mode（编辑模式）**:
站点级开关 `wiki_edit_role ∈ {admin, user}`，决定"谁能编辑 wiki"。它是**模式**，不是**角色**——系统中不存在 per-user 的"编辑者"角色。
_Avoid_: 把"编辑者/Editor"当作一种用户角色来谈

**Banned（封禁）**:
User 上的布尔标记。写路径每次查库即时生效；读路径（session cookie 缓存）最多滞后 5 分钟。
_Avoid_: Disabled、Suspended

**Deleted page（已删除页面）**:
`deletedAt` 非空的 wiki 页面。采用 Wikipedia 模型——**存活**页面的历史/diff 公开可读；**已删除**页面的列表、正文、历史均仅限 Admin。普通 User 对已删页面只应看到"已删除"状态，看不到内容。例外：该页**上传的配图**有独立生命周期，不随页面删除而撤下（见 ADR 0002）。
_Avoid_: 把软删除当作纯导航隐藏；把“删页”理解为连带抹除媒体

**Discussion（讨论）**:
依附在 wiki 页面某段文字上的行内评论及其回复线程。任何登录 User 均可发起（与 Editor mode 无关，等同 Wikipedia talk page——锁定正文编辑也不锁讨论）；删除/标记解决限本人或 Admin。
_Avoid_: Comment（口语可，但代码/表名以 Discussion 为准）

**Eligible account（合规账号）**:
唯一允许注册/登录的身份：`@cuhk.edu.hk`，或 `@link.cuhk.edu.hk` 且前缀形如 `1155xxxxxx`。这是"谁能拥有账号"的授权边界，必须在**服务端发码环节**强制，而非仅客户端。
_Avoid_: 把白名单只放在 UI 层

## Read access（读边界）

公开阅读模型（Wikipedia）：wiki 正文与图片均对匿名开放，登录仅用于编辑/评论。注意这与"注册需 CUHK 邮箱"是有意分离的——**读公开、写/账号受限**。

## Flagged ambiguities

- **"编辑者" ≠ 角色**：当有人说"编辑者能不能删页面"时，先确认指的是"处于编辑模式下的 User"，而非某个独立角色。本项目只有 User / Admin 两级。

## 示例对话

> **甲**：编辑者能删页面吗？
> **乙**：项目里没有"编辑者"角色。你是说"开放编辑模式下的普通 User"吗？那种 User 能创建和编辑，但删除/恢复只限 Admin。
> **甲**：那 Admin 怎么来的？
> **乙**：目前只能 seed 或手改 DB——应用内没有提升入口，这是已认定的缺陷。
