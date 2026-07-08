# 搜索留在内存 Fuse,删掉无人查询的 trgm 索引,语料按时间刷新

wiki 搜索(`searchWikiPages` → `getCachedSearchablePages` → `src/lib/search.ts` 的 `searchPages`)**全程在内存里跑**:把所有未删页的 `{id, slug, title, extractText(content)}` 灌进内存缓存,先 `indexOf` 精确匹配、miss 才 fallback 到 `Fuse`。没有任何一条 SQL 走索引。据此:(1) migration `0003` 建的 `wiki_pages_title_trgm_idx` / `wiki_pages_content_trgm_idx` 两个 pg_trgm GIN 索引**没有任何读路径**,删除;(2) 搜索继续留在内存,不下沉 Postgres;(3) 语料缓存改为按时间刷新,不再每次写都清。触发背景:即将开放全员编辑,写路径变最热。

## Considered Options

- **下沉到 Postgres 全文检索(trgm `ILIKE` / `tsvector` + zhparser)**:语料不进内存,DB 侧直接出索引结果。但要重新引入中文分词(`0003` 恰恰是把 zhparser 的 `tsvector` 方案**换掉**的),承担快照分歧风险;而实测真实生产语料 **518 页 / content 共约 1MB,extractText 全量仅 3.7ms**,放大到 1 万页也才 54ms——CPU 完全不是瓶颈。对当前规模是过度投资。
- **每次写都清语料缓存(原实现)**:搜索永远最新。但语料 key `wiki-pages-search` 与 tree/content 共用 `wiki-pages` tag,每个 autosave tick 都 `revalidateTag` → 开放全员编辑后**几乎每次搜索都撞冷重建**,跨区从新加坡 SELECT 全语料(~1MB,随页数线性涨)。
- **留内存 Fuse + 删死索引 + 语料时间刷新(选定)**:
  - 搜索继续走内存(实测 CPU 非瓶颈;真正的重量是"跨区拉全语料 ~1MB"这一下网络传输)。
  - DROP `wiki_pages_title_trgm_idx` / `wiki_pages_content_trgm_idx`,停掉无人读的 GIN 写放大——其中 `content` 那个还建在大 JSON 列上,正好压在即将变热的写路径上。
  - 语料缓存分流刷新:**结构性变化(新建 / 删除 / 改标题)立刻刷,正文小改按时间刷新(~5min)**,不再挂在"每次写都清"的 tag 上。

## Consequences

- **DROP 走手写迁移**。`schema.ts` 的 `wikiPages` 索引块只声明了 `parent_id` / `slug`,这两个 trgm 索引**只存在于迁移链 `0003` 的手写 SQL**里,`drizzle-kit generate` 看不见、不会自动生成 DROP。因此新增一条**手写** `DROP INDEX IF EXISTS` 迁移(与 `0003` 建它们同源,属 AGENTS 承认的"非 schema.ts 可推导的手写 SQL"例外)。`pg_trgm` 扩展本身留着不动。
- **语料新鲜度按价值分流**:高价值的新鲜——新页可被搜到、删页从结果消失、改标题即时反映(title 在 `searchPages` 里权重 2)——立刻刷;低价值的——正文错别字反映到搜索摘要——容忍 ~5min 滞后。
- **记死 tripwire**:语料涨到 **~5000–1 万页(抽取后 ~10–20MB)** 时,"整包拉进内存 + 塞进 Vercel Data Cache 单条"开始撞跨区传输量与缓存单条体积上限,**那时才下沉 Postgres**。CPU 永远不是切换的理由。
- 搜索语料是"缓存分桶"故事里的一桶(结构桶 vs 内容桶):它的刷新策略与 tree 的结构性刷新对齐,与每次写都变的内容桶解耦。
- 跨区传输的**绝对毫秒未实测**(本地库量到的 63ms 基本是连接开销,数据太小);tripwire 用**语料体积**做代理指标,而非墙钟耗时。
