# CUHK 校巴公开数据：真实形态与 cold-start 用法

> 核对时间：2026-08-10。本文只记录可以从公开来源实际取得的字段，不把推算值写成官方到站时间。

## 结论

公开数据足够做第一版“预计时间表”，但不能做真正实时 ETA：

- CUHK 官方网页/PDF：可以确定路线、发车时间、服务日规则和站点顺序。
- CUHK WordPress REST：可以稳定发现路线/站点记录和更新时间，但不直接给班次、站序或坐标。
- OpenStreetMap：可以补一部分站点坐标，但命名和 `operator` 标签并不完整，必须对表复核。
- CUHK Bus Clock：有一小批 2025 年 GPS 和站间秒数，适合当弱先验，不能当准确真值。
- 没有发现官方 GTFS、GTFS-Realtime、车辆位置、逐站到站时间或 ETA feed。

因此第一版的数据链应当是：

```text
官方发车表 + 人工复核站序 + OSM 临时坐标 + Bus Clock 弱站间耗时
                                 ↓
                          标注为“预计”的到站时间
                                 ↓
                        上线后由用户到站反馈迭代
```

## 1. CUHK 官方 WordPress REST

### 路线索引

公开端点：

- <https://transport.cuhk.edu.hk/wp-json/wp/v2/route?per_page=100>

2026-08-10 实取 14 条路线：`1A`、`1B`、`2`、`3`、`4`、`5`、`6A`、`6B`、`7`、`8`、`N`、`H`、`Up`、`Down`。

真实响应样例：

```json
{
  "id": 2554,
  "slug": "1a",
  "title": { "rendered": "1A Main Campus" },
  "modified": "2026-01-08T18:46:37",
  "link": "https://transport.cuhk.edu.hk/route/1a/"
}
```

适合保存为 `OfficialRouteSource` 的外部身份和变更检测游标。它不是 transport feed；读取单条完整记录时，`content.rendered` 为空、`acf` 也是空数组，班次和站序仍须解析 HTML。

### 站点索引

公开端点：

- <https://transport.cuhk.edu.hk/wp-json/wp/v2/stop?per_page=100>

2026-08-10 实取 47 条站点。真实响应样例：

```json
{
  "id": 7526,
  "slug": "residences-no-3-downward",
  "title": { "rendered": "Residences No. 3 (Downward)" },
  "modified": "2025-06-23T17:04:31",
  "link": "https://transport.cuhk.edu.hk/stop/residences-no-3-downward/"
}
```

这个响应能给官方站名和稳定的 WordPress post ID，但没有经纬度。当前 47 条记录的 `modified` 范围是 2021-06-04 至 2026-07-30；更新时间不是业务生效时间。

## 2. 官方路线 HTML 与 PDF

### HTML 是当前班次的主要机器来源

[1A 官方路线页](https://transport.cuhk.edu.hk/route/1a/) 中的实际片段：

```html
<div class="rb-2-1">
  Service Hours<br /><span class="rb-large">07:40-18:50</span>
  For Mon to Sat (Except Public Holidays)
</div>
<div class="rb-2-2">
  Departure Time (mins)
  <span class="rb-large">Every 10, 20, 40, 50</span>
</div>
<span class="route-stop-text">Sir Run Run Shaw Hall</span>
<span class="route-stop-text">Univ. Sports Centre</span>
<span class="route-stop-text">Univ. Admin. Bldg.</span>
<span class="route-stop-text">S.H. Ho College</span>
```

这可以解析为发车窗口和每小时分钟数。但页面的路线图是多列视觉布局，DOM 顺序不一定就是行车顺序，不能仅按元素出现顺序自动写入 `RoutePattern`。

### PDF 适合交叉核对和保存证据

官方当前文件：

- [周一至六普通校巴 Shuttle.pdf](https://transport.cuhk.edu.hk/wp-content/uploads/documents/Shuttle.pdf)
- [晚间及假日校巴 NH.pdf](https://transport.cuhk.edu.hk/wp-content/uploads/documents/NH.pdf)
- [转堂校巴 Meet-class.pdf](https://transport.cuhk.edu.hk/wp-content/uploads/documents/Meet-class.pdf)
- [收费穿梭小巴 PSLB_2025.pdf](https://transport.cuhk.edu.hk/wp-content/uploads/documents/PSLB_2025.pdf)

`Shuttle.pdf` 是一页 A4 表格/路线图，文本可抽取。其 1A 区域大致是：

```text
Route  Service Hours  Departs hourly at (mins)
1A     07:40–18:50    10, 20, 40, 50
1B     08:00–18:30    00, 30
2      07:45–18:45    00, 15, 30, 45
```

但抽取后的路线图列会互相穿插，不适合不经复核直接推导站序。

近两年仍可取得的历史样本：

- [Shuttle_24-25.pdf](https://transport.cuhk.edu.hk/wp-content/uploads/documents/Shuttle_24-25.pdf)
- [NH_24-25.pdf](https://transport.cuhk.edu.hk/wp-content/uploads/documents/NH_24-25.pdf)
- [Meet-class_24-25.pdf](https://transport.cuhk.edu.hk/wp-content/uploads/documents/Meet-class_24-25.pdf)

`Shuttle_24-25.pdf` 的 PDF 创建时间是 2024-10-30，版面明确写着 `Effective: Sep 3, 2024`。当前 `Shuttle.pdf` 的 PDF 创建时间是 2026-02-04，却没有在版面写生效日期。因此：历史 PDF 可以做差异审计，但不能依据文件修改时间自动决定业务生效区间。

## 3. 官方临时通告

公开内容类型为 `newsdetails`：

- <https://transport.cuhk.edu.hk/wp-json/wp/v2/newsdetails?per_page=10>

真实响应样例：

```json
{
  "id": 8285,
  "slug": "bus-stop-temporary-relocation-university-station-2",
  "title": {
    "rendered": "Bus Stop Temporary Relocation &#8211; University Station"
  },
  "date": "2026-08-07T17:07:05",
  "modified": "2026-08-07T17:08:14",
  "content": { "rendered": "" }
}
```

这条[迁站通告网页](https://transport.cuhk.edu.hk/newsdetails/bus-stop-temporary-relocation-university-station-2/)的正文是一张 1798×2560 JPG，而不是 REST 中的结构化文字。程序能发现“可能有变更”，但有效日期、受影响路线和临时位置需要 OCR 加人工审核，不能直接生成 `ServiceException`。

## 4. OpenStreetMap 站点坐标

使用 Overpass 在 CUHK 周边查询 `highway=bus_stop`，可以取得坐标和部分双语标签。真实节点样例：

```json
{
  "type": "node",
  "id": 2035104643,
  "lat": 22.4180416,
  "lon": 114.2098498,
  "tags": {
    "name:en": "S.H. Ho College",
    "name:zh": "善衡書院",
    "operator": "CUHK",
    "highway": "bus_stop"
  }
}
```

可在 [OpenStreetMap 节点 2035104643](https://www.openstreetmap.org/node/2035104643) 查看。

同一范围也会返回港铁/专营巴士站；部分明显属于 CUHK 的站点没有 `operator=CUHK`，上下行命名也不完全对应官方 slug。因此 OSM 坐标只能先生成 `StopPlaceLink(status=provisional)`，经人工对表后才能用于“GPS 附近站点”默认值。

OpenStreetMap 数据采用 [ODbL](https://www.openstreetmap.org/copyright)，产品必须做相应署名并遵守数据库许可。

## 5. CUHK Bus Clock 公开数据

固定审计版本：[`575adc5`](https://github.com/CCheukKa/CUHK-bus-clock/tree/575adc5475fc115001c30d9b5d5373384791c1f6)。

### 原始 GPS 日志

[`data/bus-log.json`](https://github.com/CCheukKa/CUHK-bus-clock/blob/575adc5475fc115001c30d9b5d5373384791c1f6/data/bus-log.json) 的真实记录：

```json
{
  "route": "1A",
  "timeStamp": "2025-02-21T02:06:13.000Z",
  "location": {
    "timestamp": 1740103573000,
    "mocked": false,
    "coords": {
      "latitude": 22.4146252,
      "longitude": 114.2102296,
      "accuracy": 6.510000228881836,
      "speed": 0.5965909361839294,
      "heading": 203.39356994628906
    }
  }
}
```

整个文件只有 154 条记录，时间范围为 2025-02-21 至 2025-04-25，路线覆盖为：

| 路线 | 记录数 |
| ---- | -----: |
| 1A   |     40 |
| 1B   |     14 |
| 2    |     27 |
| 3    |     19 |
| 4    |      5 |
| 5    |      9 |
| 8    |     19 |
| H    |     20 |
| N    |      1 |

记录没有 `vehicleId`、`tripId`、开关门事件或人工真值。

### 处理后的站点标签

[`data/processed-bus-log.json`](https://github.com/CCheukKa/CUHK-bus-clock/blob/575adc5475fc115001c30d9b5d5373384791c1f6/data/processed-bus-log.json) 在原记录上增加最近站点：

```json
{
  "route": "1A",
  "timeStamp": "2025-02-21T02:08:28.000Z",
  "station": "University Sports Centre",
  "location": {
    "coords": {
      "latitude": 22.4178839,
      "longitude": 114.2106599,
      "accuracy": 3.868000030517578
    }
  }
}
```

`station` 是最近站算法的输出，不是巴士系统提供的真实到站事件。

### 站间耗时数组

[`data/station-times.json`](https://github.com/CCheukKa/CUHK-bus-clock/blob/575adc5475fc115001c30d9b5d5373384791c1f6/data/station-times.json) 的结构很简单：

```json
{
  "University Station>>University Sports Centre": [
    135, 111, 91, 127, 112, 126, 146, 107, 123, 131, 98
  ],
  "University Sports Centre>>Sir Run Run Shaw Hall": [
    132, 139, 110, 153, 147, 127, 145, 153, 123, 140, 149, 132, 109, 145, 147,
    160
  ]
}
```

键是相邻站对，值是秒数数组。全文件有 54 个 pair、49 个非空 pair、113 个耗时；22 个 pair 只有 1 个样本，23 个只有 2–4 个，只有 4 个达到 5 个样本。发布文件还丢失了路线维度，同一个站对可能混入不同路线。

## 6. 它怎样变成第一版“预计时间”

以 1A 的一个 cold-start 示例说明：

- 官方发车：07:40。
- `University Station → University Sports Centre` 的公开样本中位数：123 秒（11 个样本）。
- `University Sports Centre → Sir Run Run Shaw Hall` 的公开样本中位数：142.5 秒（16 个样本）。

在站序完成人工复核后，可以生成：

```json
{
  "routeId": "1a",
  "originDeparture": "07:40",
  "patternStatus": "manual-reviewed",
  "projections": [
    {
      "stopId": "university-sports-centre",
      "cumulativeOffsetSeconds": 123,
      "publishedLabel": "预计 07:42",
      "sourceKind": "public-observation",
      "sampleCount": 11
    },
    {
      "stopId": "sir-run-run-shaw-hall",
      "cumulativeOffsetSeconds": 266,
      "publishedLabel": "预计 07:44",
      "sourceKind": "public-observation",
      "sampleCount": 16
    }
  ],
  "sourceRefs": ["cuhk-route-1a@2026-01-08T18:46:37", "cuhk-bus-clock@575adc5"]
}
```

这是“勉强正确但明确不准确”的初始估计：第二站累计值是两段中位数之和并四舍五入，不是官方到站时间，也不是对同一批次联合样本拟合的结果。UI 必须持续显示“预计”。

## 7. 数据到字段的实际映射

| 产品字段            | 冷启动来源         | 初始可信度 | 处理方式                                  |
| ------------------- | ------------------ | ---------- | ----------------------------------------- |
| `routeId`、显示名   | CUHK route REST    | 高         | 以 WordPress ID/slug 保留外部身份         |
| 起点发车时间        | 官方 HTML + PDF    | 高         | 两者一致才自动发布，冲突则人工审核        |
| 服务日/公众假期规则 | 官方 HTML/PDF      | 中高       | 解析为规则，日期由校历展开                |
| 站点身份            | CUHK stop REST     | 高         | 官方 ID 为主，别名另存                    |
| 站序/方向           | 官方路线图         | 中         | 多列布局需人工复核后建立 pattern revision |
| 站点坐标            | OSM                | 中低       | provisional link；做距离和重复站检查      |
| 站间耗时            | Bus Clock          | 低         | 只作 weak prior；保留样本数和 commit      |
| 临时迁站/停运       | newsdetails + 图片 | 低         | 自动发现，OCR/人工确认后生效              |
| 真实逐站到达        | 当前没有公开来源   | 无         | 上线后由匿名反馈聚合重建 ArrivalEvent     |

## 8. 许可与发布边界

- “网页可公开访问”不等于可以无限制重新发布。CUHK 页面/PDF应保留来源、抓取时间和内容 hash；若要批量镜像原文或图片，应另行确认授权。
- Bus Clock 仓库代码标为 GPL-3.0，但仓库没有为 `data/*.json` 单独写清数据许可。可以先把它用于内部验证和可追溯弱先验，不应默认把原始 GPS 数据重新打包发布。
- OSM 坐标需要按 ODbL 做署名和合规处理。

最稳妥的首版发布物不是复制原始文件，而是带来源记录的派生 `cold-start projection dataset`，并把所有中间站时间明确标成“预计”。
