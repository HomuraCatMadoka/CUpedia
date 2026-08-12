# CUHK 其他校巴路线：第一方数据接入审计

> 审计日期：2026-08-11（Asia/Hong_Kong）
> 范围：排除已经接入的 Route 2；只使用 CUHK 交通处、CUHK Campus Map 与 CUHK 教务处公开的第一方资料。本文不使用 OpenStreetMap、Bus Clock 或第三方巴士应用来证明路线事实。

## 结论与建议批次

CUHK 交通处当前公开 14 条 route 记录；排除 Route 2 后，剩余 13 条为：

```text
1A, 1B, 3, 4, 5, 6A, 6B, 7, 8, N, H, Up, Down
```

最适合优先接入的是 **1A + 1B**：

- 服务日和班次规则固定，没有教学日、非教学日或某分钟条件分支；
- 站数少，分别只有 6 和 8 个 occurrence；
- 当前官方 PDF、当前路线页和 2024–25 官方 PDF 的班次一致；
- CUHK 官方 Campus Map 的旧有向 segments 仍能无歧义重建这两条路线；
- 1A、1B 与现有 Route 2 共用大部分车站，可验证现有站点复用、同站多 route 和 ETA 展示，而不先引入复杂日历。

建议后续顺序：

1. **批次 A：1A、1B**；
2. **批次 B：3、4**，固定班次但站序较长，官方旧 Campus Map 只能提供点位候选，不能单独证明完整当前 shape；
3. **批次 C：5、6A、6B、7**，必须先接好“教学日／阅读周／大学假期”日历；
4. **批次 D：N、H、8**，包含按发车分钟或教学日切换的 RoutePattern；
5. **最后：Up、Down**，收费、保健医疗中心条件停站、官方当前来源之间还有一处服务日冲突。

如果实现层已经另行完成 Route 4 的 15/15 站点坐标与 shape 复核，**Route 4 可以与批次 A 同时上线**：其官方班次和 pattern 同样固定，没有条件站或来源冲突。严格只看 CUHK 第一方 geometry 时，1A、1B 仍是最稳妥的首批。

无论哪一批，CUHK 官方资料都只给出**起点发车时间**，没有逐站到站时间。下游只能以统计先验生成并始终显示为“预计”的站点 ETA。

## 第一方来源与证据边界

### 1. 路线发现接口

[CUHK WordPress route REST](https://transport.cuhk.edu.hk/wp-json/wp/v2/route?per_page=100) 当前返回 14 条、一页。可用原始字段为：

```text
id
slug
title.rendered
date
modified
route_category
link
```

当前 `content.rendered` 为空、`acf` 为空数组，所以 REST 只适合路线发现、源身份与变更检测，不能取得站序或时刻表。`modified` 是 WordPress 内容更新时间，不是业务 `validFrom`。

类别值为：

```text
31 = 穿梭校巴页面组
32 = 转堂校巴页面组
35 = 收费穿梭小巴页面组
```

本轮实际取得的 13 条目标记录版本为：

```text
1A   id=2554  modified=2026-01-08T18:46:37  category=31
1B   id=2567  modified=2026-01-08T18:46:56  category=31
3    id=2869  modified=2026-03-30T10:16:16  category=31
4    id=2878  modified=2026-03-30T10:16:16  category=31
5    id=2766  modified=2026-04-21T08:50:32  category=32
6A   id=2768  modified=2026-04-21T08:50:32  category=32
6B   id=2890  modified=2026-04-21T08:50:32  category=32
7    id=2893  modified=2026-04-21T08:50:32  category=32
8    id=2880  modified=2026-03-30T10:16:16  category=31
N    id=2883  modified=2025-11-17T21:17:34  category=31
H    id=2885  modified=2026-07-26T17:23:44  category=31
Up   id=3539  modified=2026-03-30T10:16:16  category=35
Down id=3565  modified=2026-03-30T10:16:16  category=35
```

### 2. 单路线 HTML

繁体中文页面为 `https://transport.cuhk.edu.hk/tc/route/{slug}/`。页面公开：

- 路线代码与名称；
- 服务时段、星期／教学日规则；
- 每小时发车分钟；
- 条件停站与收费备注；
- 乘客范围标题；
- 视觉路线图中的站名。

实际 DOM 以 `.route-details`、`.route-stop-text`、`.route-stop-first`、`.route-stop-last` 等展示类组织。**`.route-stop-text` 的 DOM 出现顺序是路线图排版顺序，不保证是车辆行驶顺序**；不能直接把它写成 `RoutePattern.stopSequence`。

官方页面还给了以下视觉色彩提示。它们可保存为 `sourceStylingHint`，但不是稳定 API，也不代表道路 polyline：

```text
1A/1B  #fff149 -> #f3b53a
3      #a4cc39 -> #318761
4      #f1a63b -> #e75a24
5      #c2d6ea -> #29a1d8
6A     #7c8644 -> #585823
6B     #4f88c1 -> #3f438f
7      #c2c2c2 -> #666666
8      #ffe3a8 -> #ffc55a
N      #d1b4d5 -> #7961a8
H      #896391 -> #453087
Up     #857cd6
Down   #7dd8a9
```

### 3. 当前官方 PDF

| 资产                                                                                        | 覆盖路线           | 结构                                         | SHA-256（2026-08-10/11 审计快照）                                  |
| ------------------------------------------------------------------------------------------- | ------------------ | -------------------------------------------- | ------------------------------------------------------------------ |
| [Shuttle.pdf](https://transport.cuhk.edu.hk/wp-content/uploads/documents/Shuttle.pdf)       | 1A、1B、2、3、4、8 | 1 页，可抽取时刻文字；站序需按视觉路线图追踪 | `b3262eae15303816d7410878b07842ecc32539c22056d731716c90b32914d09d` |
| [Meet-class.pdf](https://transport.cuhk.edu.hk/wp-content/uploads/documents/Meet-class.pdf) | 5、6A、6B、7       | 1 页，可抽取时刻文字；站序需按视觉路线图追踪 | `fd85c6d510f3de4033745f404499a6f1611d8fdac91ef18dc238d4b164d58439` |
| [NH.pdf](https://transport.cuhk.edu.hk/wp-content/uploads/documents/NH.pdf)                 | N、H               | 1 页，可抽取时刻文字；条件站需按图例追踪     | `4238b6a144137659086111072fe4df17be5e61b31b68aae5fca55c40ae24b854` |
| [PSLB_2025.pdf](https://transport.cuhk.edu.hk/wp-content/uploads/documents/PSLB_2025.pdf)   | Up、Down           | 2 页图片型 PDF；编号 1–15 明确站序与示意路径 | `5f488aa6b0f1d196ce8d70179898331dfa013fc9e147dafd63e0b88be03cfe6c` |

PDF 是当前站序的第一方证据，但不是稳定机器 feed。抓取时必须保存 `url + retrievedAt + sha256 + parserVersion + reviewedPattern`。

### 4. 站点与地理位置

[CUHK WordPress stop REST](https://transport.cuhk.edu.hk/wp-json/wp/v2/stop?per_page=100) 当前有 47 条记录，其中一条是 `(Blank)`；其余 46 条是运营 stop identity。原始字段为 `id`、`slug`、`title.rendered`、`date`、`modified`、`link`，没有经纬度。

[CUHK Campus Map 静态资产](https://www.cuhk.edu.hk/english/js/campus/cuhk_location_db.js?20161006) 含 51 个 `shuttle_bus_stops` 坐标、19 个旧 `shuttle_bus_route` 和 46 个有向 `bus_route_segment`。它可作为坐标候选，但字段级实测日期未知，旧 route 编号也不是当前交通处 route 编号。只凭这个官方旧 graph，目前可无歧义重建当前完整 shape 的是 1A、1B。

## 当前路线总表

“职员专车”列只回答是否**仅职员**。免费校巴页面写的是“中大學生及教職員專車”，因此不是仅职员；Up/Down 页面没有同样的乘客范围标题，也没有写成职员专车。

| 路线              | 官方 WP id | 当前服务日／服务时段                                     | 起点发车分钟            | RoutePattern                                             | 仅职员           | 第一方来源                                                                                                                            |
| ----------------- | ---------: | -------------------------------------------------------- | ----------------------- | -------------------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 1A 本部线         |       2554 | 一至六，公假除外；07:40–18:50                            | 10、20、40、50          | 固定，6 站 occurrence                                    | 否；学生及教职员 | [页面](https://transport.cuhk.edu.hk/tc/route/1a/)、[PDF](https://transport.cuhk.edu.hk/wp-content/uploads/documents/Shuttle.pdf)     |
| 1B 本部线         |       2567 | 一至六，公假除外；08:00–18:30                            | 00、30                  | 固定；所有班次去回程均停 PGH1，8 occurrence              | 否；学生及教职员 | [页面](https://transport.cuhk.edu.hk/tc/route/1b/)、[PDF](https://transport.cuhk.edu.hk/wp-content/uploads/documents/Shuttle.pdf)     |
| 3 逸夫线          |       2869 | 一至六，公假除外；09:00–18:40                            | 00、20、40              | 固定，15 站                                              | 否；学生及教职员 | [页面](https://transport.cuhk.edu.hk/tc/route/3/)、[PDF](https://transport.cuhk.edu.hk/wp-content/uploads/documents/Shuttle.pdf)      |
| 4 环回线          |       2878 | 一至六，公假除外；07:30–18:50                            | 10、30、50              | 固定，15 站                                              | 否；学生及教职员 | [页面](https://transport.cuhk.edu.hk/tc/route/4/)、[PDF](https://transport.cuhk.edu.hk/wp-content/uploads/documents/Shuttle.pdf)      |
| 5 上行线          |       2766 | 教学日；一至五 09:18–17:26，六 09:18–13:26               | 18、22、26              | 固定，9 站                                               | 否；学生及教职员 | [页面](https://transport.cuhk.edu.hk/tc/route/5/)、[PDF](https://transport.cuhk.edu.hk/wp-content/uploads/documents/Meet-class.pdf)   |
| 6A 下行线（敬文） |       2768 | 教学日；一至五 09:10–17:10，六 09:10–13:10               | 10                      | 固定，10 站                                              | 否；学生及教职员 | [页面](https://transport.cuhk.edu.hk/tc/route/6a/)、[PDF](https://transport.cuhk.edu.hk/wp-content/uploads/documents/Meet-class.pdf)  |
| 6B 下行线（新联） |       2890 | 教学日；一至五 12:20–17:20，星期六无服务                 | 20                      | 固定，6 站                                               | 否；学生及教职员 | [页面](https://transport.cuhk.edu.hk/tc/route/6b/)、[PDF](https://transport.cuhk.edu.hk/wp-content/uploads/documents/Meet-class.pdf)  |
| 7 下行线（逸夫）  |       2893 | 教学日；一至五 08:18–17:50，六 08:18–13:18               | 18、50                  | 固定，8 站                                               | 否；学生及教职员 | [页面](https://transport.cuhk.edu.hk/tc/route/7/)、[PDF](https://transport.cuhk.edu.hk/wp-content/uploads/documents/Meet-class.pdf)   |
| 8 西部线          |       2880 | 一至六，公假除外；07:40–18:40                            | 00、20、40              | 教学日 16 站；非教学日 17 站且改终点                     | 否；学生及教职员 | [页面](https://transport.cuhk.edu.hk/tc/route/8/)、[PDF](https://transport.cuhk.edu.hk/wp-content/uploads/documents/Shuttle.pdf)      |
| N 晚间线          |       2883 | 一至六，星期日及公假停驶；19:00–23:30                    | 00、15、30、45          | 15/30/45 分 19 站；00 分经 PGH1 两次，21 occurrence      | 否；学生及教职员 | [页面](https://transport.cuhk.edu.hk/tc/route/n/)、[PDF](https://transport.cuhk.edu.hk/wp-content/uploads/documents/NH.pdf)           |
| H 假日线          |       2885 | 星期日及公假；08:20–23:20                                | 00、20、40              | 20/40 分 19 站；00 分经 PGH1 两次和 39 区，22 occurrence | 否；学生及教职员 | [页面](https://transport.cuhk.edu.hk/tc/route/h/)、[PDF](https://transport.cuhk.edu.hk/wp-content/uploads/documents/NH.pdf)           |
| Up 收费小巴       |       3539 | 一至日及公假；08:30–23:00                                | 00、30                  | 15 站；保健中心条件停站                                  | 未标为仅职员     | [页面](https://transport.cuhk.edu.hk/tc/route/up/)、[PDF](https://transport.cuhk.edu.hk/wp-content/uploads/documents/PSLB_2025.pdf)   |
| Down 收费小巴     |       3565 | 07:00–08:15 一至六；08:45–21:15 的服务日来源冲突，见下文 | 00/15/30/45；后段 15/45 | 15 站；保健中心条件停站                                  | 未标为仅职员     | [页面](https://transport.cuhk.edu.hk/tc/route/down/)、[PDF](https://transport.cuhk.edu.hk/wp-content/uploads/documents/PSLB_2025.pdf) |

Up、Down 当前票价均为 HK$5.5。当前 PDF 页脚写的是“居民／中大证件持有人优先登车”，不是“仅限职员”。

页面上的 `NS`／`S` 也不是乘客权限：[官方乘车须知](https://transport.cuhk.edu.hk/tc/notice-to-passengers/)说明 `NS` 为不设企位、`S` 为设有企位。5、6A、6B、7 只标 `NS`；其他免费路线页面同时显示 `NS/S`，但官网没有逐班派车资料，不能据此给某一具体 Trip 写死车型或是否可站立。

另有独立的[职员自组上下班巴士服务](https://transport.cuhk.edu.hk/tc/staff-self-arranged-bus-service/)，页面明确“只限香港中文大学职员查看”并要求登录；它不在上述 14 条公开 route REST 记录内，也没有公开站序或班次，不能纳入本次公开数据接入。

## 官方站序与条件变体

以下顺序来自当前官方 PDF 的视觉路线图／编号路线图；不是从 HTML DOM 顺序推断。

### 1A

```text
大學站 → 大學體育中心 → 邵逸夫堂 → 大學行政樓 → 善衡書院 → 大學站
```

### 1B

```text
大學站 → 研究生宿舍一座 → 大學體育中心 → 邵逸夫堂 → 大學行政樓 → 善衡書院 → 研究生宿舍一座 → 大學站
```

### 3

```text
康本園 → 大學體育中心 → 科學館 → 馮景禧樓 → 伍宜孫書院（上行） →
逸夫書院（上行） → 敬文書院（下行） → 十五苑 → 聯合苑 → 陳震夏宿舍 →
逸夫書院（下行） → 伍宜孫書院（下行） → 大學行政樓 → 善衡書院 → 大學站廣場
```

### 4

```text
康本園 → 環迴東站（上行） → 敬文書院（上行） → 39區（上行） →
敬文書院（下行） → 十五苑 → 聯合苑 → 陳震夏宿舍 → 逸夫書院（下行） →
伍宜孫書院（下行） → 新亞書院 → 聯合書院（下行） → 大學行政樓 → 善衡書院 → 大學站
```

### 5

```text
崇基教學樓 → 大學體育中心 → 邵逸夫堂 → 馮景禧樓 → 聯合書院（上行） →
新亞書院 → 伍宜孫書院（上行） → 逸夫書院（上行） → 敬文書院（下行）
```

### 6A

```text
敬文書院（下行） → 聯合苑 → 陳震夏宿舍 → 伍宜孫書院（下行） →
新亞書院 → 聯合書院（下行） → 大學行政樓 → 善衡書院 → 大學站廣場 → 崇基教學樓
```

### 6B

```text
新亞書院 → 聯合書院（下行） → 大學行政樓 → 善衡書院 → 大學站廣場 → 崇基教學樓
```

### 7

```text
逸夫書院（下行） → 伍宜孫書院（下行） → 新亞書院 → 聯合書院（下行） →
大學行政樓 → 善衡書院 → 大學站廣場 → 崇基教學樓
```

### 8

教学日：

```text
39區（上行） → 敬文書院（下行） → 聯合苑 → 陳震夏宿舍 →
逸夫書院（下行） → 伍宜孫書院（下行） → 大學行政樓 → 科學館 → 新亞坊 →
聯合書院（下行） → 伍宜孫書院（上行） → 逸夫書院（上行） → 39區（下行） →
環迴北站 → 環迴東站（下行） → 大學站
```

非教学日的共同前 15 站不变，最后改为：

```text
… → 環迴東站（下行） → 大學站廣場 → 崇基教學樓
```

即非教学日不停“大學站”，不能只在同一 pattern 上添加两个站。

### N

15、30、45 分发车：

```text
大學站 → 大學體育中心 → 邵逸夫堂 → 新亞坊 → 聯合書院（下行） →
伍宜孫書院（上行） → 逸夫書院（上行） → 39區（上行） → 敬文書院（下行） →
十五苑 → 聯合苑 → 陳震夏宿舍 → 逸夫書院（下行） → 伍宜孫書院（下行） →
新亞書院 → 聯合書院（下行） → 大學行政樓 → 善衡書院 → 大學站
```

00 分发车在离站后和回站前各加停一次研究生宿舍一座：

```text
大學站 → 研究生宿舍一座 → [上述中间站] → 善衡書院 → 研究生宿舍一座 → 大學站
```

### H

20、40 分发车：

```text
大學站 → 大學體育中心 → 邵逸夫堂 → 新亞坊 → 聯合書院（下行） →
伍宜孫書院（上行） → 逸夫書院（上行） → 敬文書院（下行） → 十苑 →
十五苑 → 聯合苑 → 陳震夏宿舍 → 逸夫書院（下行） → 伍宜孫書院（下行） →
新亞書院 → 聯合書院（下行） → 大學行政樓 → 善衡書院 → 大學站
```

00 分发车在离站后和回站前各加停一次研究生宿舍一座，并在逸夫书院（上行）后加停 39 区（上行）：

```text
大學站 → 研究生宿舍一座 → [至逸夫書院（上行）] → 39區（上行） →
[其余 H 站点] → 善衡書院 → 研究生宿舍一座 → 大學站
```

### Up 收费小巴

```text
大學站（收費小巴） → 王福元樓 → 崇基C座 → 教研樓一座 →
大學保健醫療中心（上行，条件站） → 邵逸夫堂 → 大學圖書館／文物館 →
馮景禧樓 → 聯合書院（上行） → 新亞書院（上行） → 三苑（上行） →
和聲書院 → 聯合苑 → 十五苑 → 十、十一苑
```

保健医疗中心只在星期一至五 08:30–17:30 停靠，公众／大学假期除外。

### Down 收费小巴

```text
十、十一苑 → 十五苑 → 聯合苑 → 陳震夏宿舍 → 三苑（下行） →
新亞書院（下行） → 聯合書院（下行） → 大學行政樓 →
大學保健醫療中心（下行，条件站） → 何善衡工程學大樓 → 教研樓一座 →
崇基C座 → 何添樓 → 康本園（收費小巴） → 大學站（收費小巴）
```

保健医疗中心只在星期一至五 08:45–17:45 停靠，公众／大学假期除外。

## 最近两年的版本证据

官网仍可访问三份 2024–25 文件：

| 历史资产                                                                                                | 明确生效日 | 与当前数字时刻表比较                                                |
| ------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------- |
| [Shuttle_24-25.pdf](https://transport.cuhk.edu.hk/wp-content/uploads/documents/Shuttle_24-25.pdf)       | 2024-09-03 | 1A、1B、2、3、4、8 的服务时段、发车分钟和条件备注与当前版本相同     |
| [NH_24-25.pdf](https://transport.cuhk.edu.hk/wp-content/uploads/documents/NH_24-25.pdf)                 | 2024-08-26 | N、H 的服务时段、发车分钟和条件站规则与当前版本相同                 |
| [Meet-class_24-25.pdf](https://transport.cuhk.edu.hk/wp-content/uploads/documents/Meet-class_24-25.pdf) | 2024-09-02 | 5、6A、6B、7 的数字时刻相同；当前版本新增“阅读周”暂停服务的明确文字 |

当前四份 PDF 都没有在版面上写明确 `Effective` 日期；PDF 创建／修改 metadata 和 WordPress `modified` 都不能替代业务生效日。收费小巴在本轮官方资产集中只找到当前 `PSLB_2025.pdf`，没有可复核的 2024–25 固定版本 URL，因此不能声称其两年内没有变化。

## 发现的官方冲突

### Down 第二服务时段

- 当前[路线页面](https://transport.cuhk.edu.hk/tc/route/down/)写：`08:45–21:15 星期日及公眾假期`；
- 当前[PSLB_2025.pdf](https://transport.cuhk.edu.hk/wp-content/uploads/documents/PSLB_2025.pdf)写：`08:45–21:15 星期一至日及公眾假期`。

PDF 同时写出星期一至五 08:45–17:45 的保健医疗中心条件停站，因此它内部支持“一至日”的解释；但网页与 PDF 同属第一方，接入层不应静默覆盖。建议将 Down 标记为 `source_conflict`，在交通处确认或观察下一版更新前不进入首批上线。

## 推荐导入字段

建议保留原始事实与派生结果的边界：

```text
Route
  sourceRouteId        // WordPress id
  routeCode            // slug / display code
  categorySourceId     // 31 / 32 / 35
  nameZhHant
  audienceRaw
  fare                  // nullable

ServiceBand
  routeId
  startTime
  endTime
  departureMinutes[]
  serviceRuleRaw
  serviceDayRule       // 经审核后的结构化规则

RoutePattern
  patternId
  routeId
  activationRule       // departure minute / teaching-day branch
  stopSequence[]

RoutePatternStop
  sequence
  sourceStopId         // cuhk-wp-stop-<id>
  conditionalRule      // nullable

SourceSnapshot
  url
  retrievedAt
  sha256
  parserVersion
  reviewStatus
```

同一物理地点在去／回程、上／下行或不同站台可以对应不同运营 stop identity；不要按规范化站名直接合并。研究生宿舍一座在 1B、N、H 中会在同一圈出现两次，也必须保留两个 route occurrence。

## 仍然缺失、不可推断

第一方公开资料没有：

- 逐站计划到站时间或站间 offset；
- trip ID、车辆 ID、车辆当前位置、AVL、GTFS 或 GTFS-Realtime；
- 实时加班车或提前／延迟记录；
- 统一、机器可读的“教学日／非教学日／大学假期”巴士日历 feed；
- 当前所有路线的完整、贴路、可机器导入 shape；
- 每个 WordPress stop 的经纬度与道路侧；
- 当前 PDF 的明确业务 `validFrom`；
- 收费小巴可复核的 2024–25 固定版本；
- 被登录保护的职员自组上下班巴士路线资料。

因此不能从起点发车时间直接声称“6:02 到善衡书院”是官方时刻；任何逐站时间都必须带 `estimated` provenance。教学日路线还必须先将 [CUHK 2025–26 教学学期](https://www.res.cuhk.edu.hk/general-information/almanac/university-almanac-2025-26/full-time-undergraduate-programmes-teaching-terms/)与 [2026–27 教学学期](https://www.res.cuhk.edu.hk/general-information/almanac/university-almanac-2026-27/full-time-undergraduate-programmes-teaching-terms/)作为日历证据接入，但学期起止本身仍不能自动证明每一天的巴士“教学日”状态；阅读周和大学假期需显式处理。

## 接入验收条件

每条新路线至少通过以下检查后才应显示：

1. 当天服务规则计算正确，并能明确显示“今日不服务”；
2. `departureMinutes` 只从时刻行解析，不把备注中的 `08:30`、`17:30` 等数字误识别成发车分钟；
3. 站序来自经人工复核的官方路线图，不取 HTML DOM 顺序；
4. 条件班次生成独立 RoutePattern，不在 UI 里写死“不经此站”；
5. 同一站在一圈内出现两次时保留 occurrence；
6. 没有官方逐站时刻时，所有 ETA 明确标记为“预计”；
7. 来源冲突保留为可审计状态，不静默选择；
8. 保存当前与历史来源的 URL、hash 和抓取时间，便于日后 diff。
