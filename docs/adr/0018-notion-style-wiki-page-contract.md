# ADR 0018：Notion 式 Wiki 页面合同

状态：Accepted

## 决议

Wiki page 只以数据库 UUID 标识。唯一正文路由是 `/wiki/<page-id>`，编辑与阅读共用该路由；登录且有权限的用户看到编辑器，匿名访客和无编辑权限用户立即看到公开正文。历史路由是 `/wiki/history/<page-id>`。标题、层级和图标都可变，不参与身份或 URL。

创建页面时客户端先生成 UUID，并把它同时作为页面 ID 和同一次创建重试的幂等键。服务器立即插入一个公开、未命名、空正文页面及首条 revision，随后浏览器进入同一路由编辑。离开空白页面不会自动删除；页面永久保留，除非管理员明确软删除。`/wiki/new` 和独立 `/wiki/edit/*` 不再是产品入口。

左侧页面树是服务器层级的常驻客户端投影。创建、改名、移动、改图标和删除可先投影，服务器确认后固化，失败则回滚；数据库 `parentId` 仍是权威层级。正文和页面属性共享 autosave 状态机，但页面没有可编辑 URL 字段。

服务器页面始终是唯一公开版本。本地 IndexedDB 草稿仅用于恢复当前用户、页面和编辑会话中尚未确认的输入；冲突时回到服务器版本编辑最终结果，不允许整页覆盖服务器。普通写入由 version CAS 保护，回滚和删除另行递增 `contentGeneration`。多人实时协作、presence 和 Yjs 文档留待后续；未来 Yjs 以 page UUID 为文档键，并替换编辑器持久层，而不改变公开页面合同。

## 迁移

这是一次性合同迁移，不保留 slug alias、slug 查询或重定向。生成迁移直接删除 `wiki_page_aliases`、slug 唯一约束、slug 索引和 `wiki_pages.slug` 列。seed、Notion import、搜索、页面树、revision、rollback 和测试夹具全部只传 UUID。

部署采用 migration 直接切换；迁移与新实例之间不设置双写或兼容窗口。滚动部署期间尚未退出的旧生产实例可能因访问已删除列而短暂报错，这是已接受的发布代价。

## 后果

- 中文标题不需要编码进 URL，也不会因改名造成链接漂移。
- 旧 slug URL、`/wiki/new` 和 `/wiki/edit/*` 正常返回 404。
- 新建和更新路径不再调用 slug 生成或校验，因此不能产生 `Invalid slug`。
- Notion import 从导出文件的 32 位页面 ID 生成规范 UUID；内部链接直接写 `/wiki/<UUID>`。
