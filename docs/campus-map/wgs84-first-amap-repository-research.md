# WGS84-first 的高德相关开源仓库调研

状态：研究快照

证据提交核对日期：2026-09-02

## 简短回答

有，而且不只是理论设计。

本次证据中，最接近 CUpedia 的是 Obsidian Advanced Maps 和 NetworkPlanningTooV3：它们都把 WGS84 当作长期保存或后端交换的坐标，只在高德显示边界转成 GCJ-02，并在地图点击或结果写回时转回 WGS84。

这条路线可以让“打开地图浏览已有静态地点”对 `AMap.convertFrom` 的调用降为零。这里的“零”只指坐标转换接口；高德底图瓦片、POI 搜索、逆地理编码等正常地图请求仍然存在。

这些第三方实现只能证明架构可行，不能证明公式获得高德授权、符合 CUpedia 的使用合同，或在 CUHK 校园达到所需精度。

## 分类标准

本报告按三档判断，不用仓库名气代替源码证据：

1. **强匹配**：WGS84 是 canonical 数据；GCJ-02 只在 AMap/AutoNavi 展示边界产生；地图结果写回前归一化为 WGS84。
2. **相邻架构证据**：能证明“WGS84 主状态 + GCJ-02 派生状态”的模块边界，但不是完整的高德前端。
3. **部分实现或反例**：只做到输入转换、只提供 adapter 能力，或仍在运行时反复调用转换服务，无法证明完整存储契约。

## 第一档：强匹配

### 1. Obsidian Advanced Maps

固定提交：[Jin1c-3/obsidian-advanced-maps `e9bb5e8`](https://github.com/Jin1c-3/obsidian-advanced-maps/tree/e9bb5e83892bfd3fe9d0498a0efde092a03e2245)。

它在坐标模块开头直接声明：vault 中的数据使用 WGS84；当 tile source 是 AMap/AutoNavi 等中国偏移瓦片时，显示空间才使用 GCJ-02：[坐标契约](https://github.com/Jin1c-3/obsidian-advanced-maps/blob/e9bb5e83892bfd3fe9d0498a0efde092a03e2245/src/coords.ts#L1-L27)。

边界函数也是成对出现的：`toTileSpace` 把 WGS84 转成瓦片需要的坐标，`toWgs84` 则把交互坐标归一化回来：[双向边界](https://github.com/Jin1c-3/obsidian-advanced-maps/blob/e9bb5e83892bfd3fe9d0498a0efde092a03e2245/src/coords.ts#L103-L120)。

保存的 Place 明确继续使用 WGS84，而不是把瓦片空间坐标写回 vault：[Place 存储](https://github.com/Jin1c-3/obsidian-advanced-maps/blob/e9bb5e83892bfd3fe9d0498a0efde092a03e2245/src/places.ts#L22-L38)。

调用高德逆地理编码时，它只在 service seam 把 WGS84 输入转成 GCJ-02：[AMap reverse seam](https://github.com/Jin1c-3/obsidian-advanced-maps/blob/e9bb5e83892bfd3fe9d0498a0efde092a03e2245/src/geocode.ts#L197-L216)。项目文档也公开说明保存坐标与中国地图服务坐标之间的区别：[坐标与服务说明](https://github.com/Jin1c-3/obsidian-advanced-maps/blob/e9bb5e83892bfd3fe9d0498a0efde092a03e2245/docs/guide/en/coordinates-and-services.md#L14-L19)。

这是非常接近 CUpedia ADR 的实现：事实坐标不随地图供应商改变，provider 投影是可替换的展示逻辑。

边界也要说清楚：它使用 AMap/AutoNavi 瓦片配合 MapLibre，不是 AMap JS SDK。因此它证明的是数据和投影架构，不是 AMap JS SDK 的具体集成方式。

### 2. NetworkPlanningTooV3

固定提交：[weicongpeng/NetworkPlanningTooV3 `1f3da0c`](https://github.com/weicongpeng/NetworkPlanningTooV3/tree/1f3da0cd07d49debfe83a6fce969749c7c65e39d)。

它的坐标工具注释把契约写得很完整：source/backend 坐标使用 WGS84，高德展示使用 GCJ-02，高德产生的结果在进入业务数据前转回 WGS84：[模块契约](https://github.com/weicongpeng/NetworkPlanningTooV3/blob/1f3da0cd07d49debfe83a6fce969749c7c65e39d/frontend/src/renderer/utils/coordinate.ts#L1-L13)。

同一模块提供本地 WGS84→GCJ-02 和 GCJ-02→WGS84 的成对转换函数：[本地双向转换](https://github.com/weicongpeng/NetworkPlanningTooV3/blob/1f3da0cd07d49debfe83a6fce969749c7c65e39d/frontend/src/renderer/utils/coordinate.ts#L67-L130)。

读取数据用于高德 marker 时，它在 GeoDataLayer 展示边界把 WGS84 转成 GCJ-02：[marker 显示边界](https://github.com/weicongpeng/NetworkPlanningTooV3/blob/1f3da0cd07d49debfe83a6fce969749c7c65e39d/frontend/src/renderer/components/Map/GeoDataLayer.tsx#L301-L349)。

反方向上，用户在高德地图点击得到 GCJ-02 后，OnlineMap 在写入业务状态前转回 WGS84：[点击写回边界](https://github.com/weicongpeng/NetworkPlanningTooV3/blob/1f3da0cd07d49debfe83a6fce969749c7c65e39d/frontend/src/renderer/components/Map/OnlineMap.tsx#L1576-L1623)。

这比“只在展示前转换一次”更完整，因为它同时保护读取和写入两个方向，不会让 GCJ-02 悄悄污染后端数据。

## 第二档：相邻架构证据

### Open UAV Telemetry Bridge

固定提交：[iannil/open-uav-telemetry-bridge `d28455f`](https://github.com/iannil/open-uav-telemetry-bridge/tree/d28455f730640332a1eed32d5913815a0af3509a)。

它把无人机核心状态的 `Lat`、`Lon` 保持为 WGS84，同时把 GCJ 坐标建模成可选派生字段，而不是替代原始位置：[核心状态模型](https://github.com/iannil/open-uav-telemetry-bridge/blob/d28455f730640332a1eed32d5913815a0af3509a/internal/models/drone_state.go#L3-L28)。

转换发生在 coordinator 的本地派生步骤中：[派生转换边界](https://github.com/iannil/open-uav-telemetry-bridge/blob/d28455f730640332a1eed32d5913815a0af3509a/internal/core/coordinator/converter.go#L27-L67)。

它不是 AMap 前端，也没有证明 marker 点击写回路径；可借鉴之处是“canonical 字段不变，provider 坐标是可丢弃、可重算的派生值”。

## 第三档：部分实现或反例

### ezBookkeeping：按需转换，但写回边界不完整

固定提交：[mayswind/ezBookkeeping `a4127db`](https://github.com/mayswind/ezbookkeeping/tree/a4127db6df355c1d036d90ecc06fd59d996c28e5)。

AMap provider 接收 provider-neutral、WGS84 式的中心或 marker 输入，并只在用户需要移动地图时调用单点 `convertFrom`：[按需单点转换](https://github.com/mayswind/ezbookkeeping/blob/a4127db6df355c1d036d90ecc06fd59d996c28e5/src/lib/map/amap.ts#L160-L230)。

但地图 click 回调直接把 AMap 的 `e.lnglat` 交给通用回调，没有在这个 provider 边界看到 GCJ-02→WGS84 归一化：[点击输出](https://github.com/mayswind/ezbookkeeping/blob/a4127db6df355c1d036d90ecc06fd59d996c28e5/src/lib/map/amap.ts#L81-L118)。因此它只能算部分匹配，不能作为 canonical WGS84 已被完整保护的证据。

### Lovelace CN Map Card：WGS84 输入，但仍依赖运行时服务转换

固定提交：[fineemb/lovelace-cn-map-card `88cb29d`](https://github.com/fineemb/lovelace-cn-map-card/tree/88cb29d57d184fdcaf7e42a28e9af822a485388f)。

它以 GPS/WGS 式实体位置为输入，移动超过 5 米才单点调用 `AMap.convertFrom`：[实时 marker 转换](https://github.com/fineemb/lovelace-cn-map-card/blob/88cb29d57d184fdcaf7e42a28e9af822a485388f/cn-map-card.js#L336-L388)。

历史轨迹则把整段数组一次交给 `convertFrom`，没有 40 点分批和完整缓存：[全轨迹转换](https://github.com/fineemb/lovelace-cn-map-card/blob/88cb29d57d184fdcaf7e42a28e9af822a485388f/cn-map-card.js#L429-L510)。它证明 WGS84 输入可以接高德，却也是启动/刷新时依赖网络转换服务的反例。

### react-native-cn-maps：只证明 adapter 能力

固定提交：[popsiclelmlm/react-native-cn-maps `6e7e2bb`](https://github.com/popsiclelmlm/react-native-cn-maps/tree/6e7e2bb02465cf702feccdd56a85dc2d6b1cd7d9)。

它支持 `coordinateSystem="wgs84"`，但默认仍是 GCJ-02。这个开关说明 adapter 能接收 WGS84，不足以证明上层数据库、地图点击和搜索结果都遵循 WGS84 canonical 契约。

## 对 CUpedia 的直接启示

正确借鉴不是“把第三方公式复制进来”，而是复制它们的边界：

1. Building、Place 和用户提交的 canonical 室外点继续只保存 WGS84。
2. AMap adapter 在创建 marker、polyline 或 camera 输入前，本地生成 GCJ-02 展示坐标。
3. AMap click、拖拽、POI 搜索和逆地理结果进入业务模型前，必须转回 WGS84，并保留来源 CRS 和转换 lineage。
4. 转换函数只属于 provider adapter；Server Component、数据库和搜索领域不认识 GCJ-02。
5. provider 坐标若为性能而暂存在内存，只是可重算的 presentation projection，不是第二套事实。

这样，158 个静态建筑锚点可以在浏览器本地同步投影，不再调用 `AMap.convertFrom`，也不存在 40 点网络批次、重复请求或坐标服务配额问题。

但“被动浏览零 `convertFrom`”不等于“地图零高德请求”：瓦片、字体、POI 搜索、逆地理编码和定位仍按产品功能正常访问高德服务。

## 上线前必须补的验证

本地算法仍需单独完成以下工作：

- 合规评审：确认所用算法、地图展示方式和数据流符合适用法律、高德协议与项目授权。
- CUHK 校准：使用校园内经过核实的参考点比较本地算法、高德官方转换结果和实际底图落点。
- 误差阈值：先定义建筑锚点、设施点各自可接受的米级误差，再决定是否通过，而不是只比较小数位。
- 边界测试：覆盖香港/CUHK、异常坐标、中国范围外坐标、批量数据和往返转换误差。
- 版本治理：锁定依赖和公式版本，记录来源与许可证，允许通过 provider adapter 回滚。

第三方仓库的源码、测试和 Star 数都不构成高德授权、测绘合规或精度背书。

## 最终判断

答案是“有”。WGS84-first 已在真实高德相关项目中落地，最强证据是 Obsidian Advanced Maps 和 NetworkPlanningTooV3。

对 CUpedia 最正确的迁移方向是：**canonical WGS84 + AMap 显示边界本地投影 + provider 交互写回前归一化**。

这可以从根上消除静态浏览对 `convertFrom` 的依赖，同时保持 provider-neutral 数据模型；是否采用某一份具体公式，仍必须等待合规评审、CUHK 校准和明确误差阈值。
