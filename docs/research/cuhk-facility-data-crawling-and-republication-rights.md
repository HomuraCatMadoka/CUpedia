# CUHK 官方设施资料的抓取、留存与再发布边界

Status: Research snapshot

Last verified: 2026-09-02 (Asia/Hong_Kong)

> 本文是产品和工程风险研究，不构成法律意见。结论只覆盖本文列出的 CUHK 中央网站、Registration and Examinations Section（RES）、Office of Student Affairs（OSA）和 University Medical Service Office（UMSO）公开页面。网站内容、条款和 `robots.txt` 都可能改变。

## 一句话结论

**不用把“先取得书面许可”设为 P0 上线门槛。** 截至 2026-09-02，没有在目标页面、其页脚所链接的免责声明/隐私页或四个站点的 `robots.txt` 中找到“必须先取得书面许可才可低频读取公开页面”或禁止自动抓取这些目标路径的条款。CUpedia 可以直接做一个保守的 **no-permission mode**：管理员手动、低频读取白名单公开 URL，只保存和展示少量重新组织的事实，附官方来源和核验时间，并在发布前人工确认。

这不等于“网页内容随便复制”。香港知识产权署说明，版权保护作品的表达而非背后的意念或资料，同时网上作品仍受版权保护；版权拥有者有复制和向公众分发作品的专有权，是否取用了作品的“实质部分”看质量而不只看数量。[香港知识产权署：What is Copyright（网页修订日期 2025-08-20；核对于 2026-09-02）](https://www.ipd.gov.hk/en/copyright/what-is-copyright/index.html) 《版权条例》第 4(1)(a) 条也把因内容选择或编排构成智力创作的数据汇编（包括表格）纳入文学作品定义，第 22、23 条涵盖复制作品整体或实质部分以及以电子方式储存。[香港法例第 528 章《版权条例》（现行官方法例入口；核对于 2026-09-02）](https://www.elegislation.gov.hk/hk/cap528!en)

因此，本文的边界是：

- 可以读取公开、无需登录的页面，并抽取房号、楼层、开放时段、公共电话和官方链接等事实；
- 不复制网页正文、图片、地图、PDF、说明步骤、表格版式或完整日历事件；
- 不把 RES 页面原样做成镜像、CSV/API 或可下载的替代资料库；
- 一旦 CUHK 明确反对、目标路径被 `robots.txt` 禁止、服务返回 401/403/429/验证码，立即停止，而不是绕过；
- 如果以后要镜像完整内容、自动发布复杂规则、保存原始快照或提供批量数据下载，再取得书面许可或法律意见。

## 为什么原先的“必须申请”判断过严

原先研究正确发现四组页面没有 Creative Commons 或开放数据许可，但把“没有开放许可”直接推成了“任何抓取和事实展示都要先申请书面许可”。中间少了一步：**访问网页**、**复制作品**和**重新表达事实**是三个不同问题。

| 问题                          | 本次核对结果                                                                                                                                             | 对 CUpedia 的意思                                                                                 |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| 能否访问                      | 目标 URL 都能以匿名 `GET` 返回公开页面；目标路径未被对应 `robots.txt` 禁止（2026-09-02 实测）                                                            | 可以低频读取；不能绕过登录、拒绝或技术限制                                                        |
| 是否有禁止 crawler 的网站条款 | 目标页面只找到免责声明、隐私政策和版权页脚；没有找到适用于这些目标页面的 crawler、scraping、bulk download 或 prior written permission 条款（2026-09-02） | 没有发现一条会把书面许可变成当前 P0 硬门槛的站点规则；以后仍要复查                                |
| 能否复制网页                  | “All Rights Reserved” 和香港版权规则仍覆盖有原创性的正文、图片、版式以及可能有原创选择/编排的资料汇编                                                    | 不保存或重发这些内容；署名和链接不能代替许可                                                      |
| 能否使用事实                  | 香港知识产权署把“表达”与背后的意念/资料区分开；单个设施事实本身通常不像一段说明文字那样有表达性                                                          | 抽取后用自己的字段和 UI 呈现，风险明显低于复制网页                                                |
| 能否全量搬表                  | 完整 RES 课室表可能涉及受保护的选择/编排；“实质部分”没有固定百分比                                                                                       | 导航用的最小课室索引可以先做，但不保留来源顺序/布局，不提供镜像或批量导出；全量再分发仍有不确定性 |

“All Rights Reserved” 是对可受版权保护内容的权利声明，不等于页面上的每个数字或地点事实都变成专有资料，也不等于另行写出了一条禁止机器人访问的合同条款。香港知识产权署也明确区分资料本身与其受版权保护的表达形式。反过来，标注“来源：CUHK”不会自动让复制正文合法。[香港知识产权署版权说明（核对于 2026-09-02）](https://www.ipd.gov.hk/en/copyright/what-is-copyright/index.html)、[香港知识产权署：Trade Secrets（核对于 2026-09-02）](https://www.ipd.gov.hk/en/ip-overview/trade-secrets/index.html)

## 访问、robots 与法律边界

### 本次站点检查

以下都是 2026-09-02 以普通匿名请求核对的结果：

| 来源        | 公开目标                                                                                                                                       | robots 结果                                                                                                                       | 发现的页面规则                                                                                                                            |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| CUHK 中央站 | [CUHK 首页](https://www.cuhk.edu.hk/english/index.html)                                                                                        | [中央 `robots.txt`](https://www.cuhk.edu.hk/robots.txt) 只禁止 `/english/admissions/style/ejs.js`                                 | [中央免责声明](https://www.cuhk.edu.hk/english/disclaimer.html) 只说内容可变及排除依赖责任；页脚显示 All Rights Reserved                  |
| RES         | [List of Communal Classrooms](https://www.res.cuhk.edu.hk/teaching-timetable-classroom-booking/classroom-booking/list-of-communal-classrooms/) | [RES `robots.txt`](https://www.res.cuhk.edu.hk/robots.txt) 禁止 `/wp-admin/`，允许 `admin-ajax.php`；课室页未被禁止               | [RES 免责声明](https://www.res.cuhk.edu.hk/disclaimer/) 只说内容可变及排除依赖责任；页脚显示 All Rights Reserved                          |
| OSA         | [University Swimming Pool](https://www.osa.cuhk.edu.hk/campus-life/amenities/swimming-pool/)                                                   | [OSA `robots.txt`](https://www.osa.cuhk.edu.hk/robots.txt) 禁止插件与管理路径、允许 uploads 和 `admin-ajax.php`；游泳池页未被禁止 | 目标页链接中央免责声明/隐私政策，页脚显示 All Rights Reserved；没有找到 crawler 专项条款                                                  |
| UMSO        | [Medical Service](https://www.umso.cuhk.edu.hk/medical-service/) 与 [Dental Service](https://www.umso.cuhk.edu.hk/dental-service/)             | [UMSO `robots.txt`](https://www.umso.cuhk.edu.hk/robots.txt) 禁止 `/wp-admin/`、允许 `admin-ajax.php`；两项服务页未被禁止         | [UMSO 免责声明 URL](https://www.umso.cuhk.edu.hk/disclaimer/) 跳转到中央免责声明；页脚显示 All Rights Reserved；没有找到 crawler 专项条款 |

`robots.txt` 必须遵守，但它不是法律许可。Robots Exclusion Protocol 的正式规范明确说，robots 规则不是 access authorization。[IETF RFC 9309，第 1 节，2022-09；核对于 2026-09-02](https://www.rfc-editor.org/rfc/rfc9309.html#section-1)

香港政府的信息安全页面把《电讯条例》第 27A 条的“以电讯方式未经授权取用电脑”列为电脑相关罪行。[香港政府 InfoSec：Related Ordinances（核对于 2026-09-02）](https://www.infosec.gov.hk/en/useful-resources/related-ordinances) 本次研究没有找到香港官方资料直接裁定“访问一个无登录、无阻挡的公开网页是否当然属于获授权访问”，所以不作这个法律结论。工程上采用清楚的安全线：只请求网站主动公开的 canonical URL；任何拒绝、身份门槛或反机器人挑战都视为没有授权继续。

### 页面公开不代表内容开放许可

[CUHK 中央免责声明（核对于 2026-09-02）](https://www.cuhk.edu.hk/english/disclaimer.html)和 [RES 免责声明（核对于 2026-09-02）](https://www.res.cuhk.edu.hk/disclaimer/)没有授予复制权，但也没有写抓取禁令。OSA、UMSO 目标页同样没有开放许可。正确结论不是“绝对允许”或“绝对禁止”，而是：

- 对匿名公开页面做少量、低频读取，没有发现必须先获得书面许可的明确网站条件；
- 对有原创性的网页内容做复制和公开传播，仍需许可、法定例外或其他法律依据；
- 抽取少量事实并用自己的模型重新表达，和复制原作品不是同一种行为；
- 完整资料汇编是否、以及多大程度受保护，最终是事实和法律问题，本文不能保证零风险。

搜索时会找到 CUHK 其他系统自己的 Terms of Use，但不能把某个独立系统的条款自动套到 RES、OSA 或 UMSO。例如 [CUHK ITSC Web Hosting Service Policy（核对于 2026-09-02）](https://www.itsc.cuhk.edu.hk/it-policies/itsc-policy-for-web-hosting-service/)约束使用 CUHK 托管服务的网站负责人；CUPro、CUPIS 等系统也各有自己的入口和用途。本次判断只依据目标来源实际展示或链接的规则；如果目标来源以后新增专项条款，就重新判断。

## 版权：事实、表达和资料汇编怎么分

下面是工程风险分层，不是个案法律裁决。

| 内容          | 例子                                               | no-permission mode                                         |
| ------------- | -------------------------------------------------- | ---------------------------------------------------------- |
| 地点身份事实  | 建筑短名、课室编号、楼层、设施名称                 | 可保存为自己的 canonical 字段；附来源和核验时间            |
| 数值/时段事实 | 座位数、座位类型、公共电话、星期、开关门时间       | 可结构化；UI 使用自己生成的标签，不照搬表格或句子          |
| 公共操作链接  | 官方地图、官方预约入口、官方最新安排页             | 保存 canonical URL，按钮明确写“前往官方网站”               |
| 简短服务事实  | 门诊、牙科、泳池                                   | 使用自己的受控枚举；不复制宣传或医疗说明                   |
| 规则和步骤    | 入场资格、预约流程、恶劣天气安排、紧急医疗指引     | 默认不抽取；只链接官方页面。确需展示时人工写极短提示并复核 |
| 日期事件汇编  | Google Calendar/ICS 的全部活动、关闭事件标题和说明 | P0 不抓、不重放、不保存完整 feed                           |
| 网页表达      | 介绍、FAQ、段落、表格标题/次序、翻译、说明文字     | 不保存或再发布                                             |
| 视觉作品      | 图片、校徽、地图、楼层图、PDF 和网页布局           | 不抓取或再发布                                             |
| 完整资料镜像  | 原样课室表、完整费用表、CSV/JSON/API 下载          | 不提供；若产品以后需要，先申请许可或法律复核               |
| 个人/医疗资料 | 姓名、学号、电邮、预约、病历、症状、token          | 不访问、不采集、不落库、不写日志                           |

香港知识产权署说明，网上作品也受版权保护；只有取用作品的实质部分才构成相关侵权判断，而“实质”看质量而不只看数量。[香港知识产权署：What is Copyright（修订日期 2025-08-20；核对于 2026-09-02）](https://www.ipd.gov.hk/en/copyright/what-is-copyright/index.html) 香港官方 IP 平台说明，文学、戏剧、音乐或艺术作品须有原创性，即作品源自作者而非照抄其他作品。[香港区域知识产权贸易中心：Requirements for copyright（核对于 2026-09-02）](https://www.ip.gov.hk/en/types-of-ip/copyright/requirements-for-copyright/index.html)

对 RES 来说，最大的不确定性不是一个房号，而是“把官方列出的所有课室作为一个完整集合搬走”是否取用了该汇编的实质部分。no-permission mode 因此只做学生导航所需的重新组织索引，不复制原顺序、分组、备注或样式，也暂不提供批量下载。若将来要把完整目录作为独立数据产品、公开 API 或定期数据转售/再授权，书面许可就有实际意义。

## 可直接运行的 no-permission mode

### 1. 运行方式

- 后台只有管理员可触发；P0 不设 cron。
- 每个来源默认每 30 天最多成功检查一次；管理员因纠错强制重跑时必须填写原因。
- 每个来源只请求经过审核的 canonical URL，不从 sitemap 遍历站点，也不跟随页面去批量发现新内容。
- 每个 host 串行请求，并为客户端使用可识别的 `User-Agent` 和联系地址。
- 请求设置短超时；支持时使用条件请求。没有公开配额不代表可以高频请求。
- 401、403、429、验证码、新登录要求或新 `robots.txt` 禁止立即停止；不换 User-Agent、代理或 endpoint 规避。
- 5xx、超时或解析异常保留 last-known-good，标记来源检查失败；绝不把一次空结果当成删除全部资料。

### 2. 允许落库的最小字段

```text
source_id
source_url
source_owner                 # CUHK / RES / OSA / UMSO
robots_checked_at
fetched_at
http_status
content_hash                 # 只用于判断页面是否变化
parser_version

place_name_zh / place_name_en
building_name_zh / building_name_en
floor
room_code
capacity                     # RES 可选
seat_type                    # RES 可选、自己的枚举
service_type                 # 自己的枚举，例如 outpatient / dental / pool
public_phone
regular_hours                # 结构化 weekday + open/close
official_map_url
official_action_url
verified_at
publication_status           # draft / approved / stale
```

字段中不保存来源段落、HTML 片段、CSS selector 附近原文或可复原整页的 JSON。`content_hash` 只能说明页面变了，不能重建旧网页；这是刻意接受的审计取舍。

### 3. 三个来源实际怎么接

#### RES 课室

读取 [List of Communal Classrooms（核对于 2026-09-02）](https://www.res.cuhk.edu.hk/teaching-timetable-classroom-booking/classroom-booking/list-of-communal-classrooms/) 的单一公开 HTML 页面，生成 Building → 可选 Floor → Classroom 的导航索引。

允许保存课室短名/编号、建筑、楼层，以及确有产品用途时的容量和座位类型。解析后按 CUpedia 自己的建筑和课室 ID 组织，不保留官方表格顺序、学院分组、脚注、说明文字或链接文案；前台不提供“下载完整 RES 表”。因为这仍会覆盖许多记录，三项来源中它的汇编风险最高，应保留快速下架开关，并把来源异议视为立即暂停信号。

这只适用于静态课室清单，不代表可以抓任何 RES 系统。公开教学时间表入口目前带 CAPTCHA；no-permission mode 不访问、不自动填写也不尝试绕过该入口。[RES Public Teaching Timetable（核对于 2026-09-02）](https://rgsntl.rgs.cuhk.edu.hk/rws_prd_applx2/Public/tt_dsp_timetable.aspx)

#### OSA 游泳池

读取 [University Swimming Pool（核对于 2026-09-02）](https://www.osa.cuhk.edu.hk/campus-life/amenities/swimming-pool/) 的公开页面，只保存泳池名称、地点、常规每周开放时段和“查看最新安排”的官方 URL。

P0 不抓 Google Calendar/ICS，不复制入场资格、清洁通知、规则、费用说明或网页图片，也不把日历事件自动变成“今日开放/关闭”。页面变化后进入草稿，由管理员比对官网再批准。

#### UMSO 保健处

读取 [Medical Service（核对于 2026-09-02）](https://www.umso.cuhk.edu.hk/medical-service/)与 [Dental Service（核对于 2026-09-02）](https://www.umso.cuhk.edu.hk/dental-service/) 的公开页面，只保存保健处建筑/楼层、门诊和牙科服务类型、公共查询电话、常规办公时段和官方预约入口。

前台按钮跳转官方预约入口，不代理预约，也不复制预约步骤、费用表、FAQ、紧急/医疗指引。CUpedia 的卡片必须看起来像地点导航和服务入口，而不是医疗建议。UMSO 说明医疗资料会被严格保密；这进一步支持完全避开登录系统和个人数据。[UMSO Mission & Confidentiality（核对于 2026-09-02）](https://www.umso.cuhk.edu.hk/mission-confidentiality/)

### 4. 发布流程

```text
管理员点击检查
  → 核对 robots 与公开访问状态
  → 临时读取页面并解析白名单事实
  → 立即丢弃 response body
  → 生成字段级 diff 草稿
  → 管理员打开官方页面复核
  → 批准后发布；否则维持旧数据并标记 stale
```

前台每张卡显示：

- `来源：CUHK RES / OSA / UMSO`；
- 可点击的官方页面；
- `最近核验：YYYY-MM-DD`；
- `CUpedia 为非官方学生平台`；
- 超过预设期限未复核时显示“资料可能已更新”，不猜测当前开放状态。

署名的作用是让用户追溯来源和避免官方背书误解，不是版权许可。

### 5. 原始响应与日志

未取得另行许可时，HTML response body 只在单次任务内存中存在，解析后丢弃。生产、CI 和错误监控均不得保存完整 HTML、PDF、图片、ICS、页面截图或带敏感参数的预约 URL。解析器测试使用手工制作的最小 fixture，不提交 CUHK 网页副本。

日志只保留：

```text
source_url
http_status
fetched_at
content_hash
content_length
parser_version
normalized_diff_without_source_prose
```

## 个人资料不是本功能的数据源

这些设施卡不需要个人资料。香港个人资料私隐专员公署指出，公开可见的个人资料仍受资料保护法律约束，批量抓取个人资料会产生身份欺诈、定向攻击等风险。[PCPD：Data Scraping on Social Media Raises Concerns，发布于 2023-08-25；核对于 2026-09-02](https://www.pcpd.org.hk/english/news_events/media_statements/press_20230825.html)

因此 crawler 不进入 CUSIS、课室预约、门诊/牙科预约或任何登录页面，不收集学生、职员、病人或预约资料，不提交表单，也不把 URL query、cookie 或 token 写入日志。公开部门电话属于单位联系资料；个人姓名、个人直线电话或个人电邮默认不抓。

## 什么时候书面许可仍然有意义

书面许可不是这个最小 P0 的前置门槛，但在以下扩张场景能实际降低风险并明确双方预期：

- 原样或近乎完整地复制 RES 课室表、费用表或其他资料汇编；
- 提供 CSV、JSON、ICS、公开 API 或批量下载；
- 抓取并重放 OSA Google Calendar 的完整事件；
- 保存 HTML/PDF/ICS 原始历史快照或把官方内容当 parser fixture；
- 复制、翻译或改写较长说明、医疗/紧急指引、FAQ；
- 使用图片、地图、楼层图、校徽或网站视觉；
- 取消人工审核，让 crawler 自动改生产资料；
- 显著提高频率、扩大 URL 范围或商业化/向第三方再授权数据。

若未来进入这些范围，可分别联系 [RES Contact Us（核对于 2026-09-02）](https://www.res.cuhk.edu.hk/contact-us/) 所列 `roombooking@cuhk.edu.hk`、[OSA Contact Us（核对于 2026-09-02）](https://www.osa.cuhk.edu.hk/about-osa/contact-us/) 所列泳池联系人，以及 [UMSO Contact Us（核对于 2026-09-02）](https://www.umso.cuhk.edu.hk/contact-us/) 所列 `umso@cuhk.edu.hk`。申请的意义是授权更广的复制/发布和约定频率、字段、留存、署名及撤回方式，不是为了给普通公开事实“办许可证”。

## 停止与下架条件

发生以下任一情况，来源立即进入 paused，现有事实标记 stale，并交人工处理：

1. 对方书面要求停止或下架；
2. `robots.txt` 新增适用 `Disallow`；
3. 目标出现登录、验证码、401、403 或持续 429；
4. 新页面条款明确禁止相关自动访问或再使用；
5. 解析器无法证明字段仍来自原来的标题/表格位置；
6. 来源开始包含个人资料或第三方作品；
7. 请求造成异常负载或 CUHK 联系 CUpedia 反映运营影响。

删除、改名或空页面都先作为待审差异，不自动删除生产数据。管理员确认后才更新或下架。

## 仍然不确定的地方

- 没有香港法院或 CUHK 权利负责人对 CUpedia 这个具体做法给出判断；本文不能承诺零法律风险。
- 没有找到目标页面的开放数据许可，也没有找到适用于这些目标页的 crawler 专项条款；“没有找到”不代表以后不会新增或存在未链接文件。
- 完整 RES 课室集合是否构成受保护汇编、导航索引覆盖全部房间时是否取用了其实质部分，需要结合具体选择/编排和产品呈现判断。
- 公开、无认证的网页请求在《电讯条例》第 27A 条下如何被法院定性，不在已核对的一手资料中得到直接答案；因此本方案绝不穿越任何拒绝或技术门槛。
- 本文没有判断第三方牙科承办商资料、Google Calendar 内容、CUHK 图片、地图或楼层图的权利；no-permission mode 一律不接入它们。
- 没有公开 crawl quota 或服务级别承诺；“每月一次、管理员触发”是保守产品选择，不是 CUHK 批准的额度。

## 研究方法与最终产品判断

2026-09-02 使用匿名 `GET` 和页面阅读核对了四组目标页、免责声明、隐私/保密说明和 `robots.txt`；没有登录、提交表单、遍历隐藏 endpoint 或测试绕过。法律部分只引用香港官方法例/政府/监管机构资料和 IETF 标准。

最终产品判断是：**直接抓，但保持小、慢、透明、可停。** P0 不应等待许可邮件；应实现管理员手动检查、每月级频率、事实字段白名单、来源链接、人工发布和一键暂停。把书面许可留给“完整复制、自动发布、长期存档、批量导出或使用创作性内容”这些真正需要扩大权利边界的阶段。
