# 开源地图交互架构对照：#593 应该如何收口

> 调研日期：2026-08-14。只使用仓库源码与仓库内架构文档；链接固定到所检查的 commit。

## 结论

成熟地图项目**普遍采用类似的职责分离，但没有一个项目使用与我们完全相同的类名或四层模板**：

- 产品选择、搜索和面板状态不会完全寄存在地图 SDK 实例里；
- SDK 原始事件通常先经过 adaptor/proxy/handler，再进入产品逻辑；
- camera、overlay、SDK 生命周期有专门 owner；
- 面板通常根据 selection/view model 投影，而不是反过来充当产品状态；
- 复杂项目会用显式 command/request/mode 约束可发生的转换。

因此，前述 `Scene Kernel + AMap Interaction Adapter + Effect Runtime + UI Projection` 是这些实践针对 #593 的组合，不是过度工程。#593 当前已经有 reducer 和 session transition，问题是仍处于“分了一半”的状态：组件还同时拥有 history、camera、provider 事件归并、overlay 和 UI。

## 一手源码对照

| 项目                                                                                                                    | 代表性做法                                                                                                                                              | 对 #593 的意义                                                      |
| ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| [MapComplete @ `cf368606`](https://github.com/pietervdvn/MapComplete/tree/cf368606d31fdc7542de44f1231ec2f25212f87d)     | `ThemeViewState` 是 GUI 状态中枢；`WithSelectedElementState` 明确“不含 GUI”；`MapLibreAdaptor` 在 `MapProperties` 与 SDK 之间桥接；hash 另由 actor 同步 | 与目标架构最接近：selection、provider、URL 各有边界                 |
| [uMap @ `40b1c703`](https://github.com/umap-project/umap/tree/40b1c703fb1875ff644288970186d6994746c50f)                 | `LeafletProxy`/`OLProxy` 把不同 provider 翻译成共同 app events；camera 和 popup 命令由 proxy 执行；Panel 独立管理 DOM                                   | 证明 provider adapter 与 camera/overlay runtime 是实际可替换的 seam |
| [Organic Maps @ `3655a703`](https://github.com/organicmaps/organicmaps/tree/3655a7033e65c2460150ca9e3fbc07754fe2d10b)   | Search-on-map 使用 typed `Request → Response → ViewModel → render`，并对选择地点、拖地图和面板状态做表驱动测试                                          | 证明地图产品行为应先成为可测试的产品转换，再驱动面板                |
| [OpenStreetMap iD @ `9b18ef29`](https://github.com/openstreetmap/iD/tree/9b18ef296a1ae04f2072d02f0be5a38e0af74455)      | action 产生新 graph；互斥 mode 有 `enter/exit`；behavior 负责安装/卸载事件                                                                              | 证明交互模式必须排他、生命周期必须成对，不应靠散落 boolean ref      |
| [react-map-gl @ `4b649aaf`](https://github.com/visgl/react-map-gl/tree/4b649aaf926adacb3ffba4b7c5d8edebaca90f8a)        | React 组件只管理一个 MapLibre wrapper；wrapper 归一 pointer/camera events、同步 controlled view state、负责销毁与错误回调                               | 证明 SDK lifecycle 与 React 产品组件应隔离                          |
| [MapLibre GL JS @ `06cac16c`](https://github.com/maplibre/maplibre-gl-js/tree/06cac16ca843bbc9b029aff71d4120ef448f79b4) | DOM 事件统一进入 `HandlerManager`，handler 有兼容/阻塞规则；`Camera` 与 handler manager 分离                                                            | 证明“一个手势只被一个交互认领”应由适配层统一仲裁                    |

### 1. MapComplete：最接近我们的目标，但也展示了反例

MapComplete 直接把 [`ThemeViewState` 称为 GUI 的 “brain/HQ”](https://github.com/pietervdvn/MapComplete/blob/cf368606d31fdc7542de44f1231ec2f25212f87d/src/Models/ThemeViewState.ts#L5-L16)。选择逻辑位于 [`WithSelectedElementState`](https://github.com/pietervdvn/MapComplete/blob/cf368606d31fdc7542de44f1231ec2f25212f87d/src/Models/ThemeViewState/WithSelectedElementState.ts#L9-L74)，文件明确声明 “No GUI stuff”，并对重复选择同一 ID 做幂等处理。MapLibre 则被包在 [`MapLibreAdaptor`](https://github.com/pietervdvn/MapComplete/blob/cf368606d31fdc7542de44f1231ec2f25212f87d/src/UI/Map/MapLibreAdaptor.ts#L16-L70) 后面；点击被翻译为 `lastClickLocation`，location/zoom/bounds 等 store 与 SDK 在 adaptor 内双向同步（[点击和同步代码](https://github.com/pietervdvn/MapComplete/blob/cf368606d31fdc7542de44f1231ec2f25212f87d/src/UI/Map/MapLibreAdaptor.ts#L115-L221)）。URL/back 又由独立 [`ThemeViewStateHashActor`](https://github.com/pietervdvn/MapComplete/blob/cf368606d31fdc7542de44f1231ec2f25212f87d/src/Logic/Web/ThemeViewStateHashActor.ts#L29-L83) 处理。

这支持我们拆出 state kernel、AMap adaptor 和 history adapter。不过 MapComplete 在点击冲突上也使用 `originalEvent["consumed"]` 这个显式标志（[源码](https://github.com/pietervdvn/MapComplete/blob/cf368606d31fdc7542de44f1231ec2f25212f87d/src/UI/Map/MapLibreAdaptor.ts#L125-L171)）。这只是同一个 DOM event 可传递时的 workaround；高德的 `hotspotclick` 与 `click` 是两个 provider event，不能照搬成更多 boolean/RAF 标志。

### 2. uMap：provider proxy 和 effect runtime 很清楚，产品 event bus 不够安全

uMap 的 `App` 可选择 `LeafletProxy` 或 `OLProxy`，UI、数据层不直接依赖具体地图 SDK（[构造代码](https://github.com/umap-project/umap/blob/40b1c703fb1875ff644288970186d6994746c50f/umap/static/umap/js/modules/app.js#L75-L130)）。[`LeafletProxy`](https://github.com/umap-project/umap/blob/40b1c703fb1875ff644288970186d6994746c50f/umap/static/umap/js/modules/rendering/leaflet.js#L23-L109) 把 Leaflet feature event 翻译成产品行为，并集中执行 `map:view:set`、`fit-bounds`、popup、cluster reveal 等命令（[源码](https://github.com/umap-project/umap/blob/40b1c703fb1875ff644288970186d6994746c50f/umap/static/umap/js/modules/rendering/leaflet.js#L111-L217)）。实验性的 [`OLProxy`](https://github.com/umap-project/umap/blob/40b1c703fb1875ff644288970186d6994746c50f/umap/static/umap/js/modules/rendering/openlayers.js#L24-L105) 复用相同 app-level 命令，说明这个 seam 确实能隔离 provider。

但 uMap 主要依靠字符串 event bus；打开 panel 后以 `map.once('click popupopen', …)` 关闭（[源码](https://github.com/umap-project/umap/blob/40b1c703fb1875ff644288970186d6994746c50f/umap/static/umap/js/modules/rendering/leaflet.js#L156-L180)）。这和我们当前 hotspot companion click 的问题同类。应借鉴 proxy 边界，不应复制无类型全局事件或“下一个 click 就关闭”的规则。

### 3. Organic Maps：行为矩阵应该变成可执行转换测试

Organic Maps 的 search-on-map 定义了封闭的 [`Request`、`Response` 与 `ViewModel`](https://github.com/organicmaps/organicmaps/blob/3655a7033e65c2460150ca9e3fbc07754fe2d10b/iphone/Maps/UI/Search/SearchOnMap/SearchOnMapModels.swift#L14-L85)。`Interactor.handle(request)` 先解析为 response（[源码](https://github.com/organicmaps/organicmaps/blob/3655a7033e65c2460150ca9e3fbc07754fe2d10b/iphone/Maps/UI/Search/SearchOnMap/SearchOnMapInteractor.swift#L18-L71)），Presenter 再从旧 view model 计算新 view model 并唯一调用 `render`（[源码](https://github.com/organicmaps/organicmaps/blob/3655a7033e65c2460150ca9e3fbc07754fe2d10b/iphone/Maps/UI/Search/SearchOnMap/SearchOnMapPresenter.swift#L24-L113)）。仓库测试直接覆盖“选中地图地点隐藏搜索、取消选择恢复搜索”等转换（[源码](https://github.com/organicmaps/organicmaps/blob/3655a7033e65c2460150ca9e3fbc07754fe2d10b/iphone/Maps/Tests/UI/SearchOnMapTests/SearchOnMapTests.swift#L156-L191)）。

这正是 #593 行为矩阵应达到的形态。可以借鉴 typed command/response/view model 与转换测试；不必照搬完整 VIP 分层，也不应复制 Interactor 直接调用全局 `MapViewController` 的副作用（[例子](https://github.com/organicmaps/organicmaps/blob/3655a7033e65c2460150ca9e3fbc07754fe2d10b/iphone/Maps/UI/Search/SearchOnMap/SearchOnMapInteractor.swift#L61-L67)）。Web 端让 kernel 返回 effect intent 会更易测。

### 4. iD：模式和事件生命周期是显式的，但 Context 不是我们的模板

iD 的架构文档把 action 定义为“旧 graph → 新 graph”的函数（[文档](https://github.com/openstreetmap/iD/blob/9b18ef296a1ae04f2072d02f0be5a38e0af74455/ARCHITECTURE.md#L161-L176)）；mode 通过成对 `enter/exit` 保证互斥，behavior 安装/卸载事件（[文档](https://github.com/openstreetmap/iD/blob/9b18ef296a1ae04f2072d02f0be5a38e0af74455/ARCHITECTURE.md#L194-L248)）。真实 `select` mode 也在一个生命周期内安装 behavior、快捷键、sidebar 和 map listeners（[源码](https://github.com/openstreetmap/iD/blob/9b18ef296a1ae04f2072d02f0be5a38e0af74455/modules/modes/select.js#L239-L329)）。

应借鉴“合法模式有限、进入退出成对、同一时刻只有一个 owner”。不应把 iD 的大 `context` 或 mode 内直接驱动 sidebar/camera 原样搬来；对浏览型校园地图来说会比 typed scene/effects 更重，也会重新制造多权威来源。

### 5. react-map-gl / MapLibre：SDK runtime 与手势仲裁应低于产品状态

react-map-gl 的 React `Map` 只创建、更新和销毁一个 wrapper，并把加载错误交给 callback（[源码](https://github.com/visgl/react-map-gl/blob/4b649aaf926adacb3ffba4b7c5d8edebaca90f8a/modules/react-maplibre/src/components/map.tsx#L37-L108)）。wrapper 将 provider pointer/camera events 分别归一（[事件表与绑定](https://github.com/visgl/react-map-gl/blob/4b649aaf926adacb3ffba4b7c5d8edebaca90f8a/modules/react-maplibre/src/maplibre/maplibre.ts#L125-L171)、[event adapter](https://github.com/visgl/react-map-gl/blob/4b649aaf926adacb3ffba4b7c5d8edebaca90f8a/modules/react-maplibre/src/maplibre/maplibre.ts#L574-L657)），并区分外部 controlled view state 与正在进行的用户交互，避免互相覆盖（[源码](https://github.com/visgl/react-map-gl/blob/4b649aaf926adacb3ffba4b7c5d8edebaca90f8a/modules/react-maplibre/src/maplibre/maplibre.ts#L425-L449)）。其公开 ref 还刻意屏蔽容易破坏绑定的 imperative 方法（[源码](https://github.com/visgl/react-map-gl/blob/4b649aaf926adacb3ffba4b7c5d8edebaca90f8a/modules/react-maplibre/src/maplibre/create-ref.ts#L4-L49)）。

更底层的 MapLibre 把 DOM 事件统一注册到 [`HandlerManager`](https://github.com/maplibre/maplibre-gl-js/blob/06cac16ca843bbc9b029aff71d4120ef448f79b4/src/ui/handler_manager.ts#L230-L267)，handler 显式声明哪些交互可同时发生，并统一 reset/stop（[源码](https://github.com/maplibre/maplibre-gl-js/blob/06cac16ca843bbc9b029aff71d4120ef448f79b4/src/ui/handler_manager.ts#L269-L390)）；`Map` 另建 `Camera`，再把 handler manager 接上去（[源码](https://github.com/maplibre/maplibre-gl-js/blob/06cac16ca843bbc9b029aff71d4120ef448f79b4/src/ui/map.ts#L735-L845)）。高德内部没有给我们同等级的产品事件仲裁，因此应在 AMap adaptor 内补一个很小的 gesture arbiter，而不是让产品 reducer理解 `hotspotclick`、`originEvent` 或 RAF 时序。

## 与 #593 当前实现的差距

本轮修复前的代码不是推倒重来，而是一个明确的中间态：

1. [`map-state.ts`](../../src/lib/campus-map/map-state.ts) 已能纯计算 canonical state 与 history mode；
2. [`map-session.ts`](../../src/lib/campus-map/map-session.ts) 已把 #593 范围内的产品命令映射成 state/history/camera/overlay intent；
3. [`browser-history.ts`](../../src/lib/campus-map/browser-history.ts) 是 browser history 的唯一执行边界；`back-or-push` 让同一返回 command 在站内前序存在时 travel、直接深链时提交可逆 fallback；
4. 但 [`amap-campus-prototype.tsx`](../../src/components/campus-map/amap-campus-prototype.tsx) 仍负责：
   - 执行与取消 camera；
   - 归并 `hotspotclick`/`click`；
   - 创建 InfoWindow、MarkerCluster、marker DOM；
   - 监听 popstate/resize/keyboard；
   - 渲染 panel。

因此当前故障的根因不是“缺一个 timeout”，而是 provider gesture 与产品 command 之间没有唯一 owner，且 session transition 之后仍允许组件绕过 transition 单独执行 history/camera。

### #593 当前落地状态

本轮已经把上述两个最高风险 seam 接入原型：

1. `AmapInteractionAdapter` 以 pointer gesture 为边界仲裁 `hotspotclick` / marker / cluster 与 companion map `click`；provider 与 background handler 只能把产品动作交给 adapter，adapter 对同一 pointer cycle 最多执行一次；background click 经过可取消 settlement，两个事件顺序均有 trace test；
2. `scene-kernel.ts` 暴露互斥的 map / search-results / category-results / building / facility / content / provider-poi scene，以及对应的 typed intent；facility 的 building、floor 与 category 只从 catalog 推导；
3. `scene-driver.ts` 是唯一产品 session owner。React 的搜索、类别、热点、marker、目录、deep link、Back、X、Escape、popstate 与 sheet intent 都只 dispatch 一次；driver 独占 URL/history write/travel，并统一执行 camera、focus、overlay 与 sheet command；
4. MarkerCluster 生命周期显式区分 loading / ready / error；插件注册与 cluster 构造/更新任一失败都会进入同一 error projection，类别列表仍可独立使用；
5. runtime contract 已覆盖 390 / 720 / desktop panel rect、两个 provider/map-click 顺序、marker/cluster、插件 pending/注册错误/构造错误、快速 A→B 以及 drag/wheel 取消。

可见 Content、贡献任务和最终建筑卡信息架构继续留在后续 issue；本次迁移不以临时 UI 扩张这些领域。真实高德 SDK 的瓦片、热点事件顺序和浏览器 Back/Forward 仍必须走人工三视口验收，不能由 runtime double 代替。

## 建议采用的最小修复形态

### A. `scene-kernel.ts`：唯一产品转换入口

```ts
transition(scene, command, catalog): {
  scene: CampusMapScene;
  effects: {
    history: HistoryIntent;
    camera?: CameraIntent;
    overlay?: OverlayIntent;
    focus?: FocusIntent;
  };
}
```

所有 UI、URL restore 和 provider adapter 只能提交 typed command；不得再从组件分别调用 reducer、`pushState` 和 `requestCamera`。重复选择同一 entity 必须显式幂等。

### B. `amap-interaction-adapter.ts`：只翻译 provider 事件

- 在地图容器的 pointer 生命周期内生成 interaction token；hotspot/marker/background 只能认领一次；
- 将真实高德事件序列归并为一个 `open-building`、`open-external` 或 `dismiss-entity`；
- 若高德事件缺少可共享的原始事件，允许 adaptor 内部有短暂 settlement queue，但它必须封装、可取消，并以两种事件顺序测试；
- 产品 kernel 不接触 `originEvent`、RAF 或高德对象。

### C. `amap-effect-runtime.ts`：唯一 SDK/history 副作用 owner

- `CameraController`：token、safe area、resize、用户手势取消；
- `HistoryAdapter`：push/replace/pop restore，restore 不回写；
- `OverlayRegistry`：InfoWindow、facility marker、cluster 的 loading/ready/error 与销毁；
- 一个 effect 执行器按 transition 输出运行这些 intent。

### D. UI 只做 projection

Panel、category list、facility card 都只从 `CampusMapScene`/derived view model 渲染；按钮只 dispatch command。panel snap 或 viewport orientation 改变可产生 layout command/camera intent，但不暗中改变 selection 或 zoom。

## 明确不要采用

- 不用 MapComplete 的 `originalEvent.consumed` 或当前 RAF boolean 解决跨 provider-event 去重；
- 不用 uMap 的无类型全局字符串 event bus，或 `once(next click)` 关闭面板；
- 不复制 iD 的巨型 context、在 mode 内同时操作 sidebar 与 camera；
- 不为了“像 Organic Maps”增加一套形式化 VIP 文件；这里三个深模块足够；
- 不让 React effect 根据多个局部 state 猜测该执行哪个 SDK 命令；effect 必须来自同一次 transition。

## 行为矩阵如何变成验收证据

修复后的矩阵应分四层，而不是所有行都标成“组件测试”：

1. **Kernel table test**：每个 command 精确断言 next scene、history、camera、overlay；
2. **Adapter trace test**：hotspot→click、click→hotspot、marker→map click、blank click、drag/zoom cancellation；每个 pointer cycle 最多一个产品 command；
3. **Runtime contract test**：390/720/desktop 的真实 panel rect、相机可见区、plugin failure、rapid A→B、destroy；
4. **UI projection test**：同一 scene 在不同 viewport 的 panel/card/tag，以及 Back/Forward 恢复。

做到这一步，#593 才能提供一个稳定的“高德交互基线”：后续楼层、内容、申请图钉只需增加 command、scene 和 projection，不再各自重写 history、camera 或 provider event 规则。
