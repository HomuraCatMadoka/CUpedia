# 页面树与目录并存的导航壳:tree 提到 wiki 段 layout 常驻,TOC 独立成列

wiki 导航壳原本把**页面树(tree)**与**页内目录(TOC)**塞进同一列 `<nav>`,靠"当前页有标题就渲 TOC、否则渲 tree"的二选一 swap 分流(`WikiSidebar` 内的条件分支)。读一篇有标题的页时,页面树整个消失——用户失去"我在整棵 wiki 里的位置"这个导航锚点。swap 之所以存在,是因为 `WikiSidebar` 是 client 组件、挂在**页面**里,每次导航它的 `pages`(整棵树)props 都进 RSC 载荷(#136);把树在读页上藏掉是当时压载荷的手段(#138)。

改为二者**并存(coexist)**的三列壳 `[ tree │ 内容 │ TOC ]`:

- **tree 提到 `src/app/(main)/wiki/layout.tsx`(新增,Server)**:整个 wiki 段的公共壳。App Router 的局部渲染会在 wiki→wiki 导航间**保留共享 layout**——tree 只在进入 `/wiki/*` 时渲一次,之后不重挂、其 RSC 也不随每次导航重发。这比 swap 更**根本**地解决 #136:载荷问题的根因是"树挂在页面里",把它挪到 layout 就消失了,不再需要靠藏树来省载荷。
- **TOC 独立成右列**,由读页自己挂。TOC 天然是 per-page 的(依赖当前页标题),属于页面段而非公共壳。
- **去掉 swap**:`WikiSidebar` 只剩 tree;`PageToc` 由读页单独挂进自己的列;读页去掉 `pages={headings.length>0?undefined:pages}` 门控。

触发背景:即将开放全员编辑,导航将变频繁,"读页丢失页面树"与"每次导航重挂侧栏"两个体验缺口都会被放大。

## Considered Options

- **维持 swap(原实现)**:tree/TOC 同列二选一。省载荷,但读页永远看不到页面树,且侧栏挂在页面里、每次导航重挂(闪一下、丢滚动位置)。
- **三列并存 + tree 留在页面**:并存但不提 layout。解决"看不到树",但没解决重挂与 #136 载荷——每次导航仍重发整棵树。
- **三列并存 + tree 提到 wiki 段 layout(选定)**:
  - tree 在公共 layout 里常驻,跨 wiki 导航被局部渲染保留 → 不重挂、不闪、保留展开/滚动状态,且**载荷根因消除**,swap 与 `#138` 的藏树门控一并删掉。
  - TOC 留在页面段(per-page),独立成列。
  - 全部 6 个 wiki 路由(read / index / history / search / new / edit)由同一个 layout 提供统一的常驻 tree——改动最小、与"每页都有侧栏"的现状一致。

## Consequences

- **`#136`/`#138` 的藏树优化被 layout 提升取代**:`WikiSidebar` 不再收 `currentPage`/`headings`,`PageToc` 也不再由它渲染;读页删掉"有标题就不发树"的 `pages` 门控。载荷不再是问题,因为树不在页面段里。
- **会话内 tree 可能短暂陈旧(取舍)**:layout 被保留意味着 `getWikiTree()` 不随每次客户端导航重跑。会话中别人新建/删除页,侧栏树要到硬加载或缓存失效后才反映。缓存标签 `wiki-pages` 在写入时 `revalidateTag`,硬加载即刷新;需要会话内即时可用时再上 `revalidatePath("/wiki","layout")`。作为导航辅助,这点滞后可接受——换来的是不重挂的常驻壳。
- **`loading.tsx` 骨架不再预留侧栏列**:侧栏在 layout 里、在 `[...slug]` 的 Suspense 边界之上,已经常驻;读页的骨架只覆盖内容列(否则会和常驻侧栏叠成双列错位)。`#137` 的"预留 `--sidebar-width`"随之改为只留内容。两个次要的 loading 取舍:
  - **TOC 列不预留**:骨架无从预知目标页是否有标题,故不占 TOC 列;含标题页 resolve 时 TOC 从右侧流入、居中正文左移一档(~110px)。反过来"总是预留"又会让无标题页反向抖动——无完美骨架,取内容列左缘稳定这一侧。
  - **首次进入 wiki 区略失即时骨架**:`wiki/layout.tsx` 自身 `await getWikiTree()`+`getViewerEditContext()`,位于 `[...slug]/loading.tsx` 边界之上,故从 wiki 外(首页/admin)首次进入时,要等 layout 数据就绪才显示内容骨架(`#137` 的即时反馈在这一帧丢失)。但 `getWikiTree` 有 Data Cache 兜底,且换来 wiki→wiki 后续导航因 layout 被保留而即时出骨架——热路径(会话内浏览)反而更好。若冷入口延迟成为问题,再把 layout 内 sidebar 包一层 `Suspense` 流式化,让壳先返回。
- **移动端不显示 TOC(取舍)**:桌面三列;窄屏塞不下,TOC 作为宽屏阅读辅助隐藏(`lg:block`),移动端抽屉只留 tree 导航。相对原 swap,移动端失去 TOC——小幅退化,换取桌面并存与实现简单。需要时再把 TOC 在窄屏收进正文顶部的可折叠块。
- **rail 的"新建页面"按钮在所有 wiki 路由统一出现**:`canEdit` 由 layout 统一下发,编辑/新建页的折叠 rail 现在也会给编辑者显示 `+`(原先这两页不传 `canEdit`)。更一致,属良性变化。
- **每请求多一次会话读取(取舍)**:layout 用 `getViewerEditContext()` 拿 `canEdit`,读页/历史页为了 `user`/编辑与回滚门控又各自调一次,于是热路径(读页)的 `auth.api.getSession` 从 1 次变 2 次。`getWikiTree()` 走 `unstable_cache`(Data Cache)不受影响,只有会话读取未去重。这是把树提到 layout 的固有代价——layout 不能把数据作为 props 下传给页面段,页面只能自取。刻意不在本 PR 触碰共享的 `auth-guard`(属 ADR 0012 范围);若开放编辑后该读取成为热点,用 React `cache()` 包一层 `getSession` 即可让 layout 与页面在同一请求内去重,零行为变化。
- 现有 e2e 的 `#89`/`#98` 侧栏断言不受影响:侧栏 DOM(`nav`、`Pages`、`展开导航`、`a[href="/wiki/new"]`)不变,只是渲染位置从页面移到 layout。
