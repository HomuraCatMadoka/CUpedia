# 站长(Owner)层:角色管理收归单一站长,存于 site setting

为了让管理员能在网页(而非手改数据库)任命,CUpedia 在 User / Admin 之上引入第三层 **站长(Owner)**:全站唯一、能变更他人 `role` 的身份。站长**不是**新的 role 取值,而是一名被指定的 Admin——其 userId 记录在 `siteSettings.owner_user_id`。普通 Admin 之间对等,可封禁/删页/调编辑模式,但**无权**任免管理员或动站长。

## Considered Options

- **扁平模型**:任何 Admin 都能提升/降级任何 Admin。最简单,但允许"政变"——一个 Admin 可单方面把其余 Admin 全部降级、独占后台。在多名学生共管的公开站点上是真实风险,否决。
- **站长作为第三个 role 字符串**(`role ∈ {user, admin, owner}`):语义最直白,但代码中约 10 处 `role === "admin"` 会突然把站长排除在外(requireAdmin、requireEditor、讨论管理、wiki 编辑 UI 等),逐处改成"admin 或 owner"既脆弱又违背"针对性改动",否决。
- **站长 = `siteSettings.owner_user_id`,全站恰好一个(选定)**:站长仍是 `role:"admin"`,既有 admin 判断零改动;只有新的角色管理逻辑去比对该设置。

## Consequences

- 站长是 Admin 的**超集**:所有既有 `role === "admin"` 门禁不动,站长自动通过;仅 `setUserRole` 经 `requireOwner`(= requireAdmin + `id === owner_user_id`)放行。
- `setUserBanned` 必须新增"普通 Admin 不能封禁站长"一道护栏——否则封禁就成了绕过角色保护的政变后门。
- 站长是**信任根,只能从数据库诞生与移交**:首次设置 `owner_user_id`、日后移交都走 DB,应用内不提供引导/移交入口。未设置时,全站无人可改角色(角色按钮对所有人隐藏),为预期的未引导锁定态。
- `setUserRole` 无需 `LAST_ADMIN` 护栏:站长是永久 Admin,降级永远清不到零管理员。
- 单站长带来 bus-factor 风险(站长账号丢失即无人能任免),以"运营者握有数据库直接访问"作为终极兜底。
