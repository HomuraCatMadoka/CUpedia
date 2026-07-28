# ADR 0017：编辑会话草稿与服务器权威冲突

Wiki 编辑把三种状态分开：服务器页面是唯一公开版本；IndexedDB 只保存当前用户、页面、浏览器编辑会话的未确认草稿；实时协作状态留给未来按页面 UUID 建立的 Yjs 文档。客户端草稿不创建服务器“草稿页面”，也不表示产品支持离线编辑。

每条本地记录带 schema 版本、user/page/session、服务器 base version、`contentGeneration`、base snapshot、draft snapshot 和更新时间。浏览器先以约 250ms debounce 落本地，再以独立的 1500ms debounce 保存服务器。服务器确认某个 snapshot 时只清除那一份；若保存期间又有输入，则保留并 rebase 尾随草稿。浏览器 history entry 提供编辑 session id，所以刷新沿用同一草稿，另一个标签页则使用独立记录。

普通服务器写入递增 `version`；回滚和删除还递增 `contentGeneration`。版本 CAS 失败后，只有同一 generation 的非重叠 Plate block / 页面属性改动可以三方自动合并。旧 generation 草稿不得静默合入已经回滚的正文。

真正冲突时服务器版本保持权威，界面提供带属性、文本、格式和块类型上下文的只读 diff。用户只能复制本地内容、回到服务器版本继续编辑，或丢弃本地草稿；不提供整页“保留我的版本”写回。权限丢失和页面删除会终止后台 autosave，但本地内容仍可复制。

本版不引入 Yjs、operation log、presence、离线队列或多人实时协作。IndexedDB 层通过页面 UUID 和可版本化 record 隔离在编辑器边界，未来可由 Yjs persistence 替换，而不用改变服务器页面的公开语义。
