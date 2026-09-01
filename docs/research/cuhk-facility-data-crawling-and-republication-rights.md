# CUHK 官方设施资料的抓取、留存与再发布边界

Status: Research snapshot

Last verified: 2026-09-01

> 本文为产品与工程风险研究，不构成法律意见。结论只覆盖本文逐项核对的 CUHK 中央网站、Registration and Examinations Section（RES）、Office of Student Affairs（OSA）、University Medical Service Office（UMSO）公开页面及所链接的公开 feed。站点条款和响应头可随时改变。

## 结论

截至核对日期，没有在四组来源的目标页面、免责声明、隐私页、robots、sitemap 或公开 CMS 接口中找到 Creative Commons、开放数据或其他明确授权 CUpedia 定期抓取、长期保存原文并对公众再发布的许可。相反，CUHK 中央站、RES、OSA 和 UMSO 均显示 **All Rights Reserved**；它们的免责声明只说明资料可能改变并排除依赖责任，没有授予复制或再发布权。[CUHK 首页](https://www.cuhk.edu.hk/english/index.html)、[CUHK 免责声明](https://www.cuhk.edu.hk/english/disclaimer.html)、[RES 免责声明](https://www.res.cuhk.edu.hk/disclaimer/)、[OSA 游泳池页](https://www.osa.cuhk.edu.hk/campus-life/amenities/swimming-pool/)、[UMSO 免责声明](https://www.umso.cuhk.edu.hk/disclaimer/)

`robots.txt` 对目标公开页面没有设置禁止规则，因此低频、守规矩的抓取在技术层面没有被 robots 排除；但 Robots Exclusion Protocol 的规范明确说明 robots 规则不是访问授权，更不是版权许可。[RFC 9309](https://www.rfc-editor.org/rfc/rfc9309.html)

建议采用以下 fail-closed 边界：

| 行为                                                           | 未取得书面许可时的产品边界                                                          |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| 定期 GET 公开 HTML，用来发现变化                               | 可先在 shadow mode 低频运行；不绕过登录、401、403、验证码或限流；不自动发布         |
| 保存 URL、状态码、抓取时间、内容 hash、解析器版本              | 可以；这些资料不能还原网页正文                                                      |
| 长期保存完整 HTML、ICS、PDF、图片或截图                        | 不启用；解析完成即丢弃 response body                                                |
| 人工录入少量地点名、房号、地址、电话、开放时段等事实           | 可作为低风险首发边界；用 CUpedia 自己的数据结构和文字表达，并链接来源、显示核验时间 |
| 完整导入 RES 课室表、完整镜像日历事件或对外提供派生数据集/API  | 先取得来源单位书面许可；系统性复制可能涉及资料汇编的选择和编排                      |
| 自动把抓取差异发布到生产                                       | 先取得来源单位书面许可，再经过 shadow sync、字段白名单和回滚验证                    |
| 复制网页说明、医疗/预约指引段落、规章、图片、PDF、版式、校徽   | 不做；需要逐项授权时另行申请                                                        |
| 抓取或保存学生、预约、门诊、病历、症状、登录状态或其他个人资料 | 不做；不属于本产品的必要资料                                                        |

因此，**P0 可以先上线“人工核验的事实卡片 + 官方深链 + 只生成差异的抓取器”，但 RES 全量课室自动导入、OSA ICS 事件公开重放和 UMSO 指引自动改写不得在没有书面许可时自动发布。**

## 为什么“公开可访问”不等于“可以再发布”

CUHK Library 的官方版权说明将复制、向公众发放、在互联网上提供和改编列为版权拥有人的专有权，同时指出名称、标题、短语等低原创性内容通常不受版权保护；它也提醒，公开发表第三方版权内容时，若没有适用例外，应向版权拥有人取得许可。[CUHK Library Copyright Basics](https://www.lib.cuhk.edu.hk/en/research/copyright/basics/)、[Copyright in Research](https://www.lib.cuhk.edu.hk/en/research/copyright/research/)

香港知识产权署同样说明，版权保护意念的表达而不是意念本身，网上作品也受保护；只有取用作品的实质部分才可能构成侵权，而“实质”是质量而不只是数量。[Intellectual Property Department: What is Copyright](https://www.ipd.gov.hk/en/copyright/what-is-copyright/index.html) 官方资料亦把 data compilation 列为可能受版权保护的文学作品，因此“每一个开放时间都是事实”并不自然推出“可以把完整课室表或完整事件 feed 原样搬走”。[IP-intensive industries study](https://www.ipd.gov.hk/filemanager/ipd/en/content_161/Study-on-IP-Intensive-Industries-to-HK-Economy-e.pdf)

对 CUpedia 来说，稳妥的工程含义是：

- 单个名称、房号、楼层、容量、电话号码、日期和时段是低风险事实候选；
- 应重新归一化为自己的字段，不复制表格次序、标题层级、说明文字或视觉布局；
- 抽取越接近完整表格、完整日历或完整网页，越需要书面许可；
- 引用和链接是必要的来源说明，但引用本身不是使用许可；
- 非商业、学生项目或开源代码并不会自动取得复制和再发布权。

## 四组来源的逐项结果

### CUHK 中央网站

**权利与责任。** 中央首页显示 All Rights Reserved；免责声明表示内容可无预告改变，并不保证依赖后果；没有找到面向网站内容或校园设施数据的开放许可。[CUHK 首页](https://www.cuhk.edu.hk/english/index.html)、[免责声明](https://www.cuhk.edu.hk/english/disclaimer.html)

**隐私。** 中央隐私页表示网站会记录访客的 DNS 地址和访问页面，并链接至大学个人资料政策。大学政策要求可识别个人资料准确、安全并只用于收集目的，特别提到学生、职员和病人等资料主体。[CUHK Privacy Policy](https://www.cuhk.edu.hk/english/privacy.html)、[Protection of Personal Data](https://www.cuhk.edu.hk/policy/pdo/en/)

**robots 与 sitemap。** [中央 robots.txt](https://www.cuhk.edu.hk/robots.txt) 只禁止一个招生 JavaScript 路径，没有禁止目标设施 HTML；`/sitemap.xml` 与 `/wp-sitemap.xml` 在核对时返回 404。这个结果允许对已知公开 URL 做保守请求，但不适合用站点遍历来发现所有资料。

**可先做。** 对单个中央设施页人工整理地点名、地址、一般查询电话和官方 URL；显示“资料由 CUHK 提供”会造成官方背书误解，因此应使用“来源：CUHK 官方页面”而非“CUHK 授权/合作”。

**需要许可。** 批量复制中央 facilities/venues 表、说明文案、图片、建筑图、PDF、校徽或网站版式，以及把派生设施数据作为公开 API/下载资料提供。

**联系人。** 中央 [Contact Us](https://www.cuhk.edu.hk/english/contact.html) 把 Public Relations 联系列为 `cpr@cuhk.edu.hk`。CUHK Library Copyright Clearing Office 可在 `cco@lib.cuhk.edu.hk` 提供版权资讯和转介，但明确不是法律意见。[Copyright service](https://www.lib.cuhk.edu.hk/en/research/copyright/)

### RES 公用课室

**目标资料。** [List of Communal Classrooms](https://www.res.cuhk.edu.hk/teaching-timetable-classroom-booking/classroom-booking/list-of-communal-classrooms/) 是课室名称/编号、位置、容量、座位等资料的第一方来源。

**权利。** RES 页脚显示 All Rights Reserved；免责声明只排除资料变化与依赖责任，没有开放数据或再发布许可。[RES 免责声明](https://www.res.cuhk.edu.hk/disclaimer/)

**隐私。** RES 隐私声明针对学生资料，说明其会按香港个人资料法律管理和传递学生资料。P0 课室目录不需要任何学生记录，抓取器也不应访问 CUSIS、教学班名单、预约申请或登录后页面。[RES Privacy Policy Statement](https://www.res.cuhk.edu.hk/privacy-policy-statement/)

**robots/API/feed。** [RES robots.txt](https://www.res.cuhk.edu.hk/robots.txt) 禁止 `/wp-admin/`、允许 `admin-ajax.php` 并指向 [WordPress sitemap](https://www.res.cuhk.edu.hk/wp-sitemap.xml)，目标课室页不在禁止范围。核对时：

- 公开课室 HTML 返回 200；
- [WordPress REST 的课室查询](https://www.res.cuhk.edu.hk/wp-json/wp/v2/pages?slug=list-of-communal-classrooms) 返回 401；
- [RSS](https://www.res.cuhk.edu.hk/feed/) 返回 403；
- robots 所列 `wp-sitemap.xml` 返回 XML 内容，但 HTTP 状态为 404。

这些状态必须按原样尊重；不能改 User-Agent、模拟登录、调用内部 endpoint 或采取其他方式绕过 401/403。生产解析器只能使用已知的公开 HTML，不能把 REST 或 RSS 当作已获授权的稳定 API。

**未获许可时的上线边界。** 可以人工核验并展示有限的课室事实，或让抓取器只生成“页面发生变化”的内部提醒。**完整导入整张公用课室目录**会接近系统性复制一个资料汇编；在收到 RES 对字段、频率、留存和再发布的书面确认前，不自动发布全量结果。

**联系人。** [RES Contact Us](https://www.res.cuhk.edu.hk/contact-us/) 把课室事务联系人列为 `roombooking@cuhk.edu.hk`，一般查询为 `ugadmin@cuhk.edu.hk`。许可请求应首先发送给前者，并请其确认是否有权代表 Registry 批准数据再使用。

### OSA 大学游泳池

**目标资料。** [University Swimming Pool](https://www.osa.cuhk.edu.hk/campus-life/amenities/swimming-pool/) 提供常规开放时段、费用、容量、设施、资格、清洁安排和规则链接，并明确链接一个公开 Google Calendar 让访客查看最新安排。

**权利。** OSA 页脚显示 All Rights Reserved，并链接 CUHK 中央免责声明和隐私政策；没有找到 OSA 自己的开放数据、内容许可或 feed 再发布条款。

**robots/API/feed。** [OSA robots.txt](https://www.osa.cuhk.edu.hk/robots.txt) 禁止插件与管理路径、明确允许 uploads 和 admin-ajax；游泳池页不受禁止。公开 [sitemap index](https://www.osa.cuhk.edu.hk/sitemap_index.xml)、[RSS](https://www.osa.cuhk.edu.hk/feed/) 和 [游泳池 WordPress REST 记录](https://www.osa.cuhk.edu.hk/wp-json/wp/v2/pages?slug=swimming-pool&_fields=id,modified,link,slug,title,content) 技术上可读，但 endpoint 没有独立内容许可、稳定性承诺或版本合同；响应的 `Allow: GET` 只表示 HTTP 方法，`X-Robots-Tag: noindex` 只表达索引指示，两者都不表示可复制内容。

**Google Calendar。** OSA 页面链接的日历可由公开 [ICS feed](https://calendar.google.com/calendar/ical/swimmingpoolcuhk%40gmail.com/public/basic.ics) 订阅。Google 的官方说明表示公开日历可与其他应用同步或订阅，但没有因此把事件内容置于开放许可下。[Google Calendar: public calendars](https://support.google.com/calendar/answer/37083?hl=en) 若改用 Google Calendar API，Google API 条款还说明访问 API 内容不会取得内容所有权，且未经内容所有人或法律允许不得建立永久复制品或超出 cache header 留存。[Google APIs Terms](https://developers.google.com/terms)

核对时，公开 ICS 响应包含 `Cache-Control: no-cache, no-store, max-age=0, must-revalidate`。RFC 9111 对 `no-store` 的定义是缓存不得保存 response；因此即使公开订阅本身是预期用途，生产抓取器也不应把完整 ICS body 当作永久 snapshot 保存。[RFC 9111](https://www.rfc-editor.org/rfc/rfc9111.html)

**未获许可时的上线边界。** 可以人工发布游泳池名称、位置、常规开放时间、数字费用、容量和官方日历链接；可嵌入或跳转官方日历。抓取器可以在内存中读取 ICS 用于 shadow diff，但不长期保存原始 feed，不公开重放完整事件列表，也不自动发布由事件摘要推导的整池关闭/局部限制。

**需要许可。** 自动把 ICS 事件转换成 CUpedia 运营事件并对公众显示、保存 UID/摘要/描述的长期历史、公开派生 ICS/API，以及使用 OSA 图片或规章正文。许可还应确认 OSA 是否控制 `swimmingpoolcuhk@gmail.com` 并有权授权其日历内容。

**联系人。** [OSA Contact Us](https://www.osa.cuhk.edu.hk/about-osa/contact-us/) 把游泳池联系人列为 `aaas@cuhk.edu.hk`，OSA 一般邮箱为 `osa@cuhk.edu.hk`。

### UMSO 门诊与牙科

**目标资料。** [Medical Service](https://www.umso.cuhk.edu.hk/medical-service/)、[Dental Service](https://www.umso.cuhk.edu.hk/dental-service/) 及其子页提供地点、办公时间、电话、预约入口和操作说明。

**权利。** UMSO 页脚显示 All Rights Reserved；它的免责声明和隐私页沿用中央短文，没有开放数据或再发布授权。[UMSO 免责声明](https://www.umso.cuhk.edu.hk/disclaimer/)、[UMSO Privacy Policy](https://www.umso.cuhk.edu.hk/privacy-policy/)

**医疗资料。** UMSO 明确表示医疗资料严格保密，未经当事人同意不会向第三方披露。[Mission & Confidentiality](https://www.umso.cuhk.edu.hk/mission-confidentiality/) CUpedia 只需要单位级公开事实；不得进入登录后的预约系统，也不得收集病人身份、症状、病历、预约、资格判断、表单内容或 token。香港私隐专员公署亦提醒，网上公开可见的个人资料仍受资料保护法律约束，抓取方不能把公开可见当作无限制使用。[PCPD joint statement on data scraping](https://www.pcpd.org.hk/english/news_events/media_statements/press_20230825.html)

**robots/API/feed。** [UMSO robots.txt](https://www.umso.cuhk.edu.hk/robots.txt) 禁止 `/wp-admin/`、允许 `admin-ajax.php` 并列出 [sitemap](https://www.umso.cuhk.edu.hk/wp-sitemap.xml)。公开 HTML、[RSS](https://www.umso.cuhk.edu.hk/feed/) 和 [Medical Service WordPress REST 记录](https://www.umso.cuhk.edu.hk/wp-json/wp/v2/pages?slug=medical-service&_fields=id,modified,link,slug,title,content) 技术上可读，但没有 endpoint-specific license 或稳定 schema 承诺。只可使用公开、无需身份的入口，并在 401/403/429 时停止。

**未获许可时的上线边界。** 可以人工展示建筑/楼层、服务类型、办公时段、部门电话和官方预约链接；预约、闭门后安排或医疗处置只能写成非常短的事实提示并深链官方说明。不要复制医疗建议、紧急指引、预约步骤、FAQ 或费用表正文；不要让 CUpedia 的摘要看起来像医疗建议。

**需要许可。** 自动同步并公开发布 UMSO 的开放时间、电话、费用、预约规则或紧急安排；保存原始页面/PDF；翻译或改写完整操作指引；使用第三方牙科承办商 PDF。第三方 PDF 需要内容拥有人的单独许可，UMSO 同意不一定覆盖承办商内容。

**联系人。** [UMSO Contact Us](https://www.umso.cuhk.edu.hk/contact-us/) 列出一般行政邮箱 `umso@cuhk.edu.hk`、门诊 `umso-outpatient@cuhk.edu.hk` 和牙科 `umso-dental@cuhk.edu.hk`。权利许可先向 `umso@cuhk.edu.hk` 申请，服务邮箱用于字段正确性确认。

## 内容类型判定

下面是工程上的风险分层，不是对个案的法律裁断。

| 内容          | 例子                                               | 未获许可时如何处理                                             |
| ------------- | -------------------------------------------------- | -------------------------------------------------------------- |
| 短身份事实    | `LSK 301`、建筑中英文名、房号、楼层                | 可存 canonical fact；来源链接和核验时间必填                    |
| 数值/时间事实 | 容量、座位数、电话、费用金额、星期和开放区间       | 可独立结构化；不要照搬整张表的编排                             |
| 日期事件事实  | 关闭日期、起止时间、受影响区域                     | 人工核验后可存；不要复制公告标题/描述；ICS 自动发布需 OSA 许可 |
| 简短服务能力  | 门诊、牙科、游泳、热水淋浴                         | 用受控 capability code，不复制宣传说明                         |
| 资格/规则     | 谁可使用、证件、取消、恶劣天气安排                 | 只保留必要的简短事实摘要并链接；自动更新前人工批准             |
| 网页正文      | 设施介绍、办理步骤、FAQ、医疗/紧急指引             | 不复制；深链官方页面；需要展示较长内容时申请许可               |
| 视觉作品      | 图片、校徽、图标、地图、楼面图、PDF 排版、网页布局 | 不抓取或再发布；逐项授权                                       |
| 完整资料汇编  | 全量课室表、完整事件 feed、完整费用表              | 未获许可不公开镜像、不提供下载/API                             |
| 个人/医疗资料 | 姓名、邮箱、预约、病历、症状、登录状态             | 不采集、不落库、不写日志                                       |

## 原始快照与证据留存

先前设计假设“为审计永久保存 immutable raw snapshot”。在目前没有开放许可的情况下，这个假设应收窄：完整 HTML、PDF 或 ICS snapshot 本身是内容复制，不应因为它只放在后台就自动视为获准。

未获许可时，生产任务只保留：

```text
source_url
http_status
fetched_at
content_hash
content_length
parser_version
robots_checked_at
normalized_facts
field_locator_without_source_prose
```

`normalized_facts` 这里只指已落在上述“少量事实”首发边界内、经人工选择的字段；它不包括从 RES 全表或 OSA 全 feed 批量生成并留存的全部记录。

并遵守以下约束：

- response body 优先只在单次 job 的进程内存中存在；普通 HTML 如因解析器限制必须使用唯一临时文件，job 结束立即删除；带 `no-store` 的 OSA ICS 不落磁盘；
- logs、error monitoring 和 CI artifact 不记录 HTML、ICS、PDF body 或含参数的预约 URL；
- parser fixtures 使用人工制作的最小合成 HTML/ICS，不提交官方页面副本；
- 证据定位保存 selector/heading key/row key，不保存整段来源文字；
- 若某字段必须靠原文复核，审核员打开 canonical URL，不在 CUpedia 后台重放整页；
- `content_hash` 只能证明内容改变，不能证明旧值是什么；这是未获存档许可时有意接受的审计取舍。

如取得书面许可，再明确以下细节后才能启用原始快照：允许的媒体类型、保留期限、访问角色、是否可放在第三方云、加密和删除期限、是否可用于 parser fixture、许可撤回后的清除要求。OSA ICS 即使获 OSA 内容许可，也应同时处理 Google 响应的 `no-store` 指示。

## 抓取器运行边界

允许 shadow mode 不代表可以无限抓取。四个来源均没有公开 crawl quota 或 SLA，目标 HTML 也没有稳定 ETag/Last-Modified，因此缺省运行策略应保守：

1. 只抓白名单 canonical URL，不遍历整个站点。
2. 使用能识别 CUpedia 和联系邮箱的 User-Agent。
3. RES 课室目录、OSA 游泳池 HTML、UMSO 服务页最多每日一次；稳定静态页可降为每周。
4. OSA 日历在获准前不用于生产发布；shadow probe 最快每小时一次且单请求串行。
5. 每次执行前或至少每日缓存并重新核对对应 `robots.txt`；新 `Disallow` 立即停用 source。
6. 429 按 `Retry-After` 停止；401/403 不重试规避；连续 5xx 指数退避并通知人工。
7. 响应结构、记录数或关键字段异常时只产生告警；保持 last-known-good，不以空抓取删除事实。
8. 任何新 source、URL 范围、字段类型或公开用途都重新经过许可检查，不能把一个单位的同意扩张到另一个单位。

## 书面许可需要问清的问题

不要只问“我们可以爬吗”。应把以下内容写入同一封请求，让对方逐项明确：

1. 是否允许 CUpedia 以说明身份的自动化客户端定期读取列出的公开 URL；认可的最高频率和 User-Agent/contact 是什么？
2. 是否允许提取并公开再发布列明的字段：地点名、房号、楼层、容量、座位类型、开放/关闭时间、费用、部门电话、预约 URL？
3. 是否允许完整覆盖该来源的所有记录，还是只允许逐项事实；是否允许对外搜索、公开 API、CSV/JSON/ICS 下载？
4. 是否允许在私有云保存原始 HTML/PDF/ICS；允许多久、谁可访问、是否可用于测试或审计？
5. 是否允许把中英文资料归一化、翻译和用 CUpedia 自己的短文字呈现？
6. 需要什么 attribution、免责声明、更新时间和官方链接？可否使用 CUHK/单位名称；是否明确禁止校徽、图片或“官方合作”表述？
7. 哪些页面或文件含第三方权利，单位无权代为许可？特别是 Google Calendar 和承办商 PDF。
8. 资料变化或许可撤回时，对方用什么渠道通知；CUpedia 需要在多久内更新或删除？
9. 低风险字段可否在 shadow period 后自动发布；高风险字段是否必须逐次人工确认？
10. 同意由哪个职位/单位作出，是否可以保留书面回复作为长期运行依据？

建议分别发送：

| 范围                               | 主联系人                  | 抄送/咨询                                                           |
| ---------------------------------- | ------------------------- | ------------------------------------------------------------------- |
| CUHK 中央设施目录与总体权利        | `cpr@cuhk.edu.hk`         | `cco@lib.cuhk.edu.hk` 用于版权资讯/转介                             |
| RES 公用课室表                     | `roombooking@cuhk.edu.hk` | `ugadmin@cuhk.edu.hk`                                               |
| OSA 游泳池 HTML 与 Google Calendar | `aaas@cuhk.edu.hk`        | `osa@cuhk.edu.hk`                                                   |
| UMSO 门诊/牙科公开资料             | `umso@cuhk.edu.hk`        | `umso-outpatient@cuhk.edu.hk`、`umso-dental@cuhk.edu.hk` 仅核对事实 |

## 对 P0 的直接影响

### 可以先实现

- 来源注册、robots 检查、低频抓取和 hash change detection；
- 用合成 fixture 完成 parser/staging；真实 RES 全表和 OSA 全 feed 在许可前不落成批 extracted claims；
- 不保留 body 的 source observation；
- Campus Map 内人工核验的 Building/Floor/Place；
- 少量事实字段、官方链接、`verifiedAt`/`fetchedAt`、stale/unknown 状态；
- 预约按钮只跳转官方入口，不代理表单、不持有身份信息；
- 内容变化后停止自动发布并要求复核。

### 取得书面许可后才能打开

- RES 全量课室首次导入及定期字段更新；
- OSA ICS 转 Operational Event，并在卡片显示即将关闭/局部限制；
- UMSO 时间、电话、费用或办理规则的自动发布；
- 任何完整 raw snapshot、历史原文或官方数据导出；
- 由 crawler 直接合并生产 Changeset。

### 即使取得一般许可也不默认做

- 复制官方图片、校徽、PDF、网页布局或长段文字；
- 抓登录后的课室预约、门诊预约或可用名额；
- 保存个人、学生、病人或预约数据；
- 根据 UMSO 文字生成个性化医疗判断；
- 声称 CUpedia 是 CUHK 官方产品、合作方或获背书，除非许可明确这样写。

## 仍未验证或需要外部答复

- 没有收到 CUHK、RES、OSA 或 UMSO 对 CUpedia 的书面许可；本文不能替代许可。
- 没有找到四组目标来源的开放数据 licence 或正式 crawler/API terms；“未找到”不等于它们内部不存在。
- 尚未确认 `swimmingpoolcuhk@gmail.com` 的权利拥有者，以及 OSA 是否能授权其事件内容供第三方再发布。
- 尚未确认完整 RES 课室表在本案中是否构成受保护资料汇编；这是应交 CUHK 权利负责人或法律顾问判断的问题。
- 尚未获得允许的请求频率、服务窗口、联系人通知或 SLA；本文的频率只是保守工程建议。
- 尚未确认 CUpedia 与 CUHK 的组织关系会否影响内部使用许可；不能仅因开发者是 CUHK 学生就假定取得授权。
- 没有进入任何登录、表单或预约系统，也没有测试绕过限制；这些行为明确不在研究范围内。
- 没有为第三方牙科承办商 PDF、Google 平台内容或 CUHK 图片逐项查权；默认不接入。

## 核对方法

核对在 2026-09-01 以普通匿名 `GET`/header probe 完成，未登录、未提交表单、未绕过访问限制。检查了：

- 四组站点首页、目标设施页、免责声明、隐私页和联系页；
- `robots.txt`、标准 sitemap 路径、站点公开 sitemap；
- 目标 WordPress REST、RSS 和 OSA 公开 Google Calendar/ICS 的匿名状态与响应头；
- CUHK Library、香港知识产权署、香港个人资料私隐专员公署、IETF 和 Google 的一手说明。

建议在任何生产 crawler 首次启用以及条款、robots 或来源域名改变时，重新执行同一核对。
