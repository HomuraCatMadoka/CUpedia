# 媒体生命周期独立于页面生命周期(删页不撤图)

CUpedia 上传的图片采用 Commons 模型:媒体一经上传即无条件匿名公开,其可达性独立于所引用页面的删除状态。软删除一个 wiki 页面只把它的正文与历史收归 Admin-only(靠 `deletedAt` 过滤),不会撤下该页的配图——图片仍停留在公开 URL 上。这与 Wikipedia 一致:删一篇文章不会删 Commons 上的媒体。

## Considered Options

- **媒体随页面受控**:把编辑器上传切到代理路由(`uploadAsset` + `/api/wiki-assets`),建 asset↔page 关联表,桶从公开翻为私有,使已删页面的图也仅 Admin 可读。否决——需要一整套架构改造,且与现状(桶 `anonymous download`、key 为随机 UUID、无关联表)相去甚远。
- **Commons 模型(选定)**:媒体有独立生命周期,删页不撤图,匹配现状与 Wikipedia 心智。

## Consequences

- ADR 0001 "已删除内容仅 Admin 可读"的例外**仅覆盖页面正文与历史,不覆盖上传媒体**。
- 已删页面的配图凭其不可猜的 UUID URL 仍可达;真正"抹除媒体"需另做 purge 机制(当前不存在,删页不回收对象存储)。
- 现存的 `/api/wiki-assets` 代理路由与 `uploadAsset` 是未接线的死代码:真实上传链路是 `/api/upload` → `uploadFile` → MinIO 直链。`AGENTS.md` 中"别从 MinIO 直供、走 `/api/wiki-assets` 做访问控制"的反模式与现状不符,待校正。
