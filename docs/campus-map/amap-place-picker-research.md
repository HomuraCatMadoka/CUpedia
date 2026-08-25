# 高德 Campus Map 选点、地址与 POI 调研

调研日期：2026-08-25

范围：只研究 Campus Map 的“移动地图中心选点 → 显示地址/附近 POI → 填写地点表单”链路。资料只来自高德官方文档、官方示例和可直接阅读源码的 GitHub 仓库。本报告不建议新增第二套 edit session、地图 owner、历史、镜头或发布实现。

## 结论先行

高德已经提供当前原型缺少的真实位置语境：

- `AMap.Geocoder.getAddress()` 可以把地图中心转换为结构化地址；`extensions: "all"` 还会返回附近 POI、道路和路口。
- `AMap.PlaceSearch.searchNearBy()` 可以围绕中心点取候选 POI；`AMap.AutoComplete` 可以做关键词输入提示。
- AMapUI `PositionPicker` 已经验证了“拖地图、中心 pin、停止后返回地址/最近 POI”的交互模型。

但推荐**只借这些能力和交互模式，不引入 AMapUI PositionPicker 或第三方完整选点组件**。现有 `AmapCampusPrototype` 已经是唯一地图实例 owner，Issue #645 仍应唯一拥有 history、camera、focus 和 sheet；Issue #718 仍应唯一执行 publish。新增能力应是一层很薄的 provider query adapter，由现有 owner 在 `moveend` 后调用，再把结构化结果交给现有 React Sheet 显示。

第一版最小实现建议：

1. 在现有 AMap 加载列表中加入 `AMap.Geocoder`，只在选点状态下响应地图移动。
2. `movestart` 时把 pin 抬起、位置文案变成“正在确定位置…”；`moveend` 时对最新中心调用一次 `getAddress()`。
3. 只用 `Geocoder({ radius: 100~200, extensions: "all" })` 返回的 `formattedAddress`、`addressComponent` 和最近 POI；首版不调用 `PlaceSearch` 或 `AutoComplete`。
4. 高德结果只作为**辅助识别**：不能自动成为 CUpedia Place 身份、名称或可发布来源；确认位置仍只生成现有 transition 接受的 typed intent。
5. 每类异步请求使用独立递增 token；旧回调只丢弃，不允许覆盖新中心。发布/确认仍走现有 transition module 的单次 intent 与幂等契约。

### 原型验收修订

实际在短屏手机上验收后，定位与填写同时出现会让用户误以为必须向下滚动才能完成当前任务。首版因此
改为同一张 Sheet 内的两段式 presentation：`placing` 只显示中心 pin、高德参考、键盘坐标入口和
“使用此位置”；确认后才显示已经挂载的名称与 schema-driven 类型控件。这里没有新增页面、表单、
session 或地图 owner，只是把一个大任务拆成两个清楚的小步骤。

高德同时给出“香港中文大学”这类校园容器和具体建筑时，显示层只在距离可信时显示最近的具体 POI；
如果返回中根本没有该建筑，不能根据底图文字假装识别成功，仍保留候选坐标，并让用户在下一步手动
填写名称。

真实页面在邵逸夫堂一带校准时，高德 Geocoder 曾先后返回约百米外的“文物馆 Art Museum”和
64 米外的“润昌堂”，却没有返回底图上可见的邵逸夫堂。首版因此只信任带数值距离、距图钉不超过
30 米且最近的具体 POI；否则主文案显示“地图中心位置”，地址仍明确标作“高德参考”。这个阈值只
约束瞬时显示，不产生 provider mapping 或 canonical fact。

## 一、高德官方能力

### 1. 地图中心选点与拖拽选点

高德官方 AMapUI `PositionPicker` 支持两种模式：

- `dragMap`：pin 固定在地图中心，用户拖动地图；
- `dragMarker`：用户直接拖 Marker。

它在成功时返回 `position`、`address`、`nearestJunction`、`nearestRoad`、`nearestPOI` 和完整 `regeocode`，失败时触发 `fail`。这与 Campus Map 需要的反馈完全吻合。[PositionPicker 官方参考](https://lbs.amap.com/api/amap-ui/reference-amap-ui/other/positionpicker)

不过该页面最后更新时间为 2021 年，依赖额外的 AMapUI 1.1，并会在同一个 map 上自行拥有 pin、启动/停止和 geocode 生命周期。因此它适合当作**行为规格和返回结果参考**，不适合直接放进当前产品成为第二个交互 owner。

现有地图已经有 `dragstart`、`moveend` 和中心点，因此可以直接实现同样行为：

- `movestart` / `dragstart`：pin 抬起，清除旧地址的“已确定”视觉；
- `moveend`：读取 `map.getCenter()`，触发最新一次位置查询；
- 指针仍按下或地图仍有惯性时，不提交中心，也不让 pin 落下；
- 程序镜头和用户手势共用 #645 的现有仲裁，不另造事件循环。

### 2. `AMap.Geocoder` 逆地理编码

`AMap.Geocoder.getAddress(location, callback)` 接收一个或一组坐标并返回结构化地址。官方参数中：

- `radius` 范围为 0–3000 米，默认 1000；
- `extensions: "base"` 只返回基本地址；
- `extensions: "all"` 同时返回附近 POI、道路和路口；
- 成功条件应同时检查 `status === "complete"` 和 `result.info === "OK"`。

来源：[Geocoder 官方参考](https://lbs.amap.com/api/maps-javascript-api/reference/geocode/geocoder)、[官方教程](https://lbs.amap.com/api/javascript-api-v2/guide/services/geocoder)

对校园场景的建议：

- 使用 100–200 米半径，而不是默认 1000 米，避免把山另一侧或远处建筑当成“当前位置附近”。
- 主文案优先使用距图钉不超过 30 米且最近的具体 POI/建筑名；副文案显示地址。没有可靠 POI 时显示“地图中心位置”，不虚构“某建筑附近”。
- `regeocode.pois` 是高德候选，不是 CUpedia `placeId`。POI ID 只能进入 transient provider suggestion 或明确的 provider mapping，不能成为 canonical identity。
- Geocoder 失败不应清掉已选坐标或用户草稿；UI 保留 pin，并显示“暂时无法识别地址，仍可使用此位置”。

### 3. `AMap.PlaceSearch` 周边 POI

`AMap.PlaceSearch` 支持关键词搜索、`searchNearBy(keyword, center, radius)`、范围搜索和按 POI ID 查询详情。官方约束包括：

- `pageSize` 为 1–50；`pageIndex` 为 1–100；
- `citylimit` 可以强制限制城市；
- `type` 可以限制 POI 分类；
- `extensions: "all"` 返回详细信息；
- `searchNearBy` 半径最大 50,000 米。

来源：[PlaceSearch 官方参考](https://lbs.amap.com/api/maps-javascript-api/reference/search/placesearch)、[输入提示与 POI 搜索教程](https://lbs.amap.com/api/maps-javascript-api/guide/services/autocomplete)

Campus Map 不需要默认拉大列表。推荐：

- Geocoder 的 POI 足以形成一行“高德识别：科学馆”；只有用户点“选择附近地点”时，才请求 `searchNearBy()` 并展示 5–10 个候选。
- 周边搜索以地图中心为距离基准，半径先用 100–200 米；候选按实际距离升序。
- 选择候选只更新“识别标签”和地图中心；不要自动把候选名写进 draft 的名称字段。
- 不把高德默认 `map` / `panel` UI 交给产品使用。结果应返回数据后由 React 渲染，这样键盘、读屏、Sheet 和 focus 仍由 #645 的 owner 控制。

### 4. `AMap.AutoComplete` 搜索定位

JS API 2.0 的类名是 `AMap.AutoComplete`，不是旧版 `AMap.Autocomplete`。它既能绑定 input 生成高德默认提示，也能通过 `search(keyword, callback)` 返回数据供应用自行渲染。[AutoComplete 官方教程](https://lbs.amap.com/api/maps-javascript-api/guide/services/autocomplete)

推荐使用后者：

- React 自己拥有输入框、结果 listbox、键盘上下选择、Escape 和读屏文案；
- 中文输入法 composition 期间不请求；结束后 250–350ms debounce；
- 搜索 token 与中心逆地理 token 分开，清空关键词立即作废旧搜索；
- 只有用户明确点击/键盘确认某个候选，才移动地图并产生一次 typed intent。

### 5. 坐标系边界

高德地图坐标是 GCJ-02；CUpedia 契约要求 canonical outdoor point 保存 WGS84。高德官方提供 `AMap.convertFrom(source, "gps", callback)` 将 WGS84/GPS 转为高德坐标，但官方没有提供 GCJ-02 → WGS84 的逆转换。[高德坐标系与 `convertFrom`](https://lbs.amap.com/api/javascript-api-v2/guide/transform/convertfrom)

当前实现启动时用官方 `convertFrom()` 得到 WGS84 → GCJ-02 投影，但在地图移动结束后，用“校园中心的一次偏移量”把 GCJ-02 中心近似还原为 WGS84：

- [`amap-campus-prototype.tsx:938`](../../src/components/campus-map/amap-campus-prototype.tsx#L938) 批量执行官方正向转换；
- [`amap-campus-prototype.tsx:1016`](../../src/components/campus-map/amap-campus-prototype.tsx#L1016) 用单一 offset 做近似逆变换。

这个近似在一个很小的校园范围内可能足够用于“约略位置”，但不能未经验证就声明 `precision: precise`。验收前应至少用校园边界和内部网格点测量最大误差，并写清允许范围。如果无法证明误差满足产品的 precise 门槛，应把新建点保存为 `approximate`；高德 GCJ-02 坐标只留在 adapter/transient result，不能覆盖 canonical WGS84。

### 6. 加载、密钥和生产安全

高德官方推荐 JS API Loader；它会避免重复下载、混用版本和不完整异步加载。官方明确禁止把 JS API 资源下载到本地或混入应用 bundle。新申请的 JS API key 需要配合 security key。[JS API 加载官方指南](https://lbs.amap.com/api/javascript-api-v2/guide/abc/load)

生产环境的重要问题：高德官方明确说 `securityJsCode` 明文放在浏览器端不安全，强烈建议用 `window._AMapSecurityConfig.serviceHost` 走服务端代理。[安全密钥官方指南](https://lbs.amap.com/api/javascript-api-v2/guide/abc/jscode)

当前 [`config/route.ts:16`](../../src/app/api/campus-map/config/route.ts#L16) 把 key 和 `securityCode` 一起返回给浏览器，[`amap-campus-prototype.tsx:846`](../../src/components/campus-map/amap-campus-prototype.tsx#L846) 再把它写进 `window._AMapSecurityConfig`。这可以作为本地 prototype 配置，但**不能作为生产方案**。正式接入前应：

1. 浏览器只拿 Web JS API key；
2. 服务调用通过同域 `/_AMapService` 代理；
3. security key 只保存在服务端环境变量；
4. 高德控制台绑定允许域名，并为预览、生产分别使用受限 key；
5. 日志和错误回执永远不输出 key/security key。

### 7. 配额和调用策略

高德公开参考配额显示，个人开发者的输入提示、关键词搜索、周边搜索分别只有 100 次/日；逆地理编码与坐标转换分别为 5,000 次/日。企业与商用配额更高，实际 QPS 需在控制台查看。[JS API 流量限制](https://lbs.amap.com/api/javascript-api-v2/flowlevel)

所以不能在 `mapmove` 或每个按键上调用服务：

- 只在真正 `moveend` 且用户手势结束后逆地理一次；
- 连续 moveend 用 150–250ms trailing debounce 合并；
- 以适度取整后的中心点作为短期缓存 key，返回同一区域时复用；
- AutoComplete 只在 composition 完成且关键词达到合理长度后调用；
- 周边 POI 是用户展开后的按需能力，不是每次拖图的必调接口；
- `error` 中区分鉴权/域名/限额/暂时性网络问题，UI 统一降级，不让应用无限自动重试。

## 二、失败、竞态与幂等契约

高德服务是 callback API。浏览器无法可靠取消已经发出的 SDK 请求，因此“取消”应理解为**结果过期后忽略**。

建议 provider query adapter 暴露类似以下边界（接口名称仅示意）：

```ts
type AmapPlaceContext = {
  providerPosition: { crs: "GCJ-02"; longitude: number; latitude: number };
  formattedAddress?: string;
  nearestPoi?: { providerPoiId: string; name: string; distanceMeters?: number };
};

resolveCenterContext(center, requestToken): Promise<
  | { status: "resolved"; token: number; context: AmapPlaceContext }
  | { status: "empty" | "rate-limited" | "transient-error"; token: number }
>;
```

产品 owner 的规则：

1. 每次中心提交增加 `centerRequestToken`；回调 token 不是最新值就直接丢弃。
2. reverse geocode、周边搜索、关键词搜索分别有 token，互不覆盖 loading/error。
3. 保存最新 reverse promise/cache；用户快速点击“继续”时可以等待同一个 promise，不再重复请求。
4. 自动重试只用于明确 transient error，最多一次并加短退避；鉴权、域名、配额和 `no_data` 不重试。
5. 用户确认 POI 时只发一个 typed edit intent；双击/超时重回调由现有 transition/publish 幂等处理，不让 provider 直接改 draft 或 publish。
6. 关闭、Back、Escape 或切换另一个地点时增加 token 并丢弃所有旧结果；不需要、也不应让 provider 触碰 history/sheet/focus。

JS API callback 首先按 `complete | no_data | error` 分支。若底层返回可识别的 Web Service `infocode`，再细分处理：日配额耗尽不可自动重试；QPS 限流应冷却并让用户重试；`SERVER_IS_BUSY` 或明确网络错误才适合一次有限退避。高德的 [JS API 错误说明](https://lbs.amap.com/api/javascript-api-v2/guide/abc/errorcode) 与 [Web Service `infocode` 表](https://lbs.amap.com/api/webservice/guide/tools/info/) 是两层接口，不能假设每个 Web Service 数字码都会原样暴露在 JS callback。

## 三、可借鉴的开源仓库

### A. `joye61/clxx`：最贴近本需求，可借模式，不整体引入

仓库：[joye61/clxx](https://github.com/joye61/clxx)，MIT，React/TypeScript；固定审阅 commit [`fd5ad485`](https://github.com/joye61/clxx/tree/fd5ad4854562b315e7f8ad680a2af39d481fc60d)。它的 `MapLocationSelection` 是本次找到最接近“中心 pin + 地址 + 周边 POI + 搜索列表 + 确认表单”的开源实现。

值得直接借鉴的实现模式：

- [中心提交的 generation token、reverse promise/cache 与 stale callback 丢弃](https://github.com/joye61/clxx/blob/fd5ad4854562b315e7f8ad680a2af39d481fc60d/src/MapLocationSelection/index.tsx#L385-L465)。
- [pin 在 movestart 抬起、moveend/指针释放后落下，惯性运动期间不提交](https://github.com/joye61/clxx/blob/fd5ad4854562b315e7f8ad680a2af39d481fc60d/src/MapLocationSelection/index.tsx#L545-L625)。
- [中文输入法 composition、250ms debounce 和关键词 stale token](https://github.com/joye61/clxx/blob/fd5ad4854562b315e7f8ad680a2af39d481fc60d/src/MapLocationSelection/index.tsx#L702-L758)。
- [确认互斥锁、在飞 reverse promise 复用](https://github.com/joye61/clxx/blob/fd5ad4854562b315e7f8ad680a2af39d481fc60d/src/MapLocationSelection/index.tsx#L297-L307)。
- [Geocoder/PlaceSearch service 实例集中创建并显式 `extensions: "all"`](https://github.com/joye61/clxx/blob/fd5ad4854562b315e7f8ad680a2af39d481fc60d/src/MapLocationSelection/provider.amap.ts#L204-L245)。
- [`searchNearBy` 半径 clamp、回调序列和错误降级](https://github.com/joye61/clxx/blob/fd5ad4854562b315e7f8ad680a2af39d481fc60d/src/MapLocationSelection/provider.amap.ts#L411-L475)。
- [逆地理结果与 POI 候选分离](https://github.com/joye61/clxx/blob/fd5ad4854562b315e7f8ad680a2af39d481fc60d/src/MapLocationSelection/provider.amap.ts#L633-L675)。

不建议复制或直接依赖的部分：

- 它是完整的 provider + UI + selection owner；整体引入会与 #645/#646 形成第二套 session/kernel。
- 为关键词同时发 nearby 和全国搜索会翻倍消耗稀缺的搜索配额，不适合默认照搬。
- 它依赖未写入官方公共类型的 `location_type` 来猜测 IP 定位，并以 5km accuracy 作启发式判断；不能当成产品契约。
- loader 对 `HTMLCanvasElement.prototype.getContext` 做全局补丁，侵入范围过大；当前产品不需要。
- 它支持前端明文 `securityJsCode`，生产仍应改成官方 `serviceHost` 代理。
- 它的业务目标是打车上车点，默认把周边 POI 当候选；Campus Map 的 Place 是社区事实，必须保留 provider suggestion 与 canonical fact 的边界。

### B. 高德官方 `web-route-base-on-geolocation-and-placesearch`：交互语义好，代码陈旧

仓库：[amap-demo/web-route-base-on-geolocation-and-placesearch](https://github.com/amap-demo/web-route-base-on-geolocation-and-placesearch)，固定审阅 commit [`9e5edcac`](https://github.com/amap-demo/web-route-base-on-geolocation-and-placesearch/tree/9e5edcac8bb7bddc2763fc945764e1b2e83428a7)。

值得借鉴：

- [拖图时隐藏 Marker、显示中心控件；moveend 后把 Marker 放到中心并逆地理](https://github.com/amap-demo/web-route-base-on-geolocation-and-placesearch/blob/9e5edcac8bb7bddc2763fc945764e1b2e83428a7/js/locate.js#L85-L124)。
- [Autocomplete 选词后进入 PlaceSearch；POI 选择优先使用入口坐标 `entr_location`](https://github.com/amap-demo/web-route-base-on-geolocation-and-placesearch/blob/9e5edcac8bb7bddc2763fc945764e1b2e83428a7/js/search.js#L15-L49)。
- [已有位置进入搜索时先显示其周边结果](https://github.com/amap-demo/web-route-base-on-geolocation-and-placesearch/blob/9e5edcac8bb7bddc2763fc945764e1b2e83428a7/js/search.js#L62-L81)。

不能复制：它加载 JS API 1.3、使用已废弃的 `AMap.event.addListener` 风格、没有 React 生命周期、没有 stale callback 防护，而且把 key 写死在 HTML。只能用作官方交互意图的证据。

### C. `uiwjs/react-amap`：生命周期边界可借，不是现成选点器

仓库：[uiwjs/react-amap](https://github.com/uiwjs/react-amap)，MIT；固定审阅 commit [`04d30d8e`](https://github.com/uiwjs/react-amap/tree/04d30d8e13c1fafe5916f12762aa903392634167)。

可借模式：

- [`APILoader` 等 SDK promise resolve 后才渲染子树，并呈现 error](https://github.com/uiwjs/react-amap/blob/04d30d8e13c1fafe5916f12762aa903392634167/packages/api-loader/src/index.tsx#L46-L73)。
- [`useMap` 只创建一个原生 Map，cleanup 时清理并 `destroy()`](https://github.com/uiwjs/react-amap/blob/04d30d8e13c1fafe5916f12762aa903392634167/packages/map/src/useMap.tsx#L29-L50)。
- [`useMarker` 卸载时 `setMap(null)`](https://github.com/uiwjs/react-amap/blob/04d30d8e13c1fafe5916f12762aa903392634167/packages/marker/src/useMarker.tsx#L13-L30)。

不建议为了本功能引入整套封装：当前产品已经直接拥有 Map、cluster、InfoWindow、camera 和事件仲裁；换组件库会扩大改动面。该仓库本身也没有成品“选点 + 地址/POI 表单”，其 loader 没解决本产品的生产 security proxy。

### D. `baidu/amis`：成熟 React 表单的数据流参考

`amis` 的 `GaodeMapPicker` 把高德选点作为表单控件处理，Apache-2.0；固定审阅 commit [`43a33ee0`](https://github.com/baidu/amis/tree/43a33ee066990589f5891674e645c4c927761fe5)。

- [250ms 搜索 debounce、Geocoder `extensions: "all"` 和 PlaceSearch selection](https://github.com/baidu/amis/blob/43a33ee066990589f5891674e645c4c927761fe5/packages/amis-ui/src/components/GaodeMapPicker.tsx#L60-L133)。
- [地图 click → marker → 统一 `syncLocation` → `getAddress` → `onChange`](https://github.com/baidu/amis/blob/43a33ee066990589f5891674e645c4c927761fe5/packages/amis-ui/src/components/GaodeMapPicker.tsx#L135-L195)。

可以借“所有入口汇入一个 location sync 函数”的表单边界；不能照搬其实现，因为它没有当前任务要求的迟到 callback 防护，也没有生产 `serviceHost` 安全代理。

### E. NocoBase：loader、错误态和销毁参考，禁止复制源码

NocoBase 是大型 React/TypeScript 项目，但相关文件使用 AGPL-3.0 或商业双许可；这里只记录可观察的设计思路，不复制代码。

- [PlaceSearch 300ms debounce，区分 `complete/no_data/error`，POI 统一进入 `toCenter`](https://github.com/nocobase/nocobase/blob/2ff358d4987877ca921e7a05f8f810ca66d796a9/packages/plugins/%40nocobase/plugin-map/src/client/components/AMap/Search.tsx#L27-L76)。
- [AMapLoader 2.0、加载错误 UI 和 cleanup `map.destroy()`](https://github.com/nocobase/nocobase/blob/2ff358d4987877ca921e7a05f8f810ca66d796a9/packages/plugins/%40nocobase/plugin-map/src/client/components/AMap/Map.tsx#L330-L405)。

它证明了“搜索只是地图 owner 的一个输入，选择结果统一回到 `toCenter`”在成熟 React 产品中可行；许可和架构都不适合直接依赖。

## 四、对当前 UI 的具体建议

早期原型曾从本地 3 栋建筑计算距离并拼接“附近”，容易被误解为高德识别。当前实现已删除这条
假识别，改用 `AMap.Geocoder` 的瞬时参考；没有结果时只说明候选位置仍可使用。

推荐的同一张 Sheet 流程：

```text
选择地点位置                                  ×

📍 正在确定位置…
   （地图仍可拖动）

输入坐标

[                使用此位置                ]
```

确认位置后，同一张 Sheet 显示已挂载的表单：

```text
添加地点                                      ×

📍 邵逸夫堂
   高德参考 · Central Avenue 附近              重新定位

[ 地点名称________________________________ ]
[饮水点] [洗手间] [打印服务] [公共空间] [课室]
```

交互规则：

- `placing` 的主按钮统一为“使用此位置”；名称和类别保持挂载但隐藏且不可交互，确认后再显示。
- 地址识别完成不自动展开 Sheet、不写 history、不抢 focus。
- “重新定位”回到同一 Sheet 的 `placing` presentation；同一 Sheet 不换 owner。
- 识别失败保留坐标：“暂时无法识别地址，仍可使用此位置”。
- 读屏用单独的 polite live region 宣告“正在确定位置 / 已识别为… / 无法识别”，不要让整个卡片反复重读。
- 键盘用户用现有可聚焦地图/方向键移动中心；停止后走与手势完全相同的 token 和 resolve 路径。

## 五、实施优先级与验收

### P0

1. 用真实 Geocoder 结果替换本地三建筑“附近”冒充地图识别的文案。
2. 保持单一地图/session owner；provider 回调只能生成 typed result/intent。
3. 加入 center request token、旧回调丢弃、关闭后失效和失败降级。
4. 明确 GCJ-02 → WGS84 近似的最大误差；未证明 precise 就发布为 approximate。

### P1

1. pin 抬起/落下和“正在确定位置”反馈。
2. reverse cache/pending promise 复用，避免快速继续或双击造成重复调用。
3. 监控 `complete | no_data | error`、鉴权、域名、限额和 transient failure，但不记录凭据。

### 明确延后

- `PlaceSearch` 附近候选、`AutoComplete` 搜索、结果 listbox 与 IME-aware debounce；先验收
  Geocoder-only 选点，再为搜索的额度、焦点和程序镜头行为单独定范围。
- 生产 `serviceHost` 安全代理与部署配置；上线前必须完成，但不在 #646 内扩张 provider 或 publish
  架构。

### 真实高德验收

#### CUHK 九点坐标校准（2026-08-25）

在真实高德 JavaScript API 中，以校园中心和覆盖校园范围的四角、四边中点共 9 个
WGS84 点调用 `AMap.convertFrom(..., "gps")`。运行时采用中心点测得的固定
GCJ-02 偏移 `[+0.004877, -0.002832]` 做近似逆转换，再以 Haversine 距离计算还原点
相对原始 WGS84 点的水平误差。传给高德的每个坐标 tuple 都使用副本，因为真实 API
会改写输入数组。

| 校准点 | WGS84 经度 | WGS84 纬度 | 水平误差 |
| ------ | ---------: | ---------: | -------: |
| 西南   | 114.196500 |  22.410000 |  3.177 m |
| 南中   | 114.207200 |  22.410000 |  0.151 m |
| 东南   | 114.217900 |  22.410000 |  2.771 m |
| 西中   | 114.196500 |  22.419100 |  3.190 m |
| 中心   | 114.207200 |  22.419100 |  0.000 m |
| 东中   | 114.217900 |  22.419100 |  2.684 m |
| 西北   | 114.196500 |  22.428200 |  3.125 m |
| 北中   | 114.207200 |  22.428200 |  0.000 m |
| 东北   | 114.217900 |  22.428200 |  2.661 m |

最大误差为 **3.190 m**，平均误差为 **1.973 m**。这只证明固定偏移在当前校园范围内
适合 MVP 的 `approximate` point；不能据此发布为 `precise`。

- 390px、720px、desktop：慢拖、快速连续拖、拖动后立即关闭、拖动后立即继续。
- 键盘平移、坐标输入/确认和读屏 live announcement。
- 模拟 B 请求先于 A 返回，最终只能显示 B；关闭后任何 A/B 回调都不得复活 UI。
- Geocoder `no_data`、网络失败、限额、错误 key、错误 domain、安全代理失败。
- 校园至少 9 个 WGS84 校验点（中心、四角、四边中点），记录近似逆转换的最大水平误差。
- 发布前确认高德 POI 名称/ID没有自动进入 canonical `placeId`、source 或稳定身份。

## 来源清单

- [高德 PositionPicker](https://lbs.amap.com/api/amap-ui/reference-amap-ui/other/positionpicker)
- [高德 Geocoder 参考](https://lbs.amap.com/api/maps-javascript-api/reference/geocode/geocoder)
- [高德 Geocoder 教程](https://lbs.amap.com/api/javascript-api-v2/guide/services/geocoder)
- [高德 AutoComplete / PlaceSearch 教程](https://lbs.amap.com/api/maps-javascript-api/guide/services/autocomplete)
- [高德 PlaceSearch 参考](https://lbs.amap.com/api/maps-javascript-api/reference/search/placesearch)
- [高德 JS API 加载](https://lbs.amap.com/api/javascript-api-v2/guide/abc/load)
- [高德安全密钥](https://lbs.amap.com/api/javascript-api-v2/guide/abc/jscode)
- [高德坐标转换](https://lbs.amap.com/api/javascript-api-v2/guide/transform/convertfrom)
- [高德流量限制](https://lbs.amap.com/api/javascript-api-v2/flowlevel)
- [高德 JS API 错误说明](https://lbs.amap.com/api/javascript-api-v2/guide/abc/errorcode)
- [高德 Web Service `infocode`](https://lbs.amap.com/api/webservice/guide/tools/info/)
- [`joye61/clxx` 固定审阅版本](https://github.com/joye61/clxx/tree/fd5ad4854562b315e7f8ad680a2af39d481fc60d)
- [高德官方移动端定位/地点搜索示例固定版本](https://github.com/amap-demo/web-route-base-on-geolocation-and-placesearch/tree/9e5edcac8bb7bddc2763fc945764e1b2e83428a7)
- [`uiwjs/react-amap` 固定审阅版本](https://github.com/uiwjs/react-amap/tree/04d30d8e13c1fafe5916f12762aa903392634167)
- [`baidu/amis` GaodeMapPicker 固定版本](https://github.com/baidu/amis/blob/43a33ee066990589f5891674e645c4c927761fe5/packages/amis-ui/src/components/GaodeMapPicker.tsx)
- [NocoBase AMap 固定版本](https://github.com/nocobase/nocobase/tree/2ff358d4987877ca921e7a05f8f810ca66d796a9/packages/plugins/%40nocobase/plugin-map/src/client/components/AMap)
