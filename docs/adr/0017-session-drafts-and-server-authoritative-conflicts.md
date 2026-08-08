# ADR 0017：编辑会话草稿与服务器权威冲突

Wiki 编辑把三种状态分开：服务器页面是唯一公开版本；IndexedDB 只保存当前用户、页面、浏览器编辑会话的未确认草稿；实时协作状态留给未来按页面 UUID 建立的 Yjs 文档。客户端草稿不创建服务器“草稿页面”，也不表示产品支持离线编辑。

每条本地记录带 schema 版本、user/page/session、服务器 base version、`contentGeneration`、base snapshot、至多一个结果未知的 submitted snapshot、draft snapshot 和更新时间。浏览器先以约 250ms debounce 落本地，再以独立的 1500ms debounce 保存服务器。服务器确认某个 snapshot 时只清除那一份；若保存期间又有输入，则保留并 rebase 尾随草稿。完全确认后删除 IndexedDB 记录——公开页面和服务器私有草稿都一样，后者的权威恢复来源是 `wiki_drafts`，不是一份干净的本地副本。浏览器 history entry 提供编辑 session id，所以刷新沿用同一草稿，另一个标签页则使用独立记录。

一个已挂载的编辑器是该 session 网络 drain 的唯一 owner。切页时先把最新内容写入 IndexedDB；已经发出的请求可以完成并只确认自己的 snapshot，但组件卸载后不得继续发送尾随 snapshot。重新挂载的 owner 直接读取 outbox，不等待旧响应，并按 submitted → trailing 的顺序恢复。这样同一 tab 快速切走、切回不会让旧/新编辑器成为两个并发写入者。无 Navigation API 时使用的同 URL history guard 必须按 URL 幂等复用，避免 React Strict Mode 重挂载堆出多层 guard、令一次 Back 仍停在编辑页。

编辑器启动分两阶段：先渲染服务器快照，但在 IndexedDB 恢复判定完成前用外层 `inert` 隔离交互；不能切换 Plate editor 实例自身的 read-only 状态。恢复期间收到的 BroadcastChannel / focus / visibility / polling 版本只保留最高版本，不得先写入编辑器。若没有本地恢复内容，启动完成后采用该远端版本；若存在 local / submitted 内容，则本地因果链优先，远端差异在保存时通过乐观锁与三方合并处理。

普通服务器写入递增 `version`；回滚和删除还递增 `contentGeneration`。版本 CAS 失败后，只有同一 generation 的非重叠 Plate block / 页面属性改动可以三方自动合并；稳定块 ID 区分内容相同的重复块，普通文字块允许 ADR 0008 规定的保守 leaf / formatting 合并。旧 generation 草稿不得静默合入已经回滚的正文。

展示投影不能成为可写快照。由父子树等可变外部状态隐藏的 legacy 子页面链接，保存前必须从服务器存储值补回；只有编辑器确实隐藏的块可以补回，用户可见后主动删除的内容不得复活。服务器响应再按最新树投影回编辑器。

真正冲突时服务器版本保持权威，界面提供带属性、文本、格式和块类型上下文的只读 diff。用户只能复制本地内容、回到服务器版本继续编辑，或丢弃本地草稿；不提供整页“保留我的版本”写回。权限丢失和页面删除会终止后台 autosave，但本地内容仍可复制。

本版不引入 Yjs、operation log、presence、离线队列或多人实时协作。IndexedDB 层通过页面 UUID 和可版本化 record 隔离在编辑器边界，未来可由 Yjs persistence 替换，而不用改变服务器页面的公开语义。
