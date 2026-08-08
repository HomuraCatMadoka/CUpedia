# CUHK 校巴公开数据调研（2024-08-08 至 2026-08-08）

## 结论

CUHK 已公开足以支持“今天还有哪些**计划班次**”的基础资料，但不足以支持“车辆现在在哪里”或“准确还有多久到站”。交通处网站提供路线、站序、服务时段、每小时发车分钟、服务状态和临时通告；教务处校历可补足教学日、阅读周与大学假期。未找到 CUHK 官方公开的 GTFS、GTFS-Realtime、车辆 GPS、逐站预计到站（ETA）或相应 API。官方 CUHK Mobile 的说明也只承诺 `Shuttle bus schedule`，没有承诺实时车辆或 ETA。[交通处首页](https://transport.cuhk.edu.hk/) [CUHK Mobile 服务说明](https://www.itsc.cuhk.edu.hk/all-it/phone-mobile/cuhk-mobile/)

因此产品可以可信地展示“官方计划发车时间”和“官方服务状态/临时变更”，但不可将由时刻表加固定行车时间算出的结果称为实时 ETA。若要展示推算，应明确标为“计划时间/约”，并与官方动态状态分层。

本报告只使用 CUHK 第一方公开来源；调查窗口为香港时间 2024-08-08 至 2026-08-08（含首尾两日），同时比较 2024–25 与 2025–26 两个学年。网页与端点最后核对于 2026-08-08。

## 官方数据面

### 1. 交通处路线网页：今天服务的主要结构化来源

交通处首页把服务分成四类：普通穿梭校巴、转堂校巴、收费穿梭小巴和职员自组上下班巴士。普通及转堂校巴明确只供 CUHK 学生和职员；CUHK 面向访客的官方说明则引导访客乘收费小巴。[校园交通说明](https://www.cuhk.edu.hk/english/campus/campus-transportation.html) [交通处首页](https://transport.cuhk.edu.hk/)

截至 2026-08-08，公开路线如下。表内为计划发车，并非逐站时刻或 ETA。

| 服务     | 路线                | 服务日与时段                                     | 每小时发车分钟                   | 关键例外                                                             |
| -------- | ------------------- | ------------------------------------------------ | -------------------------------- | -------------------------------------------------------------------- |
| 普通校巴 | 1A Main Campus      | 周一至六 07:40–18:50；公众假期停开               | 10、20、40、50                   | 学生/职员专用；站序见路线页                                          |
| 普通校巴 | 1B Main Campus      | 周一至六 08:00–18:30；公众假期停开               | 00、30                           | 两班均停 PGH1                                                        |
| 普通校巴 | 2 NA/UC             | 周一至六 07:45–18:45；公众假期停开               | 00、15、30、45                   | 31–00 分发车的班次经邵逸夫堂                                         |
| 普通校巴 | 3 Shaw              | 周一至六 09:00–18:40；公众假期停开               | 00、20、40                       | —                                                                    |
| 普通校巴 | 4 Campus Circuit    | 周一至六 07:30–18:50；公众假期停开               | 10、30、50                       | —                                                                    |
| 普通校巴 | 8 Western Campus    | 周一至六 07:40–18:40；公众假期停开               | 00、20、40                       | 非教学日改停大学站广场及崇基教学楼，不停大学站                       |
| 晚间校巴 | N                   | 周一至六 19:00–23:30；周日及公众假期停开         | 00、15、30、45                   | 00 分班次停 PGH1                                                     |
| 假日校巴 | H                   | 周日及公众假期 08:20–23:20                       | 00、20、40                       | 00 分班次停 PGH1 与 39 区                                            |
| 转堂校巴 | 5 Upward            | 教学日；周一至五 09:18–17:26，周六至 13:26       | 18、22、26                       | 非教学日、阅读周、大学假期停开                                       |
| 转堂校巴 | 6A Downward (CWC)   | 教学日；周一至五 09:10–17:10，周六至 13:10       | 10                               | 同上                                                                 |
| 转堂校巴 | 6B Downward (NA/UC) | 教学日；仅周一至五 12:20–17:20                   | 20                               | 同上                                                                 |
| 转堂校巴 | 7 Downward (Shaw)   | 教学日；周一至五 08:18–17:50，周六至 13:18       | 18、50                           | 同上                                                                 |
| 收费小巴 | Up                  | 周一至日及公众假期 08:30–23:00                   | 00、30                           | 周一至五 08:30–17:30（公众/大学假期除外）加停大学保健处；收费 HK$5.5 |
| 收费小巴 | Down                | 周一至六 07:00–08:15；周日及公众假期 08:45–21:15 | 前者 00、15、30、45；后者 15、45 | 周一至五 08:45–17:45（公众/大学假期除外）加停大学保健处；收费 HK$5.5 |

来源：[1A](https://transport.cuhk.edu.hk/route/1a/)、[1B](https://transport.cuhk.edu.hk/route/1b/)、[2](https://transport.cuhk.edu.hk/route/2/)、[3](https://transport.cuhk.edu.hk/route/3/)、[4](https://transport.cuhk.edu.hk/route/4/)、[8](https://transport.cuhk.edu.hk/route/8/)、[N](https://transport.cuhk.edu.hk/route/n/)、[H](https://transport.cuhk.edu.hk/route/h/)、[5](https://transport.cuhk.edu.hk/route/5/)、[6A](https://transport.cuhk.edu.hk/route/6a/)、[6B](https://transport.cuhk.edu.hk/route/6b/)、[7](https://transport.cuhk.edu.hk/route/7/)、[收费小巴 Up](https://transport.cuhk.edu.hk/route/up/)、[收费小巴 Down](https://transport.cuhk.edu.hk/route/down/)。

每个路线页都提供有序站名，但没有各站经纬度或逐站到达时间。交通处还公开一个 WordPress REST API：[`/wp-json/wp/v2/route`](https://transport.cuhk.edu.hk/wp-json/wp/v2/route?per_page=100) 返回路线 id、slug、标题、创建/修改时间等；[`/wp-json/wp/v2/stop`](https://transport.cuhk.edu.hk/wp-json/wp/v2/stop?per_page=100) 返回站点 id、slug 和英文标题。不过路线时段、分钟、站序等关键自定义字段没有出现在 REST 响应的 `content`/`meta`，仍需解析服务端 HTML。它是可机器读取的公开 WordPress 接口，但不是稳定承诺的交通数据 API。

路线页的四种状态为 Normal Service、Service Delay、Service Suspension、Non-Service Hours。页面没有给出状态的更新时间、原因、有效期限或结构化状态端点；因此状态可作为官方运营提示，但需要连同抓取时间保存，不应被当作可重放的完整事件流。

### 2. 下载 PDF：适合人工核对，不适合作唯一数据源

首页链接四份现行 PDF：[周一至六普通校巴](https://transport.cuhk.edu.hk/wp-content/uploads/documents/Shuttle.pdf)、[晚间及假日校巴](https://transport.cuhk.edu.hk/wp-content/uploads/documents/NH.pdf)、[转堂校巴](https://transport.cuhk.edu.hk/wp-content/uploads/documents/Meet-class.pdf)、[收费穿梭小巴](https://transport.cuhk.edu.hk/wp-content/uploads/documents/PSLB_2025.pdf)。前三份包含可抽取文本，收费小巴 PDF 为图像式页面，机器读取需要 OCR。

历史文件没有正式索引，但 2024–25 的三份 PDF 仍可通过带学年后缀的 URL 获取：[Shuttle_24-25.pdf](https://transport.cuhk.edu.hk/wp-content/uploads/documents/Shuttle_24-25.pdf)、[NH_24-25.pdf](https://transport.cuhk.edu.hk/wp-content/uploads/documents/NH_24-25.pdf)、[Meet-class_24-25.pdf](https://transport.cuhk.edu.hk/wp-content/uploads/documents/Meet-class_24-25.pdf)。其 PDF 元数据及 HTTP `Last-Modified` 均为 2024-10-30；文件内分别标注 2024-09-03、2024-08-26、2024-09-02 生效。现行三份 PDF 的创建/修改日期为 2026-02-03/04，HTTP `Last-Modified` 为 2026-02-04，却不再在版面标出生效日期。

逐字比较显示，2024–25 与 2026 版的路线、站序、服务时段和发车分钟没有实质变化；唯一与当天判断直接相关的变化是转堂校巴说明从“非教学日及大学假期停开”变成“非教学日、**阅读周**及大学假期停开”。这说明年度资料高度稳定，但仍会出现服务日语义更新，不能只复制旧表。

PDF URL 与路线页有重复数据，却没有版本号、校验和或机器可读生效区间。建议以路线 HTML 为当前基线，以 PDF 做人工交叉核对和视觉证据；不要让不带生效日期的现行 PDF 自动覆盖已验证记录。

### 3. 教学日、阅读周与假期

转堂校巴和路线 8 依赖“教学日/非教学日”，交通处本身没有发布一个可查询的服务日历。CUHK 教务处校历是最合适的第一方补充源。

- 2025–26 本科第一学期为 2025-09-01 至 2025-11-29，第二学期为 2026-01-05 至 2026-04-18，阅读周为 2026-03-02 至 2026-03-07。[2025–26 本科教学学期](https://www.res.cuhk.edu.hk/general-information/almanac/university-almanac-2025-26/full-time-undergraduate-programmes-teaching-terms/)
- 教务处另有阅读周公告，明确本科课程停课，但研究生课程继续；与此同时，交通处现行转堂校巴 PDF 明确阅读周全部停开。因此巴士服务判断应服从交通处的交通专门规则，而不是从“仍有研究生课程”推导转堂巴士运行。[阅读周公告](https://www.res.cuhk.edu.hk/announcement/reading-week-2-march-7-march-2026/) [转堂校巴 PDF](https://transport.cuhk.edu.hk/wp-content/uploads/documents/Meet-class.pdf)
- 2024–25 与 2025–26 的研究生校历亦可下载，但它明确只是大部分研究生课程的一般日期，并允许个别课程有不同安排，不能单独决定转堂巴士。[2024–25 研究生校历](https://www.gs.cuhk.edu.hk/download/UniversityAlmanac202425.pdf) [2025–26 研究生校历](https://www.gs.cuhk.edu.hk/download/UniversityAlmanac202526.pdf)

“今天”引擎因此需要独立建模公众假期、大学假期、普通教学日、阅读周和特殊停课日；不要把一个布尔 `isTeachingDay` 同时代表所有课程和所有巴士。

### 4. 临时变更与恶劣天气

交通处的 [What’s New](https://transport.cuhk.edu.hk/whats-new/) 在调查窗口内保留了大量临时迁站、停站、改道、延误、活动交通安排和承办商变更记录。记录的显示日期通常是事件/生效日期，而 WordPress REST 的 `date` 是文章发布时间，两者可能不同。例如 2026-08-08 的 University Station 临时迁站文章在 REST 中的发布时间为 2026-08-07；系统必须分开保存 `published_at`、`effective_from`、`effective_to` 与 `marked_completed_at`。

这些通告通常只有标题与一张海报图；WordPress REST 的 `content` 为空，详情（影响路线、确切时间、临时站位图）嵌在 JPEG/PNG 中。旧通告常在标题加 `(Completed)`，但未提供统一结构化状态。故可以自动发现新文章，却不能仅靠 REST 正确应用覆盖规则；需要 OCR 后人工复核，或人工录入结构化影响范围，并保存原图 URL。

恶劣天气规则直接出现在每个路线页：八号或以上风球/极端情况/黑雨在上课或办公前生效时，所有服务暂停；在运行期间生效时，转堂巴士停止，普通校巴/收费小巴按页面规则维持或再运行一小时；警告解除后一小时有限度恢复，且以实际情况许可为前提。[交通处路线页天气规则](https://transport.cuhk.edu.hk/route/1a/)

更新频率不是固定批次：窗口内有同日与临近活动才发布的通告，也有事件结束后把标题改为 Completed 的修改。要支持今日服务，应在服务日内轮询首页、What’s New 和路线状态，而不是只在每学期开学导入一次。

### 5. 职员限制

普通及转堂校巴不是“仅职员”，而是学生和职员专用；官方首页说明交通处职员可要求查看有效 CUHK 身份证明。收费小巴则面向访客。[交通处首页](https://transport.cuhk.edu.hk/) [校园交通说明](https://www.cuhk.edu.hk/english/campus/campus-transportation.html)

真正的“职员自组上下班巴士”是另一类服务，其公开页只显示“仅 CUHK 职员可访问”，要求登录后才能看到详情。[职员自组巴士](https://transport.cuhk.edu.hk/staff-self-arranged-bus-service/) 因此匿名产品最多应展示“职员专用、详情须登录官方系统”的标识和官方链接，不应抓取、缓存或猜测受保护的路线与班次。

## 实时车辆与 ETA：证据结论

没有找到 CUHK 官方公开的车辆位置或 ETA 数据。支持这一结论的可观察证据是：

1. 交通处路线页只给始发时段、每小时分钟、站序和四态服务标签，没有车辆、经纬度、逐站时间或 ETA 字段。[交通处路线页](https://transport.cuhk.edu.hk/route/1a/)
2. 公开 WordPress REST 类型包含 `route`、`stop`、`newsdetails`，但没有车辆/旅程更新类型；官方前端脚本也未见轮询位置或 ETA 的公开端点。[WordPress 类型目录](https://transport.cuhk.edu.hk/wp-json/wp/v2/types)
3. CUHK Mobile 的官方功能清单只称“Shuttle bus schedule”。[CUHK Mobile](https://www.itsc.cuhk.edu.hk/all-it/phone-mobile/cuhk-mobile/)
4. CUHK Campus Map 明示地图信息不是实时更新；它可作为站点位置的人工参考，但不能证明车辆实时性。[CUHK Campus Map](https://www.cuhk.edu.hk/english/campus/cuhk-campus-map.html?area=shuttle+bus)

这是“截至核对日未发现公开证据”，不是断言校方内部没有 GPS/调度系统。若产品需要真实 ETA，应向交通处/承办商取得书面授权和有 SLA 的数据接口；在此之前只能显示官方计划发车和状态。

## 数据格式、稳定性、历史与使用约束

| 来源                          | 格式 / 机器可读性                           | 更新与历史                                                 | 主要风险                                           |
| ----------------------------- | ------------------------------------------- | ---------------------------------------------------------- | -------------------------------------------------- |
| 路线 HTML                     | 半结构化 HTML；可解析时段、分钟、站序、状态 | 原 URL 稳定，内容就地修改；REST 有 `modified` 时间         | 自定义字段未进 REST；HTML 模板会变；状态无时间戳   |
| WordPress `route`/`stop` REST | JSON；标识、slug、标题、修改时间可直接读    | 当前对象可列举；无版本历史                                 | 非正式交通 API；关键路线字段缺失；英文站名为主     |
| PDF                           | 三份文本型，一份图像型                      | 2024–25 文件仍在线，但无正式历史索引；现行文件覆盖稳定 URL | 现行版无生效日期；表格解析脆弱；图像 PDF 需 OCR    |
| What’s New / `newsdetails`    | 列表与 JSON 元数据可读；详情多为图片        | 2024–2026 历史保留较好，Completed 通过后续编辑标识         | 有效区间与影响路线不结构化；发布日期和显示日期不同 |
| 教务处校历                    | HTML/PDF                                    | 每学年发布并可能更新                                       | 不等于交通服务日历；课程类别存在差异               |
| Campus Map                    | 交互网页                                    | 当前快照                                                   | 官方明示非实时；未发现稳定站点开放 API             |

`robots.txt` 只禁止 `/wp-admin/`，允许公开站点与 `admin-ajax.php`，并给出 sitemap；这不等同于授予内容再发布许可。[robots.txt](https://transport.cuhk.edu.hk/robots.txt) 网站页脚声明 CUHK 版权所有，官方 disclaimer 表示内容可不经通知更改，CUHK 不对因使用或依赖信息造成的损失负责。[Disclaimer](https://transport.cuhk.edu.hk/disclaimer/) 在批量抓取或对外再发布前，应向 CUHK 取得许可或确认可接受使用方式；产品应保留来源链接、抓取时间和“以官方最新公告为准”，避免复制通告图片作为自有内容。

## 已观察到的不一致与缺口

1. **生效日期倒退**：2024–25 PDF 有明确生效日期；2026 现行 PDF 没有。HTTP/PDF 修改时间只能证明文件更新，不能替代业务生效区间。
2. **同一事实多份表示**：路线 HTML、现行 PDF、历史 PDF 和 Campus Map 重复路线/站点；没有官方声明哪一份是 canonical，也没有同步版本号。
3. **阅读周语义变化**：2024–25 转堂 PDF 未单列阅读周，现行版单列停开；教务处又说明研究生课程阅读周继续。交通服务应以交通处专门规则优先。
4. **非教学日会改变路线而非只停运**：路线 8 在非教学日更换大学站相关停站，说明服务日规则必须能覆盖 stop pattern。
5. **通告事件日与发布时间不同**：What’s New 的显示日期不能直接当发布时间；REST `date` 也不能直接当生效日。
6. **通告正文不可直接解析**：标题可机器读，但精确影响通常在图片中；Completed 只是可变标题，不是强类型状态。
7. **站名并非稳定位置标识**：官方 REST 给出独立 stop id/slug，但没有坐标；同一地点还有 Upward、Downward、PSLB 等方向/服务变体。接入 campus-map 时应以自有稳定 `Place ID`/`Stop ID` 映射，而不是按显示名合并。

## “今日服务”来源优先级

对香港自然日生成结果时，建议按以下顺序求值，并把每层的来源和核对时间展示/保存：

1. **当天官方临时通告与路线页的 Delay/Suspension 状态**：可覆盖站序、时段或整线服务；图片详情须人工验证后才能结构化应用。
2. **交通处恶劣天气规则 + 当天有效官方警告**：决定全面/局部暂停及有限恢复。未确认恢复前不可仅按“警告已解除”恢复计划班次。
3. **交通处路线 HTML**：当前计划时段、发车分钟、站序、身份限制的主要来源。
4. **交通处现行 PDF**：用于交叉核对路线图和整体时刻；与 HTML 冲突时先标记为待核实，不静默选择。
5. **教务处当学年校历**：只用于计算教学日、阅读周、大学/公众假期，并按交通处规则转换为服务模式。
6. **历史 PDF**：只用于审计、变化检测和缺失恢复，不用于覆盖当前服务。

结果应区分三种置信层级：`official_override`（官方通告/状态）、`official_schedule`（官方计划）、`derived`（由日期、时刻或步行/行车假设推算）。没有 `vehicle_position` 或 `official_eta` 来源时，界面不得出现“实时到站”。末班车后显示“今日服务已结束”，不要自动把明天班次称为今天。

## 对后续方案的直接约束

- MVP 可实现：今天有效路线、始发计划时间、站序、身份标签、临时变更、来源与更新时间。
- MVP 不应承诺：逐站准确到站、实时车辆地图、拥堵感知 ETA。
- 摄取应保留原始快照和内容 hash；HTML/PDF/通告分别建来源记录，不能只保存最终解析值。
- 交通站点应有独立稳定 id，并允许多个方向/服务站点映射到同一 campus-map `Place ID`；坐标需要另行核实和授权。
- 通告解析在没有官方结构化源之前应采用“自动发现 + OCR 草稿 + 人工确认”的发布门槛。
- 应向 CUHK 交通处提出一次正式数据请求，重点询问：可授权的站点坐标、正式服务日历、通告 feed、路线状态含义/更新时间，以及是否存在可供公众或合作项目使用的 AVL/ETA 接口。
