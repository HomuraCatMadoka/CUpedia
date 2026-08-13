# HK Bus App 地图技术栈核查

核查日期：2026-08-10
核查基线：官方仓库 `hkbus/hk-independent-bus-eta` 的 `master` 提交 [`328628c`](https://github.com/hkbus/hk-independent-bus-eta/commit/328628c86d4f420525f782e20cf97e6f1e4b2bf9)，并用当天 `hkbus.app` 已部署的 JavaScript bundle 交叉确认生产配置。

## 结论

HK Bus App 当前使用 **MapLibre GL JS**，通过 **react-map-gl 的 MapLibre 入口**接入 React；不是 Google Maps、Leaflet 地图或 Mapbox 托管地图。底图主体是 HK Bus 自行托管的、由 OpenStreetMap 数据生成的香港 PMTiles；中英文地名则额外叠加香港地政总署的 raster label tiles。

| 层次           | 已确认实现                                                        |
| -------------- | ----------------------------------------------------------------- |
| 地图渲染       | `maplibre-gl` 5.24.0                                              |
| React 封装     | `react-map-gl` 8.1.1，导入路径 `react-map-gl/maplibre`            |
| PMTiles 客户端 | `pmtiles` 4.3.0                                                   |
| 矢量底图       | `https://pmtiles.hkbus.app/hong-kong.pmtiles`                     |
| 底图数据       | OpenStreetMap 香港 extract，经 Protomaps basemap pipeline 生成    |
| 地名标注       | 香港地政总署 `mapapi.geodata.gov.hk` raster XYZ tiles             |
| 路线线形       | 预生成 GeoJSON；失败时直接连接车站坐标                            |
| 地址搜索       | 香港政府 `map.gov.hk` Location Search API                         |
| 公交路线规划   | 浏览器内 Web Worker 搜索现有线路；没有发现外部 routing engine/API |

依赖声明见官方 [`package.json`](https://github.com/hkbus/hk-independent-bus-eta/blob/328628c86d4f420525f782e20cf97e6f1e4b2bf9/package.json#L37-L53)；锁文件确认实际解析为 `maplibre-gl@5.24.0`、`pmtiles@4.3.0`、`react-map-gl@8.1.1`（[`yarn.lock`](https://github.com/hkbus/hk-independent-bus-eta/blob/328628c86d4f420525f782e20cf97e6f1e4b2bf9/yarn.lock#L6713-L6728)）。

## 底图与 tile provider

1. [`style.ts`](https://github.com/hkbus/hk-independent-bus-eta/blob/328628c86d4f420525f782e20cf97e6f1e4b2bf9/src/components/map/maplibre/style.ts#L9-L20) 把矢量 archive 明确设为 `https://pmtiles.hkbus.app/hong-kong.pmtiles`，并标注 `© OpenStreetMap`。
2. [`BaseMap.tsx`](https://github.com/hkbus/hk-independent-bus-eta/blob/328628c86d4f420525f782e20cf97e6f1e4b2bf9/src/components/map/maplibre/BaseMap.tsx#L24-L37) 注册 `pmtiles://` protocol；其自定义 `CachedPMTilesSource` 会缓存整份 archive，而不是每次拖动地图都重新请求零散 tiles。
3. 明暗样式来自本地 MapLibre style JSON；glyphs 和 sprites 指向 Protomaps assets（[`light.json`](https://github.com/hkbus/hk-independent-bus-eta/blob/328628c86d4f420525f782e20cf97e6f1e4b2bf9/src/components/map/maplibre/styles/light.json#L1-L10)）。
4. 官方 tile 生成仓库的 workflow 从 Geofabrik 下载 `hong-kong-latest.osm.pbf`，用 `protomaps/basemaps` 生成 PMTiles，并计划每四天运行一次（[`generate-maptiles.yml`](https://github.com/hkbus/hk-pmtiles-generation/blob/main/.github/workflows/generate-maptiles.yml)）。其 README 也明确称成品是 OSM ODbL 下的 Produced Work，并要求可见署名（[`README.md`](https://github.com/hkbus/hk-pmtiles-generation/blob/main/README.md#attribution)）。

标签 overlay 在源码中由环境变量 `VITE_MAP_LABEL_URL` 注入（[`BaseMap.tsx`](https://github.com/hkbus/hk-independent-bus-eta/blob/328628c86d4f420525f782e20cf97e6f1e4b2bf9/src/components/map/maplibre/BaseMap.tsx#L127-L143)）。当天生产 bundle [`geom-531p7GNF.js`](https://hkbus.app/assets/geom-531p7GNF.js) 将它编译为：

```text
https://mapapi.geodata.gov.hk/gs/api/v1.0.0/xyz/label/hk/{lang}/WGS84/{z}/{x}/{y}.png
```

其中 `{lang}` 为 `tc` 或 `en`。源码给该 raster source 设置 `tileSize: 256` 和 Lands Department attribution（[`style.ts`](https://github.com/hkbus/hk-independent-bus-eta/blob/328628c86d4f420525f782e20cf97e6f1e4b2bf9/src/components/map/maplibre/style.ts#L55-L75)）。

**Unknown：**`pmtiles.hkbus.app` 当前实际落在 GitHub Pages、Cloudflare R2 还是其他存储/CDN，公开源码只说明 workflow 支持 GitHub Pages 和可选 R2，不能据此确认生产后端。

## 路线、站点 marker 与定位

- 路线详情从 `https://hkbus.github.io/route-waypoints/{file}.json` 读取 GeoJSON；没有文件或读取失败时，以车站经纬度生成一条简单 `LineString`（[`useRoutePath.tsx`](https://github.com/hkbus/hk-independent-bus-eta/blob/328628c86d4f420525f782e20cf97e6f1e4b2bf9/src/hooks/useRoutePath.tsx#L34-L67)）。因此这不是在线道路 routing API。该 waypoint 仓库公开为 [`hkbus/route-waypoints`](https://github.com/hkbus/route-waypoints)。
- GeoJSON 放入 MapLibre `<Source type="geojson">`，路线采用两层 line：下层 6 px 黑色描边，上层 4 px 运营商颜色，并额外放置方向箭头 symbol（[`RouteMap.tsx`](https://github.com/hkbus/hk-independent-bus-eta/blob/328628c86d4f420525f782e20cf97e6f1e4b2bf9/src/components/map/maplibre/RouteMap.tsx#L202-L251)）。
- 车站使用 `react-map-gl/maplibre` 的 DOM `<Marker>`，图标来自应用自带 SVG；当前站闪烁、已经过站灰度处理（[`RouteMap.tsx`](https://github.com/hkbus/hk-independent-bus-eta/blob/328628c86d4f420525f782e20cf97e6f1e4b2bf9/src/components/map/maplibre/RouteMap.tsx#L251-L278)、[marker 样式](https://github.com/hkbus/hk-independent-bus-eta/blob/328628c86d4f420525f782e20cf97e6f1e4b2bf9/src/components/map/maplibre/RouteMap.tsx#L361-L494)）。
- 用户位置由浏览器／宿主 geolocation 提供；地图只负责显示 marker 和精度圈，没有发现第三方定位 SDK。

## Geocoding 与 routing

地址 autocomplete 请求香港政府的：

```text
https://www.map.gov.hk/gs/api/v1.0.0/locationSearch?q=...
```

响应坐标为 EPSG:2326，应用用 `proj4` 转成 WGS84（[`AddressInput.tsx`](https://github.com/hkbus/hk-independent-bus-eta/blob/328628c86d4f420525f782e20cf97e6f1e4b2bf9/src/components/route-search/AddressInput.tsx#L97-L125)）。

公交点到点规划不是 OSRM、Valhalla、Google Directions 或 Mapbox Directions。页面把线路表、站点表、起终点传给 `/search-worker.js`，限制 `maxDepth: 2`（[`RouteSearchPage.tsx`](https://github.com/hkbus/hk-independent-bus-eta/blob/328628c86d4f420525f782e20cf97e6f1e4b2bf9/src/pages/RouteSearchPage.tsx#L165-L191)）；worker 在本地按 500 米附近站和 DFS 搜索线路组合（[`search-worker.js`](https://github.com/hkbus/hk-independent-bus-eta/blob/328628c86d4f420525f782e20cf97e6f1e4b2bf9/public/search-worker.js)）。站点弹窗的“步行导航”只是跳转到 Google Maps URL，不参与 App 内地图渲染或公交线路计算（[`StopDialog.tsx`](https://github.com/hkbus/hk-independent-bus-eta/blob/328628c86d4f420525f782e20cf97e6f1e4b2bf9/src/components/route-eta/StopDialog.tsx#L49-L65)）。

## 对 CUHK 校巴原型的建议

可以复用其**架构思想**，但不建议照搬整个代码：

1. 用 MapLibre GL JS + `react-map-gl/maplibre`，车站与路线规模很小，足以支撑地图、定位、站点点击和线路高亮。
2. 第一版无需建立全香港 PMTiles pipeline。可先使用合规的底图服务；若需要离线、稳定成本或完整视觉控制，再裁剪 CUHK 周边 OSM 数据生成小型 PMTiles。
3. CUHK 官方路线若只有站序而没有道路 geometry，应该自己维护路线 GeoJSON；“直连站点坐标”只能作为明确标注的降级展示，否则山路弯道会严重失真。
4. 站点用 DOM Marker，路线用 GeoJSON Layer，与 HK Bus 的做法一致；不要把每段路线做成大量 DOM 元素。
5. 地图应是站点列表的辅助视图。用户的核心任务仍是查看下一班与反馈，地图不应抢占首屏主要空间。
6. 地址 geocoding 对“附近 CUHK 建筑”未必必要；校园内可直接搜索自有 stop/building 数据，减少外部 API 依赖。

## 许可证与署名 caveats

- HK Bus App 源码声明为 `GPL-3.0-only`（[`package.json`](https://github.com/hkbus/hk-independent-bus-eta/blob/328628c86d4f420525f782e20cf97e6f1e4b2bf9/package.json#L108-L111)、[`LICENSE`](https://github.com/hkbus/hk-independent-bus-eta/blob/328628c86d4f420525f782e20cf97e6f1e4b2bf9/LICENSE)）。借鉴交互与架构没有问题；复制其组件源码进入项目则需要单独评估 GPL 兼容性。
- `route-waypoints` 仓库标为 GPL-2.0（[`LICENSE`](https://github.com/hkbus/route-waypoints/blob/main/LICENSE)）。不要默认其 GeoJSON 可无条件复制到其他许可证项目。
- OSM 数据受 ODbL 约束；公开地图必须保留可见的 `© OpenStreetMap contributors` 署名并链接到版权页（[OSM 官方版权说明](https://www.openstreetmap.org/copyright)）。自托管 tiles 不会消除这项义务。
- 地政总署标签 tiles 必须遵守其 API 条款／免责声明并显示相应署名；HK Bus 同时显示 attribution 和 Lands Department badge（[官方免责声明](https://api.portal.hkmapservice.gov.hk/disclaimer)、[`BaseMap.tsx`](https://github.com/hkbus/hk-independent-bus-eta/blob/328628c86d4f420525f782e20cf97e6f1e4b2bf9/src/components/map/maplibre/BaseMap.tsx#L145-L158)）。正式采用前应再次核对政府服务的调用限额、缓存和再分发条款。
- MapLibre GL JS、react-map-gl、PMTiles 本身均为开源依赖，但仍须保留各自 license notices；这与底图数据和 tile 服务条款是三套独立义务。
- Protomaps glyph/sprite assets目前由 App 直接远程引用。CUHK 项目不应默认可以无限 hotlink；应核对各资产许可证并考虑自托管。

## 置信度与未知项

- **高置信度：**地图库、锁定版本、PMTiles URL、OSM/Protomaps 生成链、生产 label tile URL、GeoJSON 路线及 marker 实现、政府 geocoding API、无外部公交 routing engine。
- **Unknown：**`pmtiles.hkbus.app` 的当前物理托管后端、带宽／SLA／调用成本；地政总署 label API 的实际配额；HK Bus 自托管 tile 域名是否允许第三方项目直接复用。这些都不应作为 CUHK 产品的隐含依赖。
