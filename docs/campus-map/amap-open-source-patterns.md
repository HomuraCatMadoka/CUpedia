# 高德地图 Campus Map：开源实现与官方 API 模式

调研日期：2026-08-13

## 结论先行

当前原型最显著的问题不是配色，而是把三种语义不同的对象都当成了“可打开详情的地点”：

1. 高德底图 POI（高德的数据）；
2. CUpedia 建筑（本产品的主实体）；
3. CUpedia 设施（厕所、饮水机、打印机等）。

高德 JS API 本身允许底图 POI 点击，但这不代表每个 POI 都应该打开占据大半屏的 CUpedia 详情面板。推荐将交互分为两条明确路径：

- 点击 **CUpedia 建筑或设施**：选中实体、移动镜头、打开 CUpedia 的移动端详情面板。
- 点击 **未关联的高德底图 POI**：显示与 Building、Place 共用外壳的轻量底卡，只保留名称和“高德地图地点”，不提供 CUpedia 编辑或历史操作。

同时，当前按屏幕像素距离手写聚合的做法应该替换为官方 `AMap.MarkerCluster`。手写逻辑只在 React effect 执行或 `zoomend` 后重建，一方面制造重复的圆形 UI，另一方面把建筑数量和设施数量混为一谈；官方聚合已经处理缩放后的重聚合、cluster click 事件和单点渲染。

## 一手来源审阅

### 1. 高德 JS API 2.0 官方能力

#### 底图热点不是产品数据

`AMap.Map` 的 `isHotspot` 控制底图热点与标注的 hover/click 能力。官方说明中，PC 默认开启而移动端默认关闭；若 Campus Map 希望移动端也能点击高德 POI，需要显式开启。官方示例目录也将“地图热点”和开发者自己的 Marker、InfoWindow、点聚合列为不同能力。这支持在领域和 UI 上把“高德 POI”与“CUpedia 实体”分开处理。

- [AMap.Map 参考：`isHotspot`、镜头和交互选项](https://developer.amap.com/api/maps-javascript-api/reference/amap-map/map)
- [高德 JS API 2.0 示例目录：热点、Marker、InfoWindow、点聚合](https://developer.amap.com/demo/list/js-api-v2)

#### InfoWindow 是可用的供应商能力，但不是当前产品卡片

官方 `AMap.InfoWindow` 明确规定同一张地图一次只显示一个信息窗；它支持 `autoMove`、四边避让 `avoid`、`closeWhenClickMap`、自定义 DOM 内容和 `extData`。早期原型曾据此承载未映射 POI，但 #649 的截图对比发现它与 CUpedia 底卡形成两套视觉和焦点生命周期。当前实现因此统一使用 React 轻量底卡；InfoWindow 只作为调研过的供应商能力记录，不进入生产卡片路径。

- [AMap.InfoWindow 参考](https://developer.amap.com/api/maps-javascript-api/reference/amap-infowindow/infowindow)
- [InfoWindow 教程](https://developer.amap.com/api/maps-javascript-api/guide/overlays/info-window)

#### MarkerCluster 应负责重聚合

官方 `AMap.MarkerCluster` 接收 `{ lnglat, weight? }` 数据，提供 `gridSize`、`maxZoom`、`renderMarker` 和 `renderClusterMarker`；cluster `click` 事件会返回点击的聚合点、坐标和内部点对象。聚合组件的存在意义就是在大量点下按距离合并并改善渲染性能，不需要应用自己在 `zoomend` 后用 `lngLatToContainer()` 和固定半径重新分组。

- [AMap.MarkerCluster 参考与示例](https://developer.amap.com/api/maps-javascript-api/reference/amap-marker/markercluster)

对 Campus Map 的直接含义：

- `dataOptions` 的一条记录应是一项 **设施**，不是一栋建筑；同楼不同设施在高缩放层级仍可表达为单独设施。
- `renderClusterMarker` 只显示数字和设施类别色；点击 cluster 只放大/适配内部点，不打开“第一栋建筑”。
- `renderMarker` 显示类别图标，不要再显示数字 `1`。数字 `1` 是聚合语义，对单点没有信息增益。
- 使用 `maxZoom` 决定何时停止聚合；到建筑级别后显示可点设施 marker。
- category 切换时调用 `setData`，不要销毁并重建一整套 Marker。

#### 镜头应为面板留出空间

`AMap.Map` 支持 `setZoomAndCenter`、`panBy`，也提供 `getFitZoomAndCenterByOverlays(overlays, avoid, maxZoom)`。InfoWindow 自身也有 `autoMove` 和 `avoid`。选中实体后的正确镜头并不只是“把经纬度设为屏幕中心”，而是让 marker 位于**扣除底部面板后的可视地图区域中心**。

- [AMap.Map 参考：镜头、fit 与 avoid](https://developer.amap.com/api/maps-javascript-api/reference/amap-map/map)
- [地图状态教程：`setFitView`](https://developer.amap.com/api/maps-javascript-api/guide/map/state)

### 2. `uiwjs/react-amap`：React 生命周期与 DOM portal

[`uiwjs/react-amap`](https://github.com/uiwjs/react-amap) 是仍在维护的 MIT React 封装。它的 README 明确主张：简单场景使用声明式组件，复杂场景拿到原生 `map` 实例后直接调用高德 API。

值得直接采用的源码模式：

- [`APILoader`](https://github.com/uiwjs/react-amap/blob/master/packages/api-loader/src/index.tsx) 使用 `@amap/amap-jsapi-loader`，只在 SDK Promise resolve 后渲染子树，并暴露明确 error state。高德官方示例目录也推荐 loader 避免重复加载和异步加载错误。
- [`useMap`](https://github.com/uiwjs/react-amap/blob/master/packages/map/src/useMap.tsx) 只创建一个 Map 实例；cleanup 依次清理 InfoWindow、覆盖物并 `destroy()`。受控 `center` / `zoom` 改变时只调用原生 setter。
- [`useMarker`](https://github.com/uiwjs/react-amap/blob/master/packages/marker/src/useMarker.tsx) 在地图 ready 后创建实例，在 cleanup 时 `setMap(null)`；点击等事件通过统一事件桥接绑定。
- [`useInfoWindow`](https://github.com/uiwjs/react-amap/blob/master/packages/info-window/src/useInfoWindow.tsx) 只维护一个原生 InfoWindow 实例，React 内容通过 portal 注入；`visible` 与 `position` 变化只更新/开关已有实例。

对 Next.js 的建议不是立刻引入整套组件库，而是复用它的边界：

1. `AmapLoader` client-only，Promise 明确表示 `loading | ready | error`；
2. `useAmapInstance` 单独拥有实例的 create/destroy；
3. `useFacilityCluster` 单独同步当前 category 数据；
4. React 的 selection state 是唯一事实源，AMap overlay 只是投影；
5. Building、Place 和未映射高德 POI 都由同一个 React 卡片投影渲染；高德热点只提供 provider intent，不拥有第二套卡片 DOM 或焦点状态。

这比在一个大型 component 中同时注入 script、建图、转换坐标、聚合、做历史记录和渲染面板更容易验证。

### 3. `ngx-amap`：框架只管理生命周期，复杂行为仍走原生 API

[`xieziyu/ngx-amap`](https://github.com/xieziyu/ngx-amap) 虽然是 Angular 且已较老，但其边界具有参考价值：地图发出 `ready` 后才允许使用全局 AMap；插件通过 loader service 按需加载；Marker 的 click 被框架桥接为组件事件；项目在 v3 明确建议直接使用原生对象的 getter/setter，而不是再包一层不完整的 API。

- [ngx-amap README：ready、Marker 事件与插件加载](https://github.com/xieziyu/ngx-amap#使用)

对当前原型的启发：不要自行复刻 `MarkerCluster` 的算法或把所有 AMap 方法抽象掉；只做生命周期与产品状态边界。

### 4. `amap-demo/web-route-base-on-geolocation-and-placesearch`：移动端模式

高德示例组织 [`amap-demo/web-route-base-on-geolocation-and-placesearch`](https://github.com/amap-demo/web-route-base-on-geolocation-and-placesearch) 展示了一个移动端地图应用的关键取舍：

- 定位、搜索和地图是不同界面状态；搜索结果点击后才切回地图。
- POI 选择后以 `entr_location || location` 定位，并更新唯一的 marker。
- 当只需要展示若干相关点时调用 `map.setFitView()`，不硬编码每种状态的中心点。
- 拖动地图时临时进入“调整位置”状态，`moveend` 后再提交新的中心位置。

这个仓库较旧，不应复制其 SDK 版本或 DOM 写法；值得采用的是“一个状态只做一个主要任务”和“选择后回到地图并适配视野”。

## 针对当前原型的优先级

### P0：消除当前错误语义与重复 UI

1. **未关联高德 POI 不打开空白的 CUpedia 详情。** 使用共享轻量底卡，内容仅为 POI 名称和“高德地图地点”；点击空白地图关闭，不显示编辑、历史或关联操作。
2. **设施单点不显示数字 `1`。** 单点显示类别图标；只有两个及以上设施合并时显示 count。
3. **用 `AMap.MarkerCluster` 替换手写 56px 聚合。** cluster click 放大/fit 内部点，单点 click 选择具体 facility；不要将 cluster click 映射为第一栋建筑。
4. **修正视觉层级。** 搜索框为最高层；category chips 是次级浮层；地图 controls 不与 bottom sheet/版权重叠。当前 screenshot 中“大面积空白详情面板 + 地图上的 1/1 圆点”正是前三项未满足的表现，不应作为验收终态。

### P1：建立现代移动地图的信息架构

1. **两级详情，而不是一个空白大卡：**
   - peek：实体名、楼层/准入 tag、一个主操作；约一行半内容。
   - expanded：按楼层组织设施和办公室；只有用户上拉或点“查看详情”才展开。
2. **selection 与 source 正交：** 同一地点无论从顶部 category 聚合还是建筑卡片进入，都生成相同 `placeId` selection；只额外记录 `origin = map | building-sheet | search` 用于返回焦点/关闭行为，不复制详情状态。
3. **镜头避让面板：** 选中 marker 时通过 `avoid`/`panBy` 将其放在剩余地图区域中心；sheet snap 变化不应每次产生肉眼可见的上下抖动。
4. **类目条可横向滚动但不切断首项。** 保持固定边距、紧凑 40–44px 点击目标，滚动位置由用户控制；不要为三个类目居中后再叠加遮罩造成裁切。
5. **后续贡献 PR：添加入口跟随上下文。** 建筑详情内提供“在此建筑添加设施”；地图空白态另有固定入口。两者最后进入同一提交流程，但前者预填建筑；该流程不属于 Issue #593。

### P2：数据增多后再做

- 按视口请求/渲染设施数据；当前 CUHK 规模无需 MassMarks。
- 多类别同时显示时，再考虑 `AMap.IndexCluster` 或分层图标；MVP 单类别筛选用 MarkerCluster 足够。
- 室内图获得可靠数据后，再接官方 IndoorMap 或自有 ImageLayer；不要让楼层 selector 暗示目前已有室内定位能力。

## 推荐的可验收状态转换

| 用户操作                  | 地图表现                                     | UI 状态                     |
| ------------------------- | -------------------------------------------- | --------------------------- |
| 点击 category             | 维持用户当前镜头；更新 cluster data          | category active，无详情     |
| 点击 cluster（count > 1） | 平滑放大或 fit cluster 内点                  | 不打开详情                  |
| 点击设施单点              | marker 进入 selected 样式；镜头避开面板      | 打开设施 peek               |
| 点击 CUpedia 建筑         | 建筑被定位到剩余可视区中心                   | 打开建筑 peek               |
| 从建筑卡点击设施          | 同一 facility selection，地图突出同一 marker | 切到设施 peek               |
| 点击未关联高德 POI        | 保持高德 POI 为锚点，必要时自动 pan          | 打开共享轻量底卡            |
| 点击地图空白              | 保持镜头                                     | 关闭当前卡片；category 不变 |
| 上拉 peek                 | marker 仍在可视区域                          | expanded，按楼层展示        |
| 下拉/关闭 expanded        | 不重新缩放                                   | 回 peek 或关闭              |

## Issue #593 UI 验收矩阵

下表只覆盖高德只读原型；新增图钉、申请、审批、评论、室内图和导航不在本 PR 验收范围内。`Content` 已在 canonical state 与 session command 两层同建筑、设施共用 selection/history/camera transition；外部高德 POI 也经 session command 进入 transient `provider-poi` scene，而不是从 provider handler 绕过产品转换。可见的 Content、楼内 tag 与 inside-search projection 由状态内核 Issue #644 承接；#593 只固定这些 command 的 parent/history/no-camera 契约，不造一条与未来领域模型冲突的临时内容 UI。

| 场景 / 操作               | UI 断言                                                                                     | Camera 断言                                               | History / URL 断言                                                | 视口           | 自动化证据                                                                        |
| ------------------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------- | -------------- | --------------------------------------------------------------------------------- |
| 初始地图                  | 高德底图、搜索、类别、定位控件完整；没有自定义建筑 marker                                   | 校园初始视野稳定                                          | URL 无实体参数                                                    | 390、720、桌面 | `amap-campus-runtime`: preloaded SDK 初始化                                       |
| 点击已关联高德建筑热点    | 只出现一个原生 POI；打开对应建筑 peek；两个事件顺序或 provider 竞争均只产生一次产品动作     | zoom 不变；只 relocate 一次；按实测 panel rect 计算安全区 | 建筑 selection 只 push 一次                                       | 390、720、桌面 | adapter permutation trace + runtime: linked hotspot / three viewport safe areas   |
| 点击未关联高德 POI        | 只打开共享轻量卡，不出现 CUpedia 编辑或历史操作                                             | 必要时仅做最小 pan                                        | 不生成可分享 CUpedia entity URL                                   | 390、桌面      | runtime: one transient provider card                                              |
| 点击类别                  | 显示一致的类别 marker 和结果列表；单点是图标、cluster 才是数字                              | center / zoom 不变                                        | 从实体进入结果是可返回导航；结果间切换只 replace 筛选             | 390、桌面      | session/component: category transition；runtime: zero camera calls；marker helper |
| 点击 cluster              | 不打开任一设施详情；companion map click 不关闭类别列表                                      | fit 全部成员且不超过最大 zoom                             | selection / URL 不变                                              | 390、桌面      | adapter trace + runtime: cluster bounds fit                                       |
| 点击设施 marker 或列表项  | 两个入口得到相同设施标题、建筑、楼层、准入信息和选中 marker；companion map click 不关闭详情 | zoom 不变；设施位于面板外安全区                           | 设施 selection 只 push 一次                                       | 390、桌面      | component: facility identity；runtime: marker selection / companion click         |
| 建筑卡内选择设施          | 打开同一设施详情                                                                            | 不主动移动 camera                                         | Back 回原建筑与楼层上下文                                         | 390、桌面      | runtime: building-card facility no camera                                         |
| peek ↔ full               | 标题、列表和焦点不丢；控件不被卡片裁切                                                      | zoom 不变；反复三轮不累计漂移                             | 只 replace `panel`                                                | 390、720、桌面 | runtime: three snap cycles                                                        |
| 切楼层                    | 只更新原型目录内容                                                                          | camera API 调用 0 次                                      | 只 replace `floor`                                                | 390、桌面      | component/runtime: building floor selection                                       |
| 切楼内 tag / inside query | 最终 projection 由 #644 提供；#593 固定 typed command 与 canonical context                  | camera intent 为 `null`                                   | 只 replace amenity / insideQuery                                  | 状态契约       | session table test: tag + inside query no camera                                  |
| 选择 Content              | 最终可见卡片由 #644 提供；#593 固定 canonical parent / floor / selection                    | map 来源定位所属建筑；building 来源不移动                 | selection push；Back 回建筑                                       | 状态契约       | state + session table tests                                                       |
| 搜索并选择建筑            | 搜索结果关闭，建筑 peek 打开                                                                | 允许 fit，但 zoom 不超过 17.2                             | 选择 push；Back 恢复搜索                                          | 390、桌面      | runtime: search zoom policy；component: query return                              |
| 快速点击 A → B            | 最终只选中 B；无 A 回弹或双动画                                                             | 过期 A camera request 被取消                              | 最终 URL 只含 B                                                   | 390、桌面      | runtime: latest camera token wins                                                 |
| 用户拖动 / 缩放           | 用户手势立即取得控制权                                                                      | 未提交的程序镜头被取消                                    | selection / URL 不变                                              | 390、720、桌面 | runtime: dragstart + wheel cancellation                                           |
| 浏览器 Back / Forward     | 建筑、设施、类别结果与选中 marker 同步恢复                                                  | 保持当前 zoom，仅在遮挡时 relocate                        | `back-or-push` 由单一 history adapter 执行；popstate 不写新 entry | 390、桌面      | history adapter + component/session tests；真实浏览器仍需验收                     |
| 建筑级设施坐标            | marker / 卡片明确表示“建筑内”，不冒充室内精确点                                             | 定位到所属建筑                                            | URL 保留 building / floor / facility 身份                         | 390、桌面      | marker/helper + component wording tests                                           |

### 故障态矩阵

| 故障                                         | 用户看到什么                                                                         | 禁止的降级                                                      | 自动化证据                                                                 |
| -------------------------------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Web Key / security code 未配置或配置接口失败 | 全屏“高德地图配置缺失”，给出本地配置提示                                             | 不显示可操作的伪地图                                            | component/config-route tests                                               |
| 高德 SDK 脚本加载失败                        | 全屏“高德地图加载失败”                                                               | 不保留永久 loading 壳                                           | component script error path                                                |
| 按需 WGS84 → GCJ-02 转换失败                 | 只隐藏这次无法安全投影的 marker；搜索、地点卡片和其余地图继续可用                    | 不把 WGS84 静默画到 GCJ-02 底图，也不升级为全屏地图错误         | resolver partial failure + runtime failure-isolation tests                 |
| MarkerCluster 插件 loading / 注册或构造抛错  | 底图与类别列表仍可浏览；分别显示“地图标记正在加载”或“地图标记加载失败，列表仍可使用” | 不使用手写聚合作为静默 fallback，不把列表出现等同 marker 已完成 | runtime: pending + plugin error + constructor error；真实 SDK smoke 待验收 |
| 用户在程序 relocate 前开始拖动或缩放         | 地图服从用户手势                                                                     | 不在稍后回弹到旧 selection                                      | runtime: wheel cancellation                                                |

通过门槛分两层：

1. **代码 Ready**：上述自动化证据全部通过，lint、全量测试和 TypeScript 通过。
2. **UI 已验收**：再由用户在 390px、720px 和桌面走完矩阵，并确认真实高德热点、瓦片、镜头动画、控件遮挡与 Back / Forward。缺少任一真实视口验收时，不得把“代码 Ready”写成“UI 已验收”。

## 不建议复制的做法

- 不为高德 `InfoWindow` 保留第二套卡片生命周期；所有地点卡由 scene 驱动同一个 React panel。
- 不直接使用高德 PlaceSearch 自动生成的结果面板作为 CUpedia 搜索结果：Campus Map 搜的是自有建筑/设施实体，搜索结果必须保留稳定 ID 和楼层关系。
- 不在 React render 中反复 new Map/Marker；所有原生实例必须有单一 owner 和 cleanup。
- 不把 `hotspotclick` 结果通过名称模糊匹配静默升级为 CUpedia 建筑。名称命中可以作为关联候选，但正式关系应来自明确的 AMap POI ID ↔ CUpedia building ID 映射。
