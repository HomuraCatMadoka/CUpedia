# CUHK 官方校巴线路图审计

审计日期：2026-08-10（Asia/Hong_Kong）

## 结论

CUHK 交通处官网确实有与用户截图同类、而且更适合作为数据源的官方线路图：当前四份 PDF 合计覆盖官网列出的全部 14 条路线，图中有路线颜色、行驶方向箭头、起点/终点符号、上下行站名以及条件停站说明。人工沿线路可以复原完整有向站序；但 PDF 的文字层和路线页 DOM 都按视觉栏位组织，并不是机器可直接读取的有序 stop list，不能把 `pdftotext` 或 DOM 出现次序直接当成行车次序。

用户提供的 N/H 彩色图不是 CUHK 官方图。图片标有 `Go To CUHK By Bus`、`@go_to_cuhk_by_bus`，使用自定义字母站号和社交媒体水印；官方 [N/H PDF](https://transport.cuhk.edu.hk/wp-content/uploads/documents/NH.pdf) 则带 CUHK 校徽、交通处标志、官方报失物二维码、`First Stop` / `Last Stop` 图例和 `N4` / `N5` 条件注记。截图可作为 UI 设计参考，不能作为路线事实或版本事实的来源。

## 四份当前官方 PDF

| 官方文件                                                                                    | 页码 | 覆盖路线           | 能否读出完整有向站序                               | 可提取的条件与限制                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------- | ---: | ------------------ | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Shuttle.pdf](https://transport.cuhk.edu.hk/wp-content/uploads/documents/Shuttle.pdf)       |    1 | 1A、1B、2、3、4、8 | 可以，需人工沿六种颜色、箭头以及起终点符号逐线复原 | 1B 的 00/30 班次停研究生宿舍一座；2 的 31 至 00 分班次停邵逸夫堂；8 在非教学日停大学站广场及崇基教学楼且不停大学站。组合图有线路重叠，文字抽取次序不是行车次序。                                                                      |
| [NH.pdf](https://transport.cuhk.edu.hk/wp-content/uploads/documents/NH.pdf)                 |    1 | N、H               | 可以，需分别沿浅紫 N 与深紫 H 的箭头复原           | 39 区（上行）是 N 的常规站、H 的 00 分条件站；N 的 00 分班次另停研究生宿舍一座，H 的 00 分班次另停研究生宿舍一座及 39 区（上行）。Residence No. 10 只画在 H 路径上。条件框不能简单当作所有路线的必停站。                              |
| [Meet-class.pdf](https://transport.cuhk.edu.hk/wp-content/uploads/documents/Meet-class.pdf) |    1 | 5、6A、6B、7       | 可以，需人工沿四条颜色线路和起终点符号复原         | 四线只在教学日服务；非教学日、阅读周及大学假期停驶。PDF 能给站序及服务规则，但不给每站时刻。                                                                                                                                          |
| [PSLB_2025.pdf](https://transport.cuhk.edu.hk/wp-content/uploads/documents/PSLB_2025.pdf)   |  1-2 | Up、Down           | 可以；四份中最容易可靠提取                         | 第 1 页直接把上行、下行分别编号 1-15，第 2 页在校园底图上重复编号。大学保健医疗中心为条件站：上行周一至五 08:30-17:30、下行 08:45-17:45，公众/大学假期除外。该 PDF 是扫描/图像式内容，普通文字抽取几乎为空，应以渲染/OCR 后人工复核。 |

四份图合计的路线集合是：

```text
1A, 1B, 2, 3, 4, 8, N, H, 5, 6A, 6B, 7, Up, Down
```

这与交通处官方 [route REST index](https://transport.cuhk.edu.hk/wp-json/wp/v2/route?per_page=100&_fields=id,slug,modified,title,link) 当前返回的 14 条路线一致。

## 官方单路线页面

官网也为每条路线提供单独页面：

| PDF 分组               | 官方路线页                                                                                                                                                                                                                                                                       |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shuttle                | [1A](https://transport.cuhk.edu.hk/route/1a/)、[1B](https://transport.cuhk.edu.hk/route/1b/)、[2](https://transport.cuhk.edu.hk/route/2/)、[3](https://transport.cuhk.edu.hk/route/3/)、[4](https://transport.cuhk.edu.hk/route/4/)、[8](https://transport.cuhk.edu.hk/route/8/) |
| Night/Holiday          | [N](https://transport.cuhk.edu.hk/route/n/)、[H](https://transport.cuhk.edu.hk/route/h/)                                                                                                                                                                                         |
| Meet-class             | [5](https://transport.cuhk.edu.hk/route/5/)、[6A](https://transport.cuhk.edu.hk/route/6a/)、[6B](https://transport.cuhk.edu.hk/route/6b/)、[7](https://transport.cuhk.edu.hk/route/7/)                                                                                           |
| Paid shuttle light bus | [Up](https://transport.cuhk.edu.hk/route/up/)、[Down](https://transport.cuhk.edu.hk/route/down/)                                                                                                                                                                                 |

单路线页可提取：

- `routeId`、路线名称、服务日、服务时间、每小时发车分钟；
- 该路线出现的站名、上下行限定、条件停站文字；
- 页面视觉图中的线路、方向箭头和起终点，因此人工可复原有向站序。

但 HTML 中的 `.route-stop-text` / `.route-stop-bottom-text` 是按左栏、右栏和底部等视觉区域输出。例如 [N](https://transport.cuhk.edu.hk/route/n/) 页的 DOM 先列左栏站点，再列右栏站点，最后列大学站；这不是车辆的完整行驶顺序。因此路线页适合做“一条路线一条路线”的人工核对，不适合仅靠 DOM 顺序自动生成 adjacency。

## 繁中 `/tc/` 路线页审计

### 是否是独立路线记录

不是。14 组英文页与繁中页拥有相同的 WordPress `postid-*`、slug 和 `modified` 时间；页面用 `hreflang` 把英文、繁中和简中 URL 互相连接。繁中页面是同一条 WordPress 路线记录的 `zh_TW` 语言视图，而不是另一组需要去重的路线实体。

[繁中 route REST index](https://transport.cuhk.edu.hk/tc/wp-json/wp/v2/route?per_page=100&_fields=id,slug,modified,title,link) 会按 locale 返回中文 `title.rendered` 和 `/tc/` link；英文 [route REST index](https://transport.cuhk.edu.hk/wp-json/wp/v2/route?per_page=100&_fields=id,slug,modified,title,link) 返回英文标题，但两者 ID 集合完全相同：

| slug   | WordPress post ID | 官方繁中路线名与页面                                            | 繁中页面提供的特殊规则                                                                            |
| ------ | ----------------: | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `1a`   |              2554 | [1A 本部線](https://transport.cuhk.edu.hk/tc/route/1a/)         | 无条件站文字                                                                                      |
| `1b`   |              2567 | [1B 本部線](https://transport.cuhk.edu.hk/tc/route/1b/)         | 发车分钟为 00、30；图中两次列出研究生宿舍一座，但没有另加 `route-remarks`，因为当前所有班次都会停 |
| `2`    |              2865 | [2 新聯線](https://transport.cuhk.edu.hk/tc/route/2/)           | `逢31至00分開出的班次將停邵逸夫堂`                                                                |
| `3`    |              2869 | [3 逸夫線](https://transport.cuhk.edu.hk/tc/route/3/)           | 无条件站文字                                                                                      |
| `4`    |              2878 | [4 環迴線](https://transport.cuhk.edu.hk/tc/route/4/)           | 无条件站文字                                                                                      |
| `5`    |              2766 | [5 上行線](https://transport.cuhk.edu.hk/tc/route/5/)           | 星期一至六均标明 `只限教學日`                                                                     |
| `6a`   |              2768 | [6A 下行線（敬文）](https://transport.cuhk.edu.hk/tc/route/6a/) | 星期一至六均标明 `只限教學日`                                                                     |
| `6b`   |              2890 | [6B 下行線（新聯）](https://transport.cuhk.edu.hk/tc/route/6b/) | 星期一至五，`只限教學日`                                                                          |
| `7`    |              2893 | [7 下行線（逸夫）](https://transport.cuhk.edu.hk/tc/route/7/)   | 星期一至六均标明 `只限教學日`                                                                     |
| `8`    |              2880 | [8 西部線](https://transport.cuhk.edu.hk/tc/route/8/)           | `非教學日期間將停大學站廣場及崇基教學樓（不停大學站）`                                            |
| `n`    |              2883 | [N 晚間線](https://transport.cuhk.edu.hk/tc/route/n/)           | 39 区是常规站，所以不写进条件；`逢00分開出的班次將停研究生宿舍一座`                               |
| `h`    |              2885 | [H 假日線](https://transport.cuhk.edu.hk/tc/route/h/)           | `逢00分開出的班次將停研究生宿舍一座及39區（上行）`                                                |
| `up`   |              3539 | [上行](https://transport.cuhk.edu.hk/tc/route/up/)              | 周一至五 08:30-17:30 加停大学保健医疗中心，公众/大学假期除外；显示车费 $5.5                       |
| `down` |              3565 | [下行](https://transport.cuhk.edu.hk/tc/route/down/)            | 周一至五 08:45-17:45 加停大学保健医疗中心，公众/大学假期除外；显示车费 $5.5                       |

因此合并数据时应把 `/route/1a/` 和 `/tc/route/1a/` 保存成同一个 `routeId=1a` 的两种 locale evidence，而不能生成两个 Route。

### 中文站名与条件是否有独立字段

站名有可直接读取的 localized title，但路线站序和条件没有公开的结构化 REST 字段：

- 英文 [stop REST index](https://transport.cuhk.edu.hk/wp-json/wp/v2/stop?per_page=100&_fields=id,slug,title,link) 与繁中 [stop REST index](https://transport.cuhk.edu.hk/tc/wp-json/wp/v2/stop?per_page=100&_fields=id,slug,title,link) 都返回 47 条记录，ID 与 slug 集合完全相同；繁中端的 `title.rendered` 是官方中文站名。
- 路线 REST record 的 `content.rendered` 为空、`acf` 为空；它不公开路线页面中的 stop list、方向或条件规则。
- 路线 HTML 把中文站名放在 `.route-stop-text`，把站点条件放在嵌套的 `.route-remarks`，把班次条件放在 `.rb-2-2`。这些是独立的本地化显示字符串，但不是 typed fields，也没有在 stop DOM 上附官方 stop ID。
- 因此应以相同 WordPress stop ID 连接中英文 `StopName`；路线页中文字仍需按名称匹配后人工复核，不能把 DOM 顺序或字符串本身当永久 ID。

几个容易混淆、但繁中 stop index 可以用稳定 ID 区分的例子：

| stopId              | 英文标题              | 官方繁中标题   |
| ------------------- | --------------------- | -------------- |
| `cuhk-wp-stop-2552` | Univ. Station         | 大學站         |
| `cuhk-wp-stop-2812` | Station Piazza        | 大學站廣場     |
| `cuhk-wp-stop-2943` | New Asia Circle       | 新亞坊         |
| `cuhk-wp-stop-2820` | New Asia College      | 新亞書院       |
| `cuhk-wp-stop-2939` | Area 39 (Upward)      | 39區（上行）   |
| `cuhk-wp-stop-3172` | Postgraduate Hall 1   | 研究生宿舍一座 |
| `cuhk-wp-stop-2967` | Residence No. 10      | 十苑           |
| `cuhk-wp-stop-3556` | Residences No.10 & 11 | 十、十一苑     |

这意味着 `merged.snapshot.json` 目前的英文 `nameEn` 不必通过翻译生成中文；后续可以直接按相同 official post ID 加 `nameZhHant`。不过当前繁中站点数据也保留源站自身的标点不一致，例如全角/半角括号，不应拿原字符串做主键。

### N/H 的 Area 39 语义

繁中页面把容易误读的图例语义表达得很清楚：39 区（上行）是 N 的常规站，但只是 H 的 00 分条件站。

- [N 晚間線](https://transport.cuhk.edu.hk/tc/route/n/) 无条件列出 `39區（上行）`；它没有 `.route-remarks`。N 的班次条件只说 00 分另加停研究生宿舍一座。
- 对应英文 [N Night Service](https://transport.cuhk.edu.hk/route/n/) 同样把 `Area 39 (Upward)` 列作无备注常规站，只给两个 `Postgraduate Hall 1` 添加 00 分备注。
- [H 假日線](https://transport.cuhk.edu.hk/tc/route/h/) 的 `39區（上行）` 和两个研究生宿舍站都带 00 分 `.route-remarks`；班次条件也明确说 00 分加停研究生宿舍一座及 39 区。英文 [H Holidays Service](https://transport.cuhk.edu.hk/route/h/) 语义相同。
- 当前 [NH.pdf](https://transport.cuhk.edu.hk/wp-content/uploads/documents/NH.pdf) 中，39 区站位于 N 路径上，同时以 `N5` 条件框标明 H 的 00 分班次加停。`N5` 只限定 H，不应反向解释为 N 不停。

英文与繁中页是同一 WordPress record 的两个视图，不能当作两票独立证据；但它们与当前 PDF、Bus Clock station arrays 在此处语义一致。数据应把 `[2939]` 保存为 N base pattern 的常规站，以及 H 的 `departureMinute = 0` 条件站。

## 12 条免费校巴的人工有向站序

以下站序以当前官方 PDF 的颜色、方向箭头、`First Stop` / `Last Stop` 图例为主证据，再用对应官方单路线页检查站点成员。方括号内数字是 `merged.snapshot.json` 中官方 stopId `cuhk-wp-stop-<数字>` 的后缀；同一站作为起点和终点时会重复同一 stopId。

[Bus Clock 固定版本的 `BusData.ts`](https://github.com/CCheukKa/CUHK-bus-clock/blob/575adc5475fc115001c30d9b5d5373384791c1f6/constants/BusData.ts) 只用于交叉核对。它的 station arrays 是项目常量，不是 GPS 到站真值；下述 `GPS rows` 也只表示该路线在公开 `bus-log.json` 中的记录数，不能证明完整站序。

### Shuttle.pdf，第 1 页

#### 1A Main Campus

- **有向站序**：`Univ. Station [2552]` → `Univ. Sports Centre [2546]` → `Sir Run Run Shaw Hall [2544]` → `Univ. Admin. Bldg. [2548]` → `S.H. Ho College [2550]` → `Univ. Station [2552]`。
- **变体/条件**：无条件站变体。
- **证据**：[Shuttle.pdf](https://transport.cuhk.edu.hk/wp-content/uploads/documents/Shuttle.pdf)，第 1 页黄色主校部线；[1A 路线页](https://transport.cuhk.edu.hk/route/1a/)。
- **HTML 交叉核对**：五个唯一站点全部存在；DOM 只出现一次 `Univ. Station`，PDF 的起终点符号确认它同时是起点和终点。
- **Bus Clock**：`1A` station array 与上列一致，仅名称展开不同；`40 GPS rows`。
- **置信度**：高。

#### 1B Main Campus

- **有向站序**：`Univ. Station [2552]` → `Postgraduate Hall 1 [3172]` → `Univ. Sports Centre [2546]` → `Sir Run Run Shaw Hall [2544]` → `Univ. Admin. Bldg. [2548]` → `S.H. Ho College [2550]` → `Postgraduate Hall 1 [3172]` → `Univ. Station [2552]`。
- **变体/条件**：官方规则是 00、30 分班次加停研究生宿舍一座；1B 本身只在 00、30 分发车，所以当前所有 1B 班次均采用上述双向加停站序，不另建不停车 base pattern。
- **证据**：[Shuttle.pdf](https://transport.cuhk.edu.hk/wp-content/uploads/documents/Shuttle.pdf)，第 1 页黄色主校部线及两个 `N1` 条件框；[1B 路线页](https://transport.cuhk.edu.hk/route/1b/)。
- **HTML 交叉核对**：页面把 `Postgraduate Hall 1` 列两次，其余成员齐全；与 PDF 的去程/回程两个 `N1` 位置一致。
- **Bus Clock**：`1B` station array 完全一致；`14 GPS rows`。
- **置信度**：高。

#### 2 NA / UC

- **基础有向站序（15、30 分发车）**：`Station Piazza [2812]` → `Univ. Sports Centre [2546]` → `Fung King Hey Bldg. [2814]` → `United College (Upward) [2816]` → `New Asia College [2820]` → `United College (Downward) [2818]` → `Univ. Admin. Bldg. [2548]` → `S.H. Ho College [2550]` → `Univ. Station [2552]`。
- **`2+` 条件站序（45、00 分发车）**：在 `Univ. Sports Centre` 与 `Fung King Hey Bldg.` 之间插入 `Sir Run Run Shaw Hall [2544]`。这是对官方“31 至 00 分开出的班次”在当前 00/15/30/45 发车集合上的求值。
- **证据**：[Shuttle.pdf](https://transport.cuhk.edu.hk/wp-content/uploads/documents/Shuttle.pdf)，第 1 页粉红线及 `N2` 条件框；[2 路线页](https://transport.cuhk.edu.hk/route/2/)。
- **HTML 交叉核对**：成员一致；页面视觉栏位把 `Station Piazza` 与 `Univ. Station` 拼进同一个候选，人工依据 PDF 拆为起点 `[2812]` 和终点 `[2552]`。
- **Bus Clock**：`2` / `2+` 两个 station arrays 与上述两种站序一致；`27 GPS rows`。
- **置信度**：高。

#### 3 Shaw

- **有向站序**：`Y.I.A.P. [2913]` → `Univ. Sports Centre [2546]` → `Science Centre [2916]` → `Fung King Hey Bldg. [2814]` → `Wu Yee Sun College (Upward) [2918]` → `Shaw College (Upward) [2920]` → `CW Chu College (Downward) [2832]` → `Residence No. 15 [2924]` → `U.C. Staff Residence [2830]` → `Chan Chun Ha Hostel [2828]` → `Shaw College (Downward) [2926]` → `Wu Yee Sun College (Downward) [2826]` → `Univ. Admin. Bldg. [2548]` → `S.H. Ho College [2550]` → `Station Piazza [2812]`。
- **变体/条件**：无条件站变体。
- **证据**：[Shuttle.pdf](https://transport.cuhk.edu.hk/wp-content/uploads/documents/Shuttle.pdf)，第 1 页绿色逸夫线；[3 路线页](https://transport.cuhk.edu.hk/route/3/)。
- **HTML 交叉核对**：成员一致；DOM 把 `Y.I.A.P.` 与 `Station Piazza` 拼进同一候选并错误偏向 `[2812]`，PDF 的起终点符号明确拆成 `[2913]` 起点和 `[2812]` 终点。
- **Bus Clock**：`3` station array 与上列一致；`19 GPS rows`。
- **置信度**：高。

#### 4 Campus Circuit

- **有向站序**：`Y.I.A.P. [2913]` → `Campus Circuit East (Upward) [2932]` → `CW Chu College (Upward) [2936]` → `Area 39 (Upward) [2939]` → `CW Chu College (Downward) [2832]` → `Residence No. 15 [2924]` → `U.C. Staff Residence [2830]` → `Chan Chun Ha Hostel [2828]` → `Shaw College (Downward) [2926]` → `Wu Yee Sun College (Downward) [2826]` → `New Asia College [2820]` → `United College (Downward) [2818]` → `Univ. Admin. Bldg. [2548]` → `S.H. Ho College [2550]` → `Univ. Station [2552]`。
- **变体/条件**：无条件站变体。
- **证据**：[Shuttle.pdf](https://transport.cuhk.edu.hk/wp-content/uploads/documents/Shuttle.pdf)，第 1 页橙色环回线；[4 路线页](https://transport.cuhk.edu.hk/route/4/)。
- **HTML 交叉核对**：成员一致；DOM 把 `Y.I.A.P.` 与 `Univ. Station` 合并成一个 review candidate，PDF 明确给出 `[2913]` 起点、`[2552]` 终点。
- **Bus Clock**：`4` station array 与上列一致；`5 GPS rows`，样本过少，只能作为弱核对。
- **置信度**：高（官方图）；Bus Clock 观测支持很弱。

#### 8 Western Campus

- **教学日有向站序**：`Area 39 (Upward) [2939]` → `CW Chu College (Downward) [2832]` → `U.C. Staff Residence [2830]` → `Chan Chun Ha Hostel [2828]` → `Shaw College (Downward) [2926]` → `Wu Yee Sun College (Downward) [2826]` → `Univ. Admin. Bldg. [2548]` → `Science Centre [2916]` → `New Asia Circle [2943]` → `United College (Downward) [2818]` → `Wu Yee Sun College (Upward) [2918]` → `Shaw College (Upward) [2920]` → `Area 39 (Downward) [2941]` → `Campus Circuit North [2949]` → `Campus Circuit East (Downward) [2947]` → `Univ. Station [2552]`。
- **非教学日 `8*` 站序**：前 15 站相同；末段以 `Station Piazza [2812]` → `Chung Chi Teaching Bldg. [2810]` 取代 `Univ. Station [2552]`。
- **证据**：[Shuttle.pdf](https://transport.cuhk.edu.hk/wp-content/uploads/documents/Shuttle.pdf)，第 1 页金色西部线、`N3` 虚线分支；[8 路线页](https://transport.cuhk.edu.hk/route/8/)。
- **HTML 交叉核对**：所有成员存在；最后一个视觉候选把 `Area 39 (Upward)` 和非教学日 `Chung Chi Teaching Bldg.` 拼在一起，人工以 PDF 的线路两端拆分。`Univ. Station`、`Station Piazza` 均正确带日型条件。
- **Bus Clock**：`8` / `8*` 两个 station arrays 与上述教学日/非教学日站序一致；`19 GPS rows`。
- **置信度**：高。

### NH.pdf，第 1 页

#### N Night Service

- **基础有向站序（15、30、45 分发车）**：`Univ. Station [2552]` → `Univ. Sports Centre [2546]` → `Sir Run Run Shaw Hall [2544]` → `New Asia Circle [2943]` → `United College (Downward) [2818]` → `Wu Yee Sun College (Upward) [2918]` → `Shaw College (Upward) [2920]` → `Area 39 (Upward) [2939]` → `CW Chu College (Downward) [2832]` → `Residence No. 15 [2924]` → `U.C. Staff Residence [2830]` → `Chan Chun Ha Hostel [2828]` → `Shaw College (Downward) [2926]` → `Wu Yee Sun College (Downward) [2826]` → `New Asia College [2820]` → `United College (Downward) [2818]` → `Univ. Admin. Bldg. [2548]` → `S.H. Ho College [2550]` → `Univ. Station [2552]`。
- **00 分 `N+` 站序**：基础站序中在起点后、终点前各插入一次 `Postgraduate Hall 1 [3172]`。
- **Area 39 判定**：`Area 39 (Upward) [2939]` 是 N 的常规站。PDF 的 `N5` 标注表达的是 H 的 00 分班次也会加停该站，不限制 N。
- **证据**：[NH.pdf](https://transport.cuhk.edu.hk/wp-content/uploads/documents/NH.pdf)，第 1 页浅紫 N 线与两个 `N4` 研究生宿舍条件框；[N 路线页](https://transport.cuhk.edu.hk/route/n/)。
- **HTML 交叉核对**：成员与条件一致；英文和繁中 N 页面都把 `[2939]` 列为无备注常规站，只给两个 `[3172]` 标 00 分条件。
- **Bus Clock**：`N` / `N+` 都把 `Area 39 (Upward)` 当作常规站，其余顺序及 `N+` 两次加停 `[3172]` 也与官方资料一致。仅 `1 GPS row`，所以观测覆盖很弱，但不影响官方站序判定。
- **置信度**：高（官方 PDF 与双语路线页一致）；Bus Clock GPS 支持很弱。

#### H Holidays Service

- **基础有向站序（20、40 分发车）**：`Univ. Station [2552]` → `Univ. Sports Centre [2546]` → `Sir Run Run Shaw Hall [2544]` → `New Asia Circle [2943]` → `United College (Downward) [2818]` → `Wu Yee Sun College (Upward) [2918]` → `Shaw College (Upward) [2920]` → `CW Chu College (Downward) [2832]` → `Residence No. 10 [2967]` → `Residence No. 15 [2924]` → `U.C. Staff Residence [2830]` → `Chan Chun Ha Hostel [2828]` → `Shaw College (Downward) [2926]` → `Wu Yee Sun College (Downward) [2826]` → `New Asia College [2820]` → `United College (Downward) [2818]` → `Univ. Admin. Bldg. [2548]` → `S.H. Ho College [2550]` → `Univ. Station [2552]`。
- **00 分 `H+` 站序**：在起点后、终点前各插入 `Postgraduate Hall 1 [3172]`，并在 `Shaw College (Upward)` 与 `CW Chu College (Downward)` 之间插入 `Area 39 (Upward) [2939]`。
- **证据**：[NH.pdf](https://transport.cuhk.edu.hk/wp-content/uploads/documents/NH.pdf)，第 1 页深紫 H 线、`N5` 条件框；[H 路线页](https://transport.cuhk.edu.hk/route/h/)。
- **HTML 交叉核对**：成员与条件一致；页面把 `[2939]`、两个 `[3172]` 标为 00 分班次条件站。视觉 DOM 次序不是行车次序，但成员和条件可复核。
- **Bus Clock**：`H` / `H+` station arrays 与上述两种站序一致；`20 GPS rows`。
- **置信度**：高。

### Meet-class.pdf，第 1 页

四条转堂线都只在教学日运行；非教学日、阅读周和大学假期整个 pattern 不生效。这是 service-calendar 条件，不是站点变体。

#### 5 Upward

- **有向站序**：`Chung Chi Teaching Bldg. [2810]` → `Univ. Sports Centre [2546]` → `Sir Run Run Shaw Hall [2544]` → `Fung King Hey Bldg. [2814]` → `United College (Upward) [2816]` → `New Asia College [2820]` → `Wu Yee Sun College (Upward) [2918]` → `Shaw College (Upward) [2920]` → `CW Chu College (Downward) [2832]`。
- **证据**：[Meet-class.pdf](https://transport.cuhk.edu.hk/wp-content/uploads/documents/Meet-class.pdf)，第 1 页浅蓝上行线；[5 路线页](https://transport.cuhk.edu.hk/route/5/)。
- **HTML 交叉核对**：成员一致；页面把起点 `[2810]` 和终点 `[2832]` 拼进同一个 review candidate，PDF 的起终点符号可明确拆分。
- **Bus Clock**：`5` 与 `5*` station arrays 相同，均与上列一致；星号未表达额外站序差异。`9 GPS rows`。
- **置信度**：高。

#### 6A Downward (CWC)

- **有向站序**：`CW Chu College (Downward) [2832]` → `U.C. Staff Residence [2830]` → `Chan Chun Ha Hostel [2828]` → `Wu Yee Sun College (Downward) [2826]` → `New Asia College [2820]` → `United College (Downward) [2818]` → `Univ. Admin. Bldg. [2548]` → `S.H. Ho College [2550]` → `Station Piazza [2812]` → `Chung Chi Teaching Bldg. [2810]`。
- **证据**：[Meet-class.pdf](https://transport.cuhk.edu.hk/wp-content/uploads/documents/Meet-class.pdf)，第 1 页绿色 6A 线；[6A 路线页](https://transport.cuhk.edu.hk/route/6a/)。
- **HTML 交叉核对**：成员一致；页面把起点 `[2832]` 和终点 `[2810]` 拼成同一个 review candidate，PDF 可拆分。
- **Bus Clock**：`6A` 与 `6A*` station arrays 相同，均与上列一致；`0 GPS rows`，只有常量交叉核对。
- **置信度**：高（官方图）；Bus Clock 无观测支持。

#### 6B Downward (NA / UC)

- **有向站序**：`New Asia College [2820]` → `United College (Downward) [2818]` → `Univ. Admin. Bldg. [2548]` → `S.H. Ho College [2550]` → `Station Piazza [2812]` → `Chung Chi Teaching Bldg. [2810]`。
- **证据**：[Meet-class.pdf](https://transport.cuhk.edu.hk/wp-content/uploads/documents/Meet-class.pdf)，第 1 页蓝色 6B 线；[6B 路线页](https://transport.cuhk.edu.hk/route/6b/)。
- **HTML 交叉核对**：成员一致；页面把 `[2820]` 和 `[2810]` 拼入一个 review candidate，PDF 明确它们分别是起点和终点。
- **Bus Clock**：`6B` station array 与上列一致；`0 GPS rows`。
- **置信度**：高（官方图）；Bus Clock 无观测支持。

#### 7 Downward (Shaw)

- **有向站序**：`Shaw College (Downward) [2926]` → `Wu Yee Sun College (Downward) [2826]` → `New Asia College [2820]` → `United College (Downward) [2818]` → `Univ. Admin. Bldg. [2548]` → `S.H. Ho College [2550]` → `Station Piazza [2812]` → `Chung Chi Teaching Bldg. [2810]`。
- **证据**：[Meet-class.pdf](https://transport.cuhk.edu.hk/wp-content/uploads/documents/Meet-class.pdf)，第 1 页灰色 7 线；[7 路线页](https://transport.cuhk.edu.hk/route/7/)。
- **HTML 交叉核对**：成员一致；页面把 `[2926]` 与 `[2810]` 拼成同一 review candidate，PDF 的起终点符号可拆分。
- **Bus Clock**：`7` 与 `7*` station arrays 相同，均与上列一致；`0 GPS rows`。
- **置信度**：高（官方图）；Bus Clock 无观测支持。

### 交叉核对摘要

| 路线 | 官方 PDF 与 route HTML 成员 | Bus Clock station array | GPS rows | 最终判断                                  |
| ---- | --------------------------- | ----------------------- | -------: | ----------------------------------------- |
| 1A   | 一致                        | 一致                    |       40 | 高置信度                                  |
| 1B   | 一致                        | 一致                    |       14 | 高置信度；当前所有班次均为双 PGH1 pattern |
| 2    | 一致，DOM 需拆起终点        | `2` / `2+` 一致         |       27 | 高置信度                                  |
| 3    | 一致，DOM 需拆起终点        | 一致                    |       19 | 高置信度                                  |
| 4    | 一致，DOM 需拆起终点        | 一致                    |        5 | 官方高置信度；GPS 很弱                    |
| 8    | 一致，DOM 需拆非教学日终点  | `8` / `8*` 一致         |       19 | 高置信度                                  |
| N    | 一致                        | `N` / `N+` 一致         |        1 | 官方高置信度；GPS 很弱                    |
| H    | 一致                        | `H` / `H+` 一致         |       20 | 高置信度                                  |
| 5    | 一致，DOM 需拆起终点        | `5` / `5*` 相同且一致   |        9 | 高置信度                                  |
| 6A   | 一致，DOM 需拆起终点        | `6A` / `6A*` 相同且一致 |        0 | 官方高置信度，无 GPS 支持                 |
| 6B   | 一致，DOM 需拆起终点        | 一致                    |        0 | 官方高置信度，无 GPS 支持                 |
| 7    | 一致，DOM 需拆起终点        | `7` / `7*` 相同且一致   |        0 | 官方高置信度，无 GPS 支持                 |

12 条路线的 Bus Clock 常量都与人工沿官方图得到的站序相符。这个一致性只能说明两份人工编码互相吻合，不能把 Bus Clock 常量提升为独立观测证据。

## 与用户提供的第三方 N/H 图比较

| 项目     | 用户截图                                              | CUHK 官方 N/H 图                                                      |
| -------- | ----------------------------------------------------- | --------------------------------------------------------------------- |
| 发布身份 | `@go_to_cuhk_by_bus` 第三方账号                       | CUHK 校徽与交通处标志                                                 |
| 布局     | 合并式地铁图，自定义字母站号                          | N/H 两条官方颜色路径、真实站名                                        |
| 发车规则 | 显示 N 19:00-23:30、H 08:20-23:20，与当前官网表面一致 | 同一规则，并明确服务日及公众假期                                      |
| 条件停站 | 通过自定义图例表达，语义需猜测                        | 明写 N4/N5：00 分班次分别加停哪些站                                   |
| 数据用途 | UX 灵感或人工交叉检查                                 | 路线、站序、服务规则的 source of record                               |
| 版本风险 | 截图本身无可验证生效日期                              | URL 可抓取、保存 hash 和抓取时间；不过当前 PDF 版面仍未写业务生效日期 |

## 建议的提取方式

1. 以四份官方 PDF 为路线拓扑主证据，并保存原文件 hash、抓取时间、页码和人工审阅人。
2. 以 14 个单路线页补充服务时间、发车分钟和条件文字；不要使用 DOM stop 出现次序。
3. 每条路线人工描一次有向 `StopSequence`，保留视觉证据定位（PDF URL、页码、颜色/路线号）。
4. 将条件站保存为规则，而不是复制成所有班次必停站，例如 `departureMinute = 0`、`dayType = nonTeaching`、`timeWindow`。
5. 图上没有逐站到站时间、经纬度或路段耗时；这些字段必须继续来自其他公开数据/模型，并始终标记为“预计”。

## 证据边界

- 本审计确认的是官网在审计日公开的页面和文件，不代表文件版面上的业务生效日期；当前 PDF 没有统一给出有效期。
- 视觉图足以人工复原路线，但自动图像/DOM 提取仍需逐线复核，尤其是组合图的交叉、同名上下行站和条件站。
- 用户截图中的发车规则与官方当前规则相符，不等于整张第三方图已逐站验证，也不构成其来源或许可证明。
