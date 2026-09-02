# 高德坐标转换的开源实现调研

状态：研究快照

最后核对：2026-09-02

## 结论先行

CUpedia 生产环境的直接故障不是高德地图底图本身不可用，而是浏览投影把 **158 个建筑锚点和 1 个校园中心，共 159 个 WGS84 坐标**一次交给 `AMap.convertFrom`。高德官方规定一次最多 40 对坐标，CUpedia 的代理也拒绝超过 40 对的请求，因此转换失败；现有 UI 又把坐标转换失败提升成整张地图的错误状态。

这不是一个没有间隔的死循环。当前代码会在地图挂载并 ready、`browseProjection` 刷新以及用户手动重试时重新发送整批请求；这些事件反复发生时，看起来就像“一直请求高德 API”。把 159 个点机械拆成 4 批只能修复“单次不得超过 40”的协议错误，不能消除每次打开页面和每次无关数据刷新都全量转换的浪费。

本次源码调研没有发现一个成熟仓库在地图启动时把整个静态地点库交给 `AMap.convertFrom`。常见模式是：

1. 地点数据本来就是 GCJ-02（高德坐标），浏览时直接传给高德；或
2. 只在用户真的需要时，把一个临时 WGS84 点转换为 GCJ-02；或
3. 用本地算法转换，不调用高德坐标转换服务。

第一类项目的“零转换请求”来自不同的数据契约，不能直接照搬到以 WGS84 为唯一规范坐标的 CUpedia。[ADR 0034](https://github.com/HomuraCatMadoka/CUpedia/blob/f8c2f2da8ea7aa0d4b74f5b9db02eb586b0f2a08/docs/adr/0034-campus-map-provider-neutral-place-facts.md#L20-L24)已经规定 canonical 室外坐标使用 WGS84，GCJ-02 只在高德 adapter 边界产生。

因此要分清两个目标：

- **止住当前 400**：去重后每批不超过 40，可以恢复协议正确性，但每次挂载仍可能发送 4 批。
- **修复重复请求的根因**：默认浏览链路不调用坐标转换服务。WGS84 仍是事实源，GCJ-02 只作为高德 adapter 内的临时展示投影；对 `approximate` 校园锚点优先评估经 CUHK 实测的本地转换。只有不能由获批本地投影满足的、用户主动触发的坐标需求，才进入高德官方转换 fallback。

无论采用哪条路线，坐标投影失败都只能影响对应覆盖物，不能把已经加载成功的高德底图变成“地图暂时不可用”。

## 调研范围和证据边界

本调研以固定 Git commit 的 GitHub 源码和高德官方文档为一手证据，检查了通用 React 封装、低代码平台、地图选址组件、实际应用、轨迹地图和本地坐标转换库。搜索重点是 `AMap.convertFrom`、`AMap.Geolocation({ convert: true })`、坐标写入和覆盖物创建路径，以及异步请求的缓存、去重、竞态和失败处理。

“没有调用 `convertFrom`”只表示在所列源码路径和提交中没有运行时坐标转换，不能自动推导为“项目实现了更高明的转换器”。多数情况下，它只表示输入已经被约定为 provider-native GCJ-02。

## 高德官方约束

- [JS API 2.0 坐标转换文档](https://lbs.amap.com/api/javascript-api-v2/guide/transform/convertfrom)明确说明 GPS/WGS84 坐标需转成高德 GCJ-02，`AMap.convertFrom` 一次最多支持 40 对坐标；成功应同时满足 `status === "complete"` 和 `result.info === "ok"`。
- [Web Service 坐标转换文档](https://lbs.amap.com/api/webservice/guide/api/convert)对服务端接口同样规定每批最多 40 对坐标。
- [官方批量示例](https://developer.amap.com/demo/javascript-api-v2/example/other-gaode/othertoamap-more)只转换两个固定点，并在页面加载或用户切换坐标类型时重新调用。它是 API 演示，不是任意长度数据集的分批、缓存或重试方案。
- [JS API 配额说明](https://lbs.amap.com/api/javascript-api-v2/flowlevel)把坐标转换计入有每日上限的服务调用，因此“每次启动全量转换”不仅是性能问题，也会消耗共享配额。
- [Web Service 错误码](https://lbs.amap.com/api/webservice/guide/tools/info)区分参数错误、日配额/QPS 超限和 `SERVER_IS_BUSY` 等错误。参数、权限或日配额错误不应自动重试；网络中断、服务繁忙等短暂错误才适合有限次数退避。
- [高德开放平台服务协议第 3.5 条](https://lbs.amap.com/pages/terms/)对直接存储、缓存或抓取服务数据有限制。把 `convertFrom` 的 GCJ-02 结果持久写入数据库、CDN 或跨会话缓存前，应取得高德的书面确认并完成合规审查。本调研不是法律意见。

这里的“零转换请求”只指不再调用坐标转换端点。只要继续使用高德底图，SDK、瓦片、热点、搜索或用户定位仍会产生正常的高德网络流量；正确目标不是让高德地图完全离线，而是让页面被动打开、React 重渲染和目录刷新不再触发确定性的 WGS84 → GCJ-02 网络转换。

## 开源仓库比较

| 仓库（固定提交）                                                                                                                   | 实际坐标契约和触发时机                                                         | 40 点、去重和缓存                                                      | 失败与重试                                 | 是否预存 provider 坐标            | 对 CUpedia 的意义                                                             |
| ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------- | ------------------------------------------ | --------------------------------- | ----------------------------------------------------------------------------- |
| [uiwjs/react-amap `04d30d8`](https://github.com/uiwjs/react-amap/tree/04d30d8e13c1fafe5916f12762aa903392634167)                    | 运行时把调用方的 `position` 原样交给 AMap；不自动转换                          | 无转换请求，也无转换队列或缓存                                         | 由业务层负责                               | 封装层不管理数据                  | “零请求”来自调用方必须传 provider-ready 坐标，不是批量优化                    |
| [NocoBase `02670be`](https://github.com/nocobase/nocobase/tree/02670becaa51579db8a66de5208a928467d2a05f)                           | AMap 编辑产生的坐标直接保存，浏览时直接绘制全部记录                            | 无 `convertFrom`；没有 40 点问题                                       | 地图加载错误独立处理                       | 是，插件路径中值实际为 AMap 坐标  | 录入即 provider-native，与 CUpedia 的 canonical WGS84 契约不同                |
| [baidu/amis `43a33ee`](https://github.com/baidu/amis/tree/43a33ee066990589f5891674e645c4c927761fe5)                                | 高德 Picker 使用 GCJ-02；浏览器定位让 SDK 自动转换单点                         | 无通用批量转换；无转换缓存                                             | 失败按定位/地理编码处理                    | 输出附 `vendor: "gaode"`          | 借鉴“坐标必须带来源/坐标系”，不能借鉴为 CUpedia 的事实存储                    |
| [joye61/clxx `fd5ad48`](https://github.com/joye61/clxx/tree/fd5ad4854562b315e7f8ad680a2af39d481fc60d)                              | `initialCenter` 明确要求 AMap=GCJ-02；定位用 `convert: true`                   | 不做 `convertFrom` 批处理；复用进行中的定位 Promise，缓存/复用反查请求 | 用 sequence 丢弃过期结果；搜索 250ms 防抖  | 组件输出 provider-native 选择结果 | 很好的异步去重和 latest-wins 范例，但仍是不同坐标契约                         |
| [ezBookkeeping `a4127db`](https://github.com/mayswind/ezbookkeeping/tree/a4127db6df355c1d036d90ecc06fd59d996c28e5)                 | 用户要求移动中心或 marker 时转换单点                                           | 每次 1 点；实例只记最后一个成功中心，未复用 in-flight Promise          | 无自动重试；失败时错误地回退到未转换 WGS84 | 不持久预存                        | 最接近可迁移的“按需适配器”，但失败回退和竞态不能照搬                          |
| [lovelace-cn-map-card `88cb29d`](https://github.com/fineemb/lovelace-cn-map-card/tree/88cb29d57d184fdcaf7e42a28e9af822a485388f)    | 动态实体移动超过 5m 才单点转换；历史轨迹全量转换                               | 记住原始位置和历史长度；历史数组未分批                                 | 失败不更新相应 marker/path；无自动重试     | 只保留组件内展示状态              | 单点阈值有用；历史轨迹是同类超限反例                                          |
| [amap-tianditu-layer `c8f1399`](https://github.com/tao-zhi-1992/amap-tianditu-layer/tree/c8f1399e54fa522636f12e4d062f93c1bddedc2a) | 每次 CustomLayer render 只在本地把地图中心 GCJ-02 转 WGS84，再按视口算瓦片队列 | 不调用高德转换服务，无 40 点和配额问题                                 | 纯同步计算，无网络重试                     | 否                                | 证明“按视口计算需求集”可行，但它只转换一个中心，不是 159 个 marker 的现成方案 |
| [Naptie/nearcade `9a3c5b5`](https://github.com/Naptie/nearcade/tree/9a3c5b56cb6eb05b71f2ebde41bcc2b86f9433b8)                      | 静态 shop 直接作为 AMap 坐标；用户交互路径才转换一个点                         | 每次 1 点；一个 Google picker 的 `idle` 会重复请求                     | 失败 reject；无自动重试                    | 选择结果写入通用坐标字段          | 按需单点值得借鉴；无坐标系字段和 `idle` 重复调用是反例                        |
| [wwenj/tripRecord `328a352`](https://github.com/wwenj/tripRecord/tree/328a352a2dbb345a87d6a4e5baec60f51abacd03)                    | `watchPosition` 每次得到不同 GPS 点就转换单点                                  | 只排除相邻且完全相等的坐标                                             | 失败丢点；无节流或重试策略                 | 上传已转换轨迹                    | 这是“随着位置更新持续请求”的旧式反例，不应复制                                |
| [legaoyi/JT808 `337ff92`](https://github.com/legaoyi/JT808/tree/337ff92d07ba59b773f1e2168e92eaaa047c9692)                          | 主显示路径采用本地转换；另有把任意 path 一次交给 `convertFrom` 的包装器        | 本地路径无上限；API 包装器没有 40 点保护                               | 无明确重试或部分失败策略                   | 服务器 GPS 数据仍可保持原始       | 本地转换可避开配额；API 包装器是协议防线缺失的反例                            |

### 1. Provider-native：为什么有些仓库完全不转换

`uiwjs/react-amap` 的类型注释明确说明 AMap 使用 GCJ-02，WGS84 要由调用者预先转换；运行时的 Marker 则把 props 直接交给 `new AMap.Marker`。仓库只是暴露 `convertFrom` 的类型，没有隐藏的自动转换逻辑：[坐标类型说明](https://github.com/uiwjs/react-amap/blob/04d30d8e13c1fafe5916f12762aa903392634167/packages/types/src/base.d.ts#L15-L18)、[Marker 运行时](https://github.com/uiwjs/react-amap/blob/04d30d8e13c1fafe5916f12762aa903392634167/packages/marker/src/useMarker.tsx#L7-L53)、[`convertFrom` 类型](https://github.com/uiwjs/react-amap/blob/04d30d8e13c1fafe5916f12762aa903392634167/packages/types/src/core.d.ts#L653-L660)。TileLayer README 还展示了本地 WGS84/GCJ-02 算法，但那是文档示例，不是封装层的生产运行时：[本地算法和切换示例](https://github.com/uiwjs/react-amap/blob/04d30d8e13c1fafe5916f12762aa903392634167/packages/tile-layer/README.md#L62-L128)。

NocoBase 在 AMap 绘制结束后直接读取 overlay 坐标并调用 `onChange`，之后又把保存值直接用于创建 overlay；该 AMap 插件路径中没有 `convertFrom`：[录入坐标](https://github.com/nocobase/nocobase/blob/02670becaa51579db8a66de5208a928467d2a05f/packages/plugins/%40nocobase/plugin-map/src/client/components/AMap/Map.tsx#L145-L168)、[直接创建覆盖物](https://github.com/nocobase/nocobase/blob/02670becaa51579db8a66de5208a928467d2a05f/packages/plugins/%40nocobase/plugin-map/src/client/components/AMap/Map.tsx#L249-L289)、[绘制全部数据](https://github.com/nocobase/nocobase/blob/02670becaa51579db8a66de5208a928467d2a05f/packages/plugins/%40nocobase/plugin-map/src/client/components/AMap/Block.tsx#L130-L163)。它把坐标系问题放在录入数据契约里，并没有实现按需 WGS84 投影。

amis 的高德 Picker 也没有通用 `convertFrom`。浏览器定位使用 `AMap.Geolocation({ convert: true })`，地图点击和 POI 结果直接保存，并附 `vendor: "gaode"`：[定位和输入处理](https://github.com/baidu/amis/blob/43a33ee066990589f5891674e645c4c927761fe5/packages/amis-ui/src/components/GaodeMapPicker.tsx#L78-L157)、[输出 provider 标签](https://github.com/baidu/amis/blob/43a33ee066990589f5891674e645c4c927761fe5/packages/amis-ui/src/components/GaodeMapPicker.tsx#L159-L195)、[外层坐标类型契约](https://github.com/baidu/amis/blob/43a33ee066990589f5891674e645c4c927761fe5/packages/amis-ui/src/components/LocationPicker.tsx#L13-L29)。它适合 provider-owned 选址控件，不适合直接替代 CUpedia 的 provider-neutral 校园事实。

clxx 把这个契约写得最清楚：`initialCenter` 对 AMap 必须是 GCJ-02，对 BMap 必须是 BD-09；高德定位用 `convert: true`，因此不需要再批量调用坐标转换：[输入契约](https://github.com/joye61/clxx/blob/fd5ad4854562b315e7f8ad680a2af39d481fc60d/src/MapLocationSelection/index.tsx#L21-L27)、[AMap 初始化直接使用中心](https://github.com/joye61/clxx/blob/fd5ad4854562b315e7f8ad680a2af39d481fc60d/src/MapLocationSelection/provider.amap.ts#L248-L258)、[定位转换和 in-flight 复用](https://github.com/joye61/clxx/blob/fd5ad4854562b315e7f8ad680a2af39d481fc60d/src/MapLocationSelection/provider.amap.ts#L560-L630)。

所以，uiwjs、NocoBase、amis 和 clxx 的共同点不是“找到了免费批量转换”，而是**输入已经属于地图 provider 的坐标系**。CUpedia 若照搬，就会破坏“WGS84 是唯一规范事实、高德坐标只属于适配层”的既有决定。

### 2. 按需单点：可迁移的部分和缺口

ezBookkeeping 只在 `setMapCenterTo` 和 `setMapCenterMarker` 被调用时分别转换一个点，并缓存最后一个成功转换的中心：[中心单点转换和实例缓存](https://github.com/mayswind/ezbookkeeping/blob/a4127db6df355c1d036d90ecc06fd59d996c28e5/src/lib/map/amap.ts#L160-L199)、[marker 单点转换](https://github.com/mayswind/ezbookkeeping/blob/a4127db6df355c1d036d90ecc06fd59d996c28e5/src/lib/map/amap.ts#L201-L230)。它没有在启动时全量转换地点库，是 CUpedia 最值得借鉴的触发边界。

但这份实现仍有两个不能复制的缺陷。第一，中心转换完成前再次请求同一中心时不会复用正在进行的 Promise；第二，失败时把未转换的 WGS84 直接交给 AMap，会造成位置偏移。回调也没有 latest-wins 守卫，旧请求可能覆盖新中心。因此 CUpedia 应借鉴“按需单点”，但要补上 in-flight 去重、失败关闭覆盖物和过期结果丢弃。

Nearcade 同样把 `convertCoordinates` 限制为单个位置：[单点转换函数](https://github.com/Naptie/nearcade/blob/9a3c5b56cb6eb05b71f2ebde41bcc2b86f9433b8/src/lib/utils/index.ts#L1600-L1629)。不过 Google picker 每次 `idle` 都会调用它，缺少坐标 key 去重和防抖：[重复触发路径](https://github.com/Naptie/nearcade/blob/9a3c5b56cb6eb05b71f2ebde41bcc2b86f9433b8/src/lib/components/LocationPickerModal.svelte#L130-L180)。其代理还设置了 300 秒公开缓存：[代理响应头](https://github.com/Naptie/nearcade/blob/9a3c5b56cb6eb05b71f2ebde41bcc2b86f9433b8/src/lib/endpoints/amap.server.ts#L6-L53)。这证明开源项目确实有人缓存，但不能证明这种做法符合 CUpedia 的高德合同；在获得书面许可前不应把它当作合规先例。

### 3. 动态轨迹：节流范例和持续请求反例

Lovelace CN Map Card 保存实体上次的原始 GPS 位置，移动超过 5 米才单点转换；如果配置已经是 `gaode` 坐标就跳过转换：[移动阈值和单点更新](https://github.com/fineemb/lovelace-cn-map-card/blob/88cb29d57d184fdcaf7e42a28e9af822a485388f/cn-map-card.js#L336-L388)。这是“只转换发生实质变化的坐标”的好例子。失败时它不更新对应 marker，底图和旧 marker 仍保留，也比把全图置为错误更稳健。

但同一仓库把完整历史轨迹数组一次传给 `convertFrom`，没有分批；仅用历史数组长度判断是否变化：[历史轨迹转换](https://github.com/fineemb/lovelace-cn-map-card/blob/88cb29d57d184fdcaf7e42a28e9af822a485388f/cn-map-card.js#L429-L515)。轨迹超过 40 点后会碰到与 CUpedia 相同的协议上限，而且增加一个点就可能重算整段，因此这部分是反例。

tripRecord 更直接地展示了用户担心的模式：`navigator.watchPosition` 每产生一个不完全相等的 GPS 点，就调用一次 `convertFrom`，没有距离阈值、节流或坐标缓存；成功后的 GCJ-02 轨迹再整体保存：[持续定位转换](https://github.com/wwenj/tripRecord/blob/328a352a2dbb345a87d6a4e5baec60f51abacd03/view/src/components/MapLocation/index.vue#L230-L267)、[保存已转换轨迹](https://github.com/wwenj/tripRecord/blob/328a352a2dbb345a87d6a4e5baec60f51abacd03/view/src/components/MapLocation/index.vue#L408-L429)。这是应明确避免的实现。

### 4. 本地转换与视口需求集

amap-tianditu-layer 的 CustomLayer 每次 render 只取当前高德地图中心，用 `gcoord` 在本地从 GCJ-02 转回 WGS84，然后依据中心、zoom 和视口大小计算需要的瓦片范围，并让靠近中心的瓦片优先：[视口瓦片队列](https://github.com/tao-zhi-1992/amap-tianditu-layer/blob/c8f1399e54fa522636f12e4d062f93c1bddedc2a/src/index.ts#L9-L61)、[CustomLayer render 中只转换中心](https://github.com/tao-zhi-1992/amap-tianditu-layer/blob/c8f1399e54fa522636f12e4d062f93c1bddedc2a/src/index.ts#L69-L112)。它没有网络转换、40 点限制或转换配额。

这个仓库给出的可迁移思想是“先从视口推导当前需求，再做最少计算”，并没有提供可直接复制的 marker 分批器。对 CUpedia 来说，优先级还应比纯视口更精确：当前选中的建筑、当前开启类别的设施、实际可见 marker，应先于视口内但当前根本不会绘制的地点。

`gcoord` 本身是纯本地 WGS84/GCJ-02 算法：[转换实现](https://github.com/hujiulong/gcoord/blob/fa43556eaa0a55a25895d4e7b0aca4d2c2f4320e/src/crs/GCJ02.ts#L1-L78)。其 WGS84→GCJ-02 测试覆盖一组城市 fixture，但断言精度是 `toBeCloseTo(..., 4)`，约为数米量级，不能单独证明中大校园的楼宇锚点能达到产品要求：[测试精度](https://github.com/hujiulong/gcoord/blob/fa43556eaa0a55a25895d4e7b0aca4d2c2f4320e/test/unit/crs/WGS84.spec.ts#L26-L38)。README 也明确给出法律提示：[法律提示](https://github.com/hujiulong/gcoord/blob/fa43556eaa0a55a25895d4e7b0aca4d2c2f4320e/README.zh-CN.md#L11-L27)。

因此，本地转换是可以单独评估的替代路线，却不应因为“GitHub 上能运行”就直接上线。采用前至少需要新的 ADR、依赖和许可证审查、合规确认、覆盖 CUHK 校园和边界条件的基准测试、算法版本和来源记录，以及可回滚的 provider adapter 实现。

JT808 也说明了两条路线的差别：业务展示路径对设备 GPS 做本地转换，[加载设备并本地转换](https://github.com/legaoyi/JT808/blob/337ff92d07ba59b773f1e2168e92eaaa047c9692/elink-iov-platform-web/src/main/webapp/js/mapControl.js#L13-L36)；另一个通用 AMap 包装器却把任意 path 一次传给 `convertFrom`，没有 40 点守卫，[未分批的 API 包装器](https://github.com/legaoyi/JT808/blob/337ff92d07ba59b773f1e2168e92eaaa047c9692/elink-iov-platform-web/src/main/webapp/js/map/gaodeMap.js#L317-L338)。后者在仓库中没有找到明确业务调用，不能算成熟实践，只能作为边界保护缺失的反例。

### 5. 异步去重和竞态：从 clxx 借鉴，不把它误称为坐标转换缓存

clxx 没有缓存 `convertFrom` 结果，但它对高德服务调用的控制值得迁移：

- 同一个进行中的定位 Promise 会被复用，避免连续点击重复弹权限和重复调用：[定位 Promise 去重](https://github.com/joye61/clxx/blob/fd5ad4854562b315e7f8ad680a2af39d481fc60d/src/MapLocationSelection/provider.amap.ts#L572-L630)。
- 反向地理编码同时保存当前 Promise 和结果，确认操作优先复用，不再多发一次：[pending 和结果复用](https://github.com/joye61/clxx/blob/fd5ad4854562b315e7f8ad680a2af39d481fc60d/src/MapLocationSelection/index.tsx#L240-L256)、[确认时复用](https://github.com/joye61/clxx/blob/fd5ad4854562b315e7f8ad680a2af39d481fc60d/src/MapLocationSelection/index.tsx#L838-L881)。
- 每次中心变化推进 sequence，旧回调回来后直接丢弃；这与 CUpedia 已有 projector revision 思路一致：[latest-wins](https://github.com/joye61/clxx/blob/fd5ad4854562b315e7f8ad680a2af39d481fc60d/src/MapLocationSelection/index.tsx#L387-L438)。
- 关键字搜索先做 250ms 防抖，再用 sequence 拒收旧结果：[防抖和过期结果保护](https://github.com/joye61/clxx/blob/fd5ad4854562b315e7f8ad680a2af39d481fc60d/src/MapLocationSelection/index.tsx#L714-L757)。

这类控制解决“同一需要被多次触发”和“旧结果覆盖新状态”，但不会替代每批最多 40 点的硬限制。

## 路线比较：哪一种才会停止重复转换请求

| 路线                                 | 被动打开地图的坐标转换请求        | 是否保留 canonical WGS84 | 主要代价或风险                             | 判断                       |
| ------------------------------------ | --------------------------------- | ------------------------ | ------------------------------------------ | -------------------------- |
| 159 点拆成 4 批                      | 每次通常 4 次                     | 是                       | 仍与 mount/刷新绑定，持续消耗配额          | 只能作为协议补丁           |
| 官方 API 按当前 overlay、会话内去重  | 默认可降到 0–1 次；新坐标仍会请求 | 是                       | 跨会话仍会重复；需要批次、竞态和错误治理   | 可接受的过渡方案           |
| canonical 数据改存 GCJ-02            | 0                                 | 否                       | 破坏 ADR 0034，也把事实模型绑死在高德      | 不采用                     |
| adapter 内做经校准的本地展示转换     | 0                                 | 是                       | 需确认合规、精度、版本和适用范围           | `approximate` 锚点首选评估 |
| 获书面许可后物化 provider projection | 0                                 | 是                       | 需要高德授权、独立派生表、失效规则和新 ADR | 合同允许时的备选           |

CUpedia 已有一项很关键的校园实测：以固定偏移 `[+0.004877, -0.002832]` 校验 CUHK 九个点，最大水平误差 3.190m、平均 1.973m。现有结论只允许它服务 `approximate` point，不能冒充 `precise`：[九点校准记录](./amap-place-picker-research.md#cuhk-九点坐标校准2026-08-25)。这意味着“本地展示投影”不是空想，但上线前仍要把正向 WGS84 → GCJ-02、校园边界和所有精度等级纳入固定 fixture 验收，并完成合规决定。

因此推荐的目标状态是分级处理：建筑代表点和校准范围内的浏览器定位等 `approximate` 点走经批准的本地 adapter；搜索、反查和 provider POI 继续按用户意图调用高德服务；只有 `precise` WGS84 点或校准范围外的临时坐标才走按需、去重、每批不超过 40 的官方 `convertFrom` fallback。这样默认 browse 和常见的校园内定位都可以做到坐标转换请求为 0，同时不改变 canonical 数据。

## CUpedia 当前根因

当前实现有四层问题：

1. **协议层**：`projectCampusMapBrowseToAmap` 收集所有建筑锚点和地点 marker，再把校园中心放在最前面，最后只调用一次 `convertFrom`：[收集和单次转换](https://github.com/HomuraCatMadoka/CUpedia/blob/f8c2f2da8ea7aa0d4b74f5b9db02eb586b0f2a08/src/lib/campus-map/amap-browse-projection.ts#L77-L151)。当前 158+1 超过 40。
2. **代理层**：安全代理明确只允许 1–40 个坐标，并返回 `Cache-Control: no-store`：[代理上限](https://github.com/HomuraCatMadoka/CUpedia/blob/f8c2f2da8ea7aa0d4b74f5b9db02eb586b0f2a08/src/app/%255FAMapService/%5B...path%5D/route.ts#L6-L7)、[1–40 校验](https://github.com/HomuraCatMadoka/CUpedia/blob/f8c2f2da8ea7aa0d4b74f5b9db02eb586b0f2a08/src/app/%255FAMapService/%5B...path%5D/route.ts#L103-L110)。这个拒绝是正确的防线，不应放宽到 159。
3. **需求层**：转换输入来自整个 `browseProjection`，不是“当前确实要绘制的 marker”。也没有先按 WGS84 坐标去重，所以同一个建筑锚点被多个地方引用时仍可能重复计费。
4. **生命周期和失败层**：effect 依赖整个 `browseProjection`；每次触发都重新全量调用。任意转换失败后会清空所有 AMap 位置并设置全局 `coordinates` 地图错误：[触发与全图失败](https://github.com/HomuraCatMadoka/CUpedia/blob/f8c2f2da8ea7aa0d4b74f5b9db02eb586b0f2a08/src/components/campus-map/campus-map-runtime.tsx#L1915-L1975)。现有 revision 只能阻止旧结果覆盖新结果，不能取消已经发送的请求，也没有缓存。

所以问题的心智模型是：

```text
地图事件 / projection 刷新 / 手动重试
              │
              ▼
        重建 159 点全集
              │
              ▼
      一次 convertFrom(159)
              │
              ▼
       代理因 >40 拒绝
              │
              ▼
 清空全部 provider 坐标 → 全图错误 UI
```

它不是 tight infinite loop，但只要上述事件再次发生，就会重新走完整失败链。

## 建议的正确修复

### 第一层：把坐标投影从地图启动中拆出来

`AMap.Map` 创建成功就应进入“底图可用”，不能等待 159 个业务坐标。校园初始中心使用 adapter 的展示配置；现有九点校准通过合规和正向精度验收后，可让默认中心和 `approximate` 建筑锚点走本地投影。默认没有设施类别、没有选中地点、也不创建自定义 marker 时，坐标转换服务调用必须为 **0**。

搜索和地点卡片继续使用 canonical WGS84 目录，不需要为了文本列表先投影坐标。`mapLoadError` 只负责配置、SDK 和地图实例失败；overlay 投影拥有单独状态。

### 第二层：从实际 overlay 生成需求，而不是投影整个目录

建议需求优先级为：

1. 当前选中的建筑或地点；
2. 当前开启设施类别后实际会创建的唯一 marker；
3. 若将来默认同时显示大量 marker，再根据当前视口和小幅预取边界计算需求集。

不要因为 `browseProjection` 中名称、楼层、评分或卡片内容变化而重新投影。投影 effect 只依赖 `sourceCRS + longitude + latitude` 组成的稳定需求签名。一个建筑下多个地点共用建筑 anchor 时只算一次，再把同一结果映射给多个使用者。

当前 UI 只有在设施类别和范围满足条件时才真正创建设施 marker，所以最先落地的是“只投影实际 overlay”，无需先构建复杂的视口调度器。

### 第三层：官方转换只作为受控 fallback

若某类坐标不能使用已批准的本地展示投影，再进入唯一的高德转换入口：

1. 对稳定坐标 key 去重，并复用相同的 in-flight Promise；
2. 只处理尚未满足的需求，每批最多 40 点；
3. 用一个 worker 顺序执行，不一次并发打出所有批次；
4. 校验每批 `status`、`info`、返回长度和每个坐标，只合并成功批次；
5. 用 generation/revision 忽略过期结果，卸载或需求变化后不再派发尚未开始的批次；
6. 当前地图实例内复用展示结果，不因非坐标字段刷新而丢弃。

这条 fallback 保证任何请求都合法并避免同一会话重复请求，但不能让跨会话请求自动变成零。要跨会话消除官方转换调用，只能采用经批准的本地 adapter，或在高德书面许可后建立可重建的 provider projection。

不要把转换结果写入 canonical place/building 数据。在获得高德书面许可前，也不增加数据库、Redis、CDN、浏览器持久存储或跨会话服务端结果缓存。若许可允许物化结果，应另建以 canonical 坐标版本为 key 的派生投影表，并通过单独 ADR 明确失效和重建规则。

### 第四层：失败隔离和显式重试

- 底图加载成功后，即使某个坐标批次失败，也不要显示“整张地图暂时不可用”。保留底图和之前成功的覆盖物，只隐藏或标记失败批次的 marker。
- 失败坐标在当前地图会话内也作为结果记住；重渲染、目录刷新或关闭后重开分类都不自动重试。
- 只有“重新定位”、重新进入编辑等明确用户动作才清除对应失败结果并重试。参数非法、key/权限错误和日配额耗尽不会被背景循环放大。
- 若以后有指标证明短暂网络失败值得自动退避，再单独增加错误分类和次数上限；当前不为尚未观察到的场景预建重试策略。
- 失败时不要把 WGS84 原坐标直接画到 AMap 上，因为“能显示”但位置偏移比暂时隐藏 marker 更难发现。

### 第五层：可观测性和验收标准

记录不含敏感精确坐标的指标：触发原因、需求点数、唯一点数、批次数、每批大小、in-flight 复用次数、成功/失败类型和耗时。这样可以确认问题是挂载、projection 刷新还是用户重试触发，而不是靠感觉判断“一直请求”。

建议验收条件：

- 无设施类别、无选中地点时，打开地图对坐标转换端点的调用为 0。
- 搜索、查看地点卡片、目录刷新和非坐标字段更新不触发 `convertFrom`。
- 开启一个类别时，只投影实际要显示的唯一坐标；经批准的本地投影不发网络请求，官方 fallback 的任何请求都不超过 40 点。
- 同一地图会话内，同一坐标的并发需求只产生一个在飞请求。
- 一批失败不清空底图或已成功 marker；重试只针对失败批次。
- 失败不会因重渲染自动重试；只有明确的用户动作可重试，且不存在定时或递归重试。
- 本地投影对固定 CUHK fixture 达到对应 `approximate`/`precise` 门槛；达不到时 fail closed，不静默提升精度。
- canonical 数据仍只有 WGS84，高德坐标不会回写为校园事实。

## 不建议的“快速修复”

- **把代理上限从 40 调大**：上游高德同样限制 40，放宽只会把错误推到更远处。
- **只把数组分成四批**：能解除当前 400/转换失败，但每次 mount/刷新仍消耗四次调用。
- **失败后立刻循环重试全部点**：参数或配额错误不会靠重试恢复，还会放大请求。
- **直接用 WGS84 作为高德 marker**：页面看似恢复，实际会产生可见位置偏移。
- **把 GCJ-02 直接加进 canonical building/place 记录**：破坏 provider-neutral 数据边界，也有高德协议风险。
- **直接复制开源本地公式**：源码可见不等于精度、合规和长期维护都已满足 CUpedia 要求。

## 最终判断

开源仓库没有给出一个可以原样复制的“159 点高德 API 转换器”。它们真正共同的经验是：**不要在 browse 启动路径制造全量转换需求。**

对 CUpedia，正确落地顺序应是：

1. 先把底图 ready 与 overlay ready 拆开，让坐标失败不再杀死整张地图；
2. 用实际 overlay 生成需求，默认 browse 对坐标转换端点做到 0 请求；
3. 为 `approximate` 校园锚点评审和验收本地 adapter，继续只保存 WGS84 canonical；
4. 对仍需官方转换的少量需求，增加 `<=40` 硬防线、坐标和 in-flight 去重、latest-wins 与批次级失败隔离；
5. 再根据指标决定是否需要视口队列；跨会话 provider 缓存只有在高德书面许可和新 ADR 后才考虑。

这套方案才会同时修复重复请求、40 点上限、整图失败和长期配额风险。若本地转换暂未通过合规或精度审批，步骤 4 可以先作为过渡，但必须明确：它只是把调用缩到用户当前需求，并没有消除首次转换请求。
