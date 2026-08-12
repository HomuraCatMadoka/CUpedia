# CUHK 官方逐站到达数据审计

> 审计日期：2026-08-10（Asia/Hong_Kong）
>
> 研究窗口：重点检查 2024-08-10 至 2026-08-10 可公开观察的数据
>
> 范围：先审计 CUHK 交通处，再检查其他 `cuhk.edu.hk` 第一方网站；只访问无需登录的公开响应

## 结论

截至审计日，没有在 CUHK 官方公开页面或接口中找到可以直接回答以下问题的数据：

> 某一班车在起点 06:00 开出后，预计或实际于 06:02 到善衡书院、06:04 到邵逸夫堂。

交通处公开了起点服务时段、每小时开出分钟、停站名称/示意顺序和路线级服务状态，但没有逐站计划到达时间、站间运行时长、车辆位置、实际到站记录或 ETA。换言之，官网可以提供“班从哪里、几点开、经过哪里”，不能提供“开出后每站几点到”。

这次审计同时发现一个重要的第一方候选源：CUHK Campus Map 仍在公开加载一份静态 JavaScript 数据文件，其中有 51 个校巴/收费穿梭小巴站点、19 个旧制路线模式和 46 个带编码路径的有向路段。它适合帮助建立站点坐标和路线几何候选，但页面明确说明资料非实时，文件中的路线目录也不是交通处当前的路线编号体系，因此不能当作当前班次或到站真值。

| 所需数据层              | CUHK 官方公开结果                                      | 第一版用途                               |
| ----------------------- | ------------------------------------------------------ | ---------------------------------------- |
| 起点发车时间            | 有：服务时段 + 每小时开出分钟                          | 可生成当天计划班次                       |
| 停站名称与大致顺序      | 有：交通处路线图；Campus Map 另有旧制路线段            | 可人工核对成当前 `RoutePattern`          |
| 站点坐标                | 有候选：Campus Map 静态数据含 `lat_lng`                | 可作为待现场/地图复核的 GPS 候选         |
| 路线几何                | 有候选：Campus Map 有 Google encoded polyline 风格字段 | 可用于画线和估算距离，不能证明运行时间   |
| 逐站计划到达时间        | 未找到                                                 | 必须由模型产生，并标成“预计”             |
| 站间运行时长            | 未找到结构化数据；个别书院网页只有整段约 10–15 分钟    | 只能作为弱先验，不能直接拆成每站 offset  |
| 实时车辆位置 / 实际到站 | 未找到                                                 | 需要用户反馈或以后取得 AVL/GPS 数据      |
| 实时 ETA / GTFS-RT      | 未找到公开端点或引用                                   | 第一版不能称为实时 ETA                   |
| 路线级运行状态          | 有：正常、受阻、暂停、非服务时间                       | 可显示提示；缺少状态时间戳与原因         |
| 临时事件                | 有：交通处通告                                         | 可标异常日或临时停站；通常没有延误分钟数 |

## 1. 交通处 28 个当前路线页面

### 1.1 覆盖范围

系统检查了 14 个路线 slug 的英文和繁体中文页面，共 28 个 HTML 响应：

```text
1a, 1b, 2, 3, 4, 5, 6a, 6b, 7, 8, n, h, up, down
https://transport.cuhk.edu.hk/route/{slug}/
https://transport.cuhk.edu.hk/tc/route/{slug}/
```

它们覆盖当前交通处网站上的：

- 日间穿梭校巴：1A、1B、2、3、4、8；
- 转堂校巴：5、6A、6B、7；
- 夜间/假日校巴：N、H；
- 收费穿梭小巴：上行、下行。

页面对应 WordPress route post ID 为：

```text
1a=2554, 1b=2567, 2=2865, 3=2869, 4=2878, 5=2766,
6a=2768, 6b=2890, 7=2893, 8=2880, n=2883, h=2885,
up=3539, down=3565
```

### 1.2 页面实际公开的字段

以 [1A Main Campus](https://transport.cuhk.edu.hk/route/1a/) 为例，HTML 在审计时包含：

```html
<div class="rb-2-1">
  Service Hours<br /><span class="rb-large">07:40-18:50</span>
  For Mon to Sat (Except Public Holidays)
</div>
<div class="rb-2-2">
  Departure Time (mins)
  <span class="rb-large">Every 10, 20, 40, 50</span>
</div>

<span class="route-stop-text">Univ. Sports Centre</span>
<span class="route-stop-text">Sir Run Run Shaw Hall</span>
<span class="route-stop-text">Univ. Admin. Bldg.</span>
<span class="route-stop-text">S.H. Ho College</span>
```

这足以生成起点的计划发车时间，并辅助识别停站。页面没有把路线画成有时间含义的数据数组；路线图由 `div`、边框和 CSS 排版形成，页面中的 SVG 只用于末站斜线等视觉元素，不是地理线路。

对 28 个页面逐一搜索以下概念，均未发现对应的公交数据字段：

```text
ETA, estimated arrival, arrival time, travel time, journey time,
duration, latitude, longitude, polyline, geometry,
vehicle position, live vehicle, real-time
```

页面唯一普遍出现的 `data-*` 属性是字号界面的 `data-size`。未发现 stop ID、route pattern ID、坐标、车辆、观测时间或逐站 offset 隐藏在 `data-*` 中。

### 1.3 路线级状态不是 ETA

路线页公开四种服务状态 CSS class：

```text
hr-status-normal      Normal Service
hr-status-delayed     Service Delay
hr-status-suspended   Service Suspension
hr-status-no          Non-Service Hours
```

例如审计响应中 1A、1B、2、3、4、8 为 `hr-status-normal`，N、H 当时为 `hr-status-no`。这些 class 是服务器直接渲染进 HTML 的；页面脚本没有轮询刷新。

这个状态可以用作路线级提示，但源站没有同时公开：

- 状态生效/观测时间；
- 数据来源和最后更新时间；
- 受影响车辆、班次或车站；
- 延误分钟数、原因或预计结束时间。

HTTP `Date` 只能说明抓取响应的时间，不能当作状态事件时间。状态也可能由当前服务时段推导或由后台人工设置，公开代码不足以区分二者。

## 2. WordPress REST、schema 与嵌入接口

### 2.1 Route REST 响应没有路线业务字段

请求：

```http
GET https://transport.cuhk.edu.hk/wp-json/wp/v2/route/2554
```

精简后的实际公开响应：

```json
{
  "id": 2554,
  "date": "2021-03-25T17:29:53",
  "modified": "2026-01-08T18:46:37",
  "slug": "1a",
  "status": "publish",
  "type": "route",
  "link": "https://transport.cuhk.edu.hk/route/1a/",
  "title": { "rendered": "1A Main Campus" },
  "content": { "rendered": "", "protected": false },
  "acf": []
}
```

公开字段只有 WordPress post 元数据。`modified` 是页面记录修改时间，不是时刻表生效日，更不是车辆观测时间。

对同一 URL 发出 `OPTIONS`，公开 schema 中 `acf` 为：

```json
{
  "description": "ACF field data",
  "type": "object",
  "properties": []
}
```

没有公开 schedule、stops、arrival、duration、coordinate 或 status 字段。`context=embed` 和 `_embed=1` 也只增加标题、链接或 `route_category` taxonomy；oEmbed 仅返回通用嵌入 HTML。

### 2.2 Stop REST 同样只有空壳

请求 [stop 2552](https://transport.cuhk.edu.hk/wp-json/wp/v2/stop/2552?_embed=1) 返回 title 和普通 post 元数据，但 `content.rendered` 为空、`acf` 为空、`meta` 无公开业务字段。它没有经纬度、所属路线、方向或时间。

繁体中文 REST 使用同一组 post ID，只改变本地化标题，没有增加公交字段。

### 2.3 REST 根目录没有实时交通 namespace

检查 [REST index](https://transport.cuhk.edu.hk/wp-json/) 的公开路由后，与公交有关的候选只有标准 WordPress 资源：

```text
/wp/v2/route
/wp/v2/route/{id}
/wp/v2/stop
/wp/v2/stop/{id}
/wp/v2/newsdetails
/wp/v2/statuses
```

`/wp/v2/statuses` 是 WordPress post 的发布状态，不是校巴运行状态。未发现 transport、vehicle、trip、arrival、ETA 或 live 数据 namespace。

`context=edit`、route revisions 和 stop revisions 均要求认证并返回 401；因此不能判断后台是否另存了私有字段，但它们不属于无需登录即可使用的公开数据。

## 3. 脚本、静态资源、AJAX 与站点地图

### 3.1 页面脚本不取实时数据

28 个路线页面加载相同的站点自有脚本：

- [`custom.js`](https://transport.cuhk.edu.hk/wp-content/themes/customtheme/js/custom.js?ver=6.9.6)：导航、字号、accordion 等界面交互；
- [`custom-route.js`](https://transport.cuhk.edu.hk/wp-content/themes/customtheme/js/custom-route.js?ver=6.9.6)：点击路线备注后打开 accordion。

在两份脚本中未发现 `fetch`、XHR、WebSocket、EventSource、轮询或公交 API URL。`custom-route.js` 的业务仅为：

```js
$(".rb-3 .route-rect").click(function () {
  $("#remarks .accordion-topic").addClass("active");
  $("#remarks .accordion-details").show();
});
```

路线页引用的唯一静态 JSON 是 favicon `manifest.json`。主题 CSS 仅定义四种路线状态的颜色，没有状态值、时间或数据端点。

### 3.2 AJAX

[`robots.txt`](https://transport.cuhk.edu.hk/robots.txt) 允许 `/wp-admin/admin-ajax.php` 被抓取，但路线 HTML 和脚本没有引用 action、nonce 或轮询请求。匿名直接 GET 该 URL 在审计时返回 403。允许抓取的路径本身不能证明存在公开公交 action。

### 3.3 Sitemap

[`wp-sitemap.xml`](https://transport.cuhk.edu.hk/wp-sitemap.xml) 仅列出 page、stop、route、newsdetails、car service 和 route category 等内容 sitemap。route sitemap 恰好包含上述 14 个路线 URL，没有列出 GTFS、GTFS-RT、GeoJSON、JSON feed 或实时 API。

路线 sitemap 的 `lastmod` 范围为 2025-11-17 至 2026-07-26。这个字段只表示网页最后修改时间，不能作为班次或线路的有效期。

没有在 HTML 引用、REST index、脚本资源或 sitemap 中发现 GTFS/GTFS-RT/AVL/GeoJSON，并不等同于证明 CUHK 内部没有这些系统；结论只限于公开发现面。

## 4. 官方 PDF 与近两年通告

### 4.1 时刻表 PDF

检查了交通处直接提供的四份文件：

- [`Shuttle.pdf`](https://transport.cuhk.edu.hk/wp-content/uploads/documents/Shuttle.pdf)：1A、1B、2、3、4、8；
- [`NH.pdf`](https://transport.cuhk.edu.hk/wp-content/uploads/documents/NH.pdf)：N、H；
- [`Meet-class.pdf`](https://transport.cuhk.edu.hk/wp-content/uploads/documents/Meet-class.pdf)：5、6A、6B、7；
- [`PSLB_2025.pdf`](https://transport.cuhk.edu.hk/wp-content/uploads/documents/PSLB_2025.pdf)：收费穿梭小巴。

前三份文本和图示公开服务时段、每小时发车分钟、停站及条件停站说明。`PSLB_2025.pdf` 是扫描/图片型内容，视觉检查同样只有起点班次/频率和停站图。四份文件均未给每一班的逐站到达时刻、站间时长、车辆位置或实际到站历史。

它们适合做“起点班次 + 当前停站顺序”的权威输入，不适合制造看似官方的逐站时间。

### 4.2 2024-08-10 至 2026-08-10 通告

交通处 [`newsdetails` REST collection](https://transport.cuhk.edu.hk/wp-json/wp/v2/newsdetails?per_page=100) 在审计日共有 118 条记录；其中 64 条落在两年窗口内，日期范围为 2024-08-23 至 2026-08-07。

两年内英文标题含 `Delay` 的只有两条：

1. 2025-11-19，[Shuttle Bus Service Delay – USFHK Cross Country Race (Completed)](https://transport.cuhk.edu.hk/newsdetails/shuttle-bus-service-delay-usfhk-cross-country-race-2/)；
2. 2025-06-13，`Notice of Delay for Adjustment of Paid Shuttle Light Bus Service`，内容是收费服务调整本身延期，不是车辆运行延误样本。

第一条只说明比赛当天早上校巴会受延误，没有路线、班次、车站、预计/实际延误分钟或观测记录。另有临时停站、改道、施工和暂停通告，可以帮助标记异常日和无效站点反馈，但同样通常不给可用于拟合的数值延误。

## 5. CUHK Campus Map 的静态站点与路线数据

### 5.1 公开资产

[CUHK Campus Map](https://www.cuhk.edu.hk/english/campus/cuhk-campus-map.html?area=shuttle+bus) 页面公开加载：

```text
https://www.cuhk.edu.hk/english/js/campus/cuhk_location_db.js?20161006
```

响应是约 397 KB 的 JavaScript：

```js
var CUHK_MAP_DATA = { ... };
```

在 2026-08-10 的 HTTP 响应中，该资产为 200，`Last-Modified` 是 2026-07-06。不过 URL 的版本参数仍为 `20161006`，而 `Last-Modified` 可能只是静态文件重新部署时间，不能证明每条校巴数据在 2026 年都经过业务核对。

### 5.2 可用字段和数量

精确按数组边界计数：

| 数组                    |     数量 | 公开字段                                                                          | 含义                                                 |
| ----------------------- | -------: | --------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `shuttle_bus_stops`     |       51 | `bus_stop_id`, 中英文名, `lat_lng`, `bus_stop_type_id`, `active`                  | 28 个 Shuttle Bus Stop；23 个 Shuttle Light Bus Stop |
| `shuttle_bus_route`     |       19 | `route_id`, 中英文名, color, service type/time band                               | 旧制路线模式，没有当前 1A/1B 等 route code           |
| `shuttle_bus_route_seg` | 多条映射 | `route_id`, `seg_id`, `order`                                                     | 将旧路线模式映射到有向路段                           |
| `shuttle_bus_seg`       |       46 | 起终站 ID、`encoded_start_pt`, `encoded_line`, `encoded_end_pt`, `encoded_levels` | 有向路线几何，采用旧 Google encoded polyline 风格    |

站点样本：

```json
{
  "bus_stop_id": "51",
  "bus_stop_name_en": "S.H. Ho College",
  "bus_stop_name_xb5": "善衡書院",
  "lat_lng": "(22.418023378635656, 114.20974999666214)",
  "bus_stop_type_id": "1",
  "active": "True"
}
```

Campus Map 的初始化脚本明确把 type `1` 显示为 `Shuttle Bus Stop`，把 type `2` 显示为 `Shuttle Light Bus Stop`。同名、不同方向的站点有独立 ID 和略有不同的坐标，例如 United College 和 University Residence Nos. 3 & 4，这对“GPS 附近默认车站”的方向判断有价值。

路段样本只描述道路形状：

```json
{
  "bus_route_seg_id": "45",
  "start_bus_stop_id": "10",
  "end_bus_stop_id": "51",
  "encoded_start_pt": "otygCyu`xT",
  "encoded_line": "...",
  "encoded_end_pt": "hAaD",
  "encoded_levels": "BBBBBBBBBBBBBB"
}
```

其中没有距离、速度、计划时长、实际时长或采样日期。路径可以解码后计算道路距离，但把距离换成时间仍然需要模型假设或反馈数据。

### 5.3 为什么只能作为候选

Campus Map 页面自己声明：

> Users should beware that this map may not be drawn to scale and the information herein is not updated on a real-time basis.

还存在三个结构性风险：

1. `shuttle_bus_route` 使用 19 个旧制模式和 “Before 9:00 / 9:00 to 18:00 / After 18:00” 粗时间带，不是交通处当前的 1A、1B、2、3、4、8、N、H 等路线目录；
2. 当前 map 初始化代码把生成这些旧路线选择器的区块注释掉，界面实际只开放站点开关，说明路线模式/几何至少不是当前主界面的公开真值；
3. 数据没有逐记录有效期、来源版本或修改时间，无法判断哪些坐标/路段最近经过复核。

因此建议：

- 导入 28 个 type `1` 校巴站和所需 type `2` 小巴站作为 `provisional` 候选；
- 用当前交通处路线页逐站匹配名称、方向和是否仍服务；
- 保留 `source_url`、原 `bus_stop_id`、抓取时间和原始名称；
- 坐标在 UI/GPS 默认填站上线前，用地图和少量现场反馈验证；
- 旧路线 pattern 不直接替代当前交通处路线定义；polyline 也不生成“官方到站时间”。

## 6. 其他 CUHK 官方域名

在其他 `cuhk.edu.hk` 第一方网站中，没有找到实时车辆或逐站时刻接口，但找到少量整段行程时间说明：

| 第一方页面                                                                                          | 公开说明                                                                                         | 可用性                                       |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | -------------------------------------------- |
| [New Asia College – Access to New Asia](https://www.na.cuhk.edu.hk/access-to-new-asia/)             | University Station 到 New Asia：2 号线约 10–15 分钟；N/H 约 10 分钟；反向约 10–15 分钟           | 可作整段弱先验；无有效期、样本量和分时段数据 |
| [United College – Transportation and Map](https://www.uc.cuhk.edu.hk/about/transportation-and-map/) | UC 到 MTR 约 10 分钟；MTR 经 2 号线到 UC 约 10–15 分钟；3/4 号线含步行约 15 分钟；N/H 约 10 分钟 | 部分时间混入步行，不应直接当公交运行时长     |
| [CUHK Campus transportation](https://www.cuhk.edu.hk/english/campus/campus-transportation.html)     | 服务介绍并链接 Transport Office / Campus Map                                                     | 没有额外到站字段                             |
| [CUHK Campus Map PDF](https://www.cuhk.edu.hk/english/images/campus/campus-map.pdf)                 | 标出校巴站                                                                                       | 无机器可读方向/逐站时间                      |

搜索还会找到毕业礼、会议或迎新专车的近两年时间表和约 10 分钟行程说明。这些是临时活动专车，不是常规 1A–H 路线的观测，不能混入常规路线模型。

## 7. 对第一版 truth model 的具体含义

### 7.1 可以直接采纳的官方事实

```text
ServiceCalendar / 当天是否运行
OriginDeparture / 起点计划开出时间
RoutePattern / 当前路线方向与停站顺序（从交通处页面人工核对）
StopCandidate / Campus Map 的站点名称、方向候选、坐标
ServiceAlert / 路线级状态和临时通告
```

### 7.2 必须由产品明确标成预测的字段

```text
scheduled_or_predicted_arrival_at_stop
segment_travel_time
delay_by_time_band
crowding_or_term_week_effect
confidence / credible interval
```

第一版可以从官方起点发车时间开始，对每个 stop 加一组保守的模型 offset；个别书院页面的 10–15 分钟只能约束整段总时长。UI 应持续显示“预计”，直到用户反馈和模型更新产生更好的 posterior，不能把计算值包装成官网时刻。

### 7.3 推荐保留的来源/质量字段

```text
source_kind: transport_route_page | transport_pdf | cuhk_campus_map | college_guidance
source_url
source_record_id
retrieved_at
source_modified_at          # 若响应公开；不等于业务有效期
valid_from / valid_to       # 只有源明确给出时才填
quality: official_current | official_unversioned | official_legacy_candidate | modeled
is_realtime
notes
```

建议把当前交通处时刻表标为 `official_current`，Campus Map 坐标标为 `official_legacy_candidate`，书院整段时长标为 `official_unversioned`，逐站时间标为 `modeled`。

## 8. 实际请求清单与响应判断

| 请求/资源                               | 结果                      | 与逐站到达的关系                                   |
| --------------------------------------- | ------------------------- | -------------------------------------------------- |
| 28 个 EN/TC route HTML                  | 全部可公开访问            | 有起点时刻、停站、route status；无逐站时间         |
| `GET /wp-json/`                         | 200                       | 无 live/ETA/vehicle namespace                      |
| `GET /wp-json/wp/v2/route/2554`         | 200                       | 空 content/ACF；只有 post metadata                 |
| `OPTIONS /wp-json/wp/v2/route/2554`     | 200                       | ACF schema 无公开 properties                       |
| `GET /wp-json/wp/v2/stop/2552?_embed=1` | 200                       | 无坐标、路线或时间                                 |
| route/stop `context=edit`、revisions    | 401                       | 私有，不属于公开可用数据                           |
| `GET /wp-admin/admin-ajax.php`          | 403                       | 页面也未引用任何 bus action                        |
| `robots.txt`、`wp-sitemap.xml`          | 200                       | 只有内容页面索引，无数据 feed                      |
| 交通处四份 PDF                          | 200                       | 起点班次 + 停站图；无逐站时间                      |
| `newsdetails` 两页 REST                 | 200；118 条，近两年 64 条 | 通告可标异常日；无数值延误样本                     |
| Campus Map HTML                         | 200                       | 明示非实时                                         |
| `cuhk_location_db.js?20161006`          | 200                       | 51 个站点、19 个旧 pattern、46 段几何；无时长/到站 |
| New Asia / United College 交通说明      | 200                       | 少量整段 10–15 分钟弱先验                          |

## 9. 使用和许可边界

这些 URL 无需登录即可读取，但审计未找到开放数据许可证或允许批量再发布的条款。[CUHK Disclaimer](https://www.cuhk.edu.hk/english/disclaimer.html) 说明网站内容可随时改变，大学不对依赖网站信息造成的损失承担责任；页脚同时标示 `All Rights Reserved`。

`robots.txt` 允许抓取某路径不等于授予复制、再发布或长期镜像权。尤其是 PDF 版面、站点图和 encoded polyline 属于完整的官方表达/资产，若产品要大批量复制或公开分发，最好先向 CUHK 取得书面许可。

工程上较稳妥的边界是保存经过规范化的事实、来源 URL、来源记录 ID、抓取时间和必要的派生值，并在产品中注明“预计”及来源；不要把官方图片/PDF 原样打包进 App，也不要声称 CUHK 为模型 ETA 的准确性背书。

## 10. 未知项

- CUHK 内部是否有 AVL、车载 GPS、调度台或未公开 API；
- 路线级 `hr-status-*` 是按时段自动计算还是后台人工维护；
- Campus Map 51 个站点和 46 个路段中，哪些在 2026 年仍经过业务核对；
- 官方是否愿意提供 GTFS、逐段经验时长、历史到站记录或数据复用许可。

这些未知项需要交通处直接确认，不能再从当前公开前端响应中推出。
