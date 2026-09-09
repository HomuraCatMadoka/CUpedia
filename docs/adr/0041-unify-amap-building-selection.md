# ADR 0041：统一浏览与新增设施的高德 Building 选择

状态：Partially superseded by [ADR 0042](0042-campus-map-direct-location-selection.md)（新增设施二次确认部分）

取代 ADR 0038 中“热点只服务浏览”和“瞬时供应商卡不提供新增入口”的部分。ADR 0038 的精确映射、
供应商无关身份、页面内预加载和无映射安全降级边界继续有效。

## 决议

浏览和新增设施共用同一个高德热点解析器。解析只使用完整的 `providerObjectId` 和预加载的显式
mapping；名称、别名、距离与点击坐标不能决定归属。

浏览状态点击已映射 Building 热点时，以稳定 `buildingId` 打开正式 Building 卡。全局新增设施处于
“选择所属建筑”阶段时，同一热点只暂存同一个 Building 候选；用户再次明确确认后，Add 表单才写入
该 `buildingId`。填写表单、编辑已有 Place 或选择室外位置时，热点点击不改变草稿。

新增流程不再为所有 Building 绘制另一套“建”字 marker。用户点击已映射高德热点后，可以在该次
高德点击位置显示一个短暂选中光圈。这个 GCJ-02 位置只属于当前界面状态，不写入编辑草稿、scene、
URL、Building 锚点或 Place 事实，也不能冒充设施实际位置。通过本站目录搜索选择 Building 时，可以
将镜头移向已有 Building 锚点，但不绘制与高德热点竞争的建筑 marker。

Building 卡新增继续带入当前 Building 和 Floor，类别入口继续带入 Place type；这些入口最终都产生
同一种 canonical Building 归属。没有高德映射的本站 Building 仍可通过目录搜索并明确确认。

未映射热点、目标已不可用的 mapping 和 mapping 预加载失败都显示瞬时供应商卡。该卡不能直接发布
Building 或 Place，但可以启动全局新增任务。用户必须搜索并确认本站 Building 后才能填写和发布；
取消任务不产生公共事实，本次确认也不自动创建永久 provider mapping。provider ID 与参考卡内容不
进入 canonical 身份或发布 payload。

## 后果

- 同一已映射高德 Building 在浏览和 Add 中解析成同一个稳定 `buildingId`。
- 新增流程不再要求用户寻找与高德热点重叠或偏移的第二套建筑 marker。
- 热点选中反馈能贴近用户实际点击处，同时不会改写 canonical 坐标或设施位置。
- 映射缺失或失效仍然安全降级；用户可以继续通过本站目录完成任务，但归属必须由人确认。
- provider Place 热点和所有非选建筑编辑阶段都不能静默改变 Building 归属。
