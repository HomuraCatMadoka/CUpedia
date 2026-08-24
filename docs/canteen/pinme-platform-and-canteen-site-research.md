# PINME 平台与食堂网站合作调研

调查日期：2026-08-24（Asia/Hong_Kong）。本文补充
[`../cuhk-qr-ordering-research.md`](../cuhk-qr-ordering-research.md) 与
[`pinme-5198-5203-research.md`](pinme-5198-5203-research.md)，重点不是再次拆解前端
bundle 或菜单 API，而是从公开的一手资料理解 PINME 的产品、商户接入、基础设施与合作边界，
并把结论转换为“为没有网站的食堂建站”所需的访谈和交付清单。

本次只访问公开页面、应用商店资料、DNS 与标准 well-known 路径；没有登录商户控制台、提交
联系表单、创建订单、请求支付、扫描端口、枚举目录或尝试绕过访问控制。

## 结论

PINME 不是单纯的菜单网页供应商，而是以品牌—门店为中心的云端餐饮营运平台。官方公开的
能力覆盖 POS、电子餐牌、堂食扫码、自取/配送、会员 CRM、营销、排队/叫号、Kiosk、外卖平台
订单与菜单管理、经营报表，以及面向硬件或 ERP 的结构化数据输出。官方还明确宣传品牌自订
设计、多门店切换，以及在手机和 PC 上编辑餐牌。因此，现有 PINME 门店的网页只是整个商户
数据和交易系统的一个公开投影，不应被当成可自由复用的独立网站数据库。
[官方产品总览](https://www.pin2eat.com/)、[功能模块表](https://www.pin2eat.com/system-kit)

为没有网站的食堂建站是可行的，但应先把目标分成两层：

1. **信息与菜单层**：食堂授权我们发布名称、地点、营业时间、菜单、图片和公告；由食堂手工
   编辑、上传表格，或通过获授权的 POS 导出/API 自动同步。
2. **订单与付款层**：继续交给 PINME 或食堂指定的正式服务；新网站只使用获批准的深链跳转。
   除非另有正式商业与安全安排，不代理登录、会员、下单、优惠核验或支付。

当前没有找到 PINME 面向第三方开发者的公开 OpenAPI、webhook 文档、公开价目表或自助注册
流程。这不证明这些能力不存在，只说明不能把现有 H5 内部接口当成稳定合约。最优路径是由
食堂作为数据权利方牵头，向 PINME 申请菜单导出、只读 API/webhook、缓存许可和官方点餐深链。

## 可从公开一手资料确认的产品边界

### 1. 品牌、门店、菜单与渠道是独立维度

PINME 官方首页声称支持品牌自订页面、品牌首页与多门店切换，并允许通过手机或 PC 编辑餐牌；
功能模块表进一步列出品牌—门店报表、按早市/午市/下午茶/晚市/宵夜导出经营数据，以及不同
业务类型的统计。这与已观测到的 `store_id`、菜单组和服务时段相吻合，但官网没有公布正式
schema。[官方首页](https://www.pin2eat.com/)、[功能模块表](https://www.pin2eat.com/system-kit)

可据此采用以下**内部领域模型推断**，但字段名和关系仍需通过商户资料或正式接口确认：

```text
Brand
  -> Store / Outlet
       -> Service mode (dine-in / takeout / delivery / group order)
       -> Schedule / meal period
       -> Menu / menu group
            -> Category / group
                 -> Product
                      -> specification / add-on / set choice / price
       -> Order -> payment / kitchen / pickup status
       -> Customer / membership / promotion
```

这里能确认的是“这些概念和能力存在”；不能从公开营销页确认其数据库表结构、外键、事件模型、
ID 生命周期、删除规则或 API 兼容承诺。

### 2. 商户端不仅管理菜单，也参与现场履约

Google Play 上的 **PinMe POS**（包名 `com.pinme.pos`）由 One Two Go Co., Limited 发布，
开发者资料显示为 Pin Me Limited。应用说明列出分区餐桌状态、灵活菜品配置、快速落单和驱动
云打印机向厨房送单；商店页显示最近更新为 2022-11-01。开发者目录目前只列出这一款应用。
[Google Play 应用页](https://play.google.com/store/apps/details?id=com.pinme.pos)、
[开发者目录](https://play.google.com/store/apps/developer?id=One+Two+Go+Co.%2C+Limited)

这说明网站项目不能只问“菜单长什么样”，还要问菜单变更由谁发布、停售/售罄如何生效、厨房
如何接单、取餐状态由谁维护。应用商店上的“未收集/未共享数据”是开发者对该旧版手持 POS
应用的声明，不能外推为消费者 H5、会员系统或整个 PINME 后端的数据处理说明。

### 3. 订单、支付、外卖与外部系统是集成能力，不是公开接口承诺

PINME 的功能页声称：

- 一台 POS 可接收 Foodpanda、Deliveroo 等平台订单，并从后台集中管理平台餐牌、品项和价格；
- Kiosk 支持八达通 online/offline、Visa/Mastercard、Apple Pay、Alipay、WeChat Pay、银联及
  现金；
- 外部硬件接口可输出规格、加料、原料等结构化菜品数据；大型 ERP 对接可输出订单明细、菜品
  元数据、订单状态和支付数据。

来源：[外卖平台集成](https://www.pin2eat.com/sale/deliveryPlatform)、
[Kiosk 与支付](https://www.pin2eat.com/sale/kiosk)、
[功能模块表的外部接口部分](https://www.pin2eat.com/system-kit)。

因此可以合理推断 PINME 内部具备渠道映射和系统集成层，但官网没有给出开发者凭证申请、协议、
签名、速率限制、webhook 重试、版本或沙箱说明。是否能向独立食堂网站开放，只能由 PINME 和
商户书面确认。公开 H5 能正常使用也不等于内部接口获准被第三方持续抓取。

### 4. 公开基础设施只证明部署轮廓

Alibaba Cloud 的官方客户案例称，PINME 使用 ECS、ApsaraDB RDS、CloudMonitor、VPC、CDN
和 EIP 支撑其网站与业务系统，并讨论过负载均衡、键值数据库、消息队列和安全产品。它描述的
是案例发布时的架构，不保证 2026 年仍保持同一部署，也不能用于推断数据库入口或内部拓扑。
[Alibaba Cloud 官方客户案例](https://www.alibabacloud.com/customers/pin-me)

2026-08-24 对权威 DNS 的被动查询显示：

- `pin2eat.com` 有公开 A 记录；`www.pin2eat.com` 与 `meal.pin2eat.com` 均通过
  `*.w.kunlunsl.com` CNAME 分发，与使用 CDN 的官方案例一致；
- MX 指向 `mxbiz1.qq.com` / `mxbiz2.qq.com`，SPF 允许 `spf.mail.qq.com`；
- 本次查询没有得到 CAA 记录；猜测的 `merchant`、`admin`、`pos`、`api` 四个子域也没有
  DNS answer。后者只表示这些**具体名字**当时未解析，不代表不存在其他非公开或不同命名的系统。

复核命令（只读 DNS）：

```bash
dig @vip3.alidns.com +noall +answer pin2eat.com A
dig @vip3.alidns.com +noall +answer www.pin2eat.com CNAME
dig @vip3.alidns.com +noall +answer meal.pin2eat.com CNAME
dig @vip3.alidns.com +noall +answer pin2eat.com MX TXT CAA
```

公开 [`robots.txt`](https://www.pin2eat.com/robots.txt) 没有禁止抓取，并指向
[`sitemap.xml`](https://www.pin2eat.com/sitemap.xml)；这只是爬虫提示，不是数据授权或 API
许可。官网的 `/.well-known/security.txt` 返回 HTTP 404；点餐域相同路径虽然返回 HTTP 200，
业务 JSON 是 `code: 404, Page not found`，所以当前没有可用的标准安全披露联系人。
[官网 security.txt](https://www.pin2eat.com/.well-known/security.txt)、
[点餐域 security.txt](https://meal.pin2eat.com/.well-known/security.txt)

## 商户接入与正式联系路径

官网提供“免费获取 Demo”表单，要求称呼、手机号和电邮；也公布 Pin Me Limited 的
`info@pin2eat.com`、咨询电话 `+852 3529 2101`，以及销售顾问联系电话 `+852 6357 5034`。
首页宣传 7×16 小时专人支持、营运培训与 7×24 小时系统安全管理，但未公布 SLA 或价格。
[Demo/联系页](https://www.pin2eat.com/getdemo)、[关于 PinMe](https://www.pin2eat.com/about/)

如果合作对象已使用 PINME，建议由食堂在邮件中同时授权 PINME 与建站团队讨论以下事项：

1. 是否提供正式只读菜单 API、定期 CSV/Excel 导出或 webhook；
2. 稳定的 brand/store/menu/group/product/option ID 及其创建、合并、删除规则；
3. 响应覆盖的是完整餐牌还是当前销售窗口，停售、售罄、节假日和预售如何表达；
4. API 认证、测试环境、版本、速率限制、重试、数据保留与故障通知；
5. 菜单文字和图片的展示、缓存、裁切、翻译与署名许可；
6. 官方堂食/自取/配送深链及允许携带的参数，禁止自行构造的参数；
7. 餐厅停用 PINME 或更换 POS 时的数据导出、撤权与迁移流程；
8. 费用、实施时间、培训、支持时间、事故响应和责任边界。

官网 sitemap 确实列出 `/privacy-policy` 和 `/use-policy`，Google Play 又把应用隐私链接指向
`/privacy`；但本次抓取这些 URL 时只得到通用营销首页，没有取得可核验的具体条款正文。因此，
缓存菜单、展示图片、自动同步和品牌使用权都不应凭 URL 存在而假设获准，应在合作前索取当前
版本的适用条款、隐私政策和数据处理安排。[官网 sitemap](https://www.pin2eat.com/sitemap.xml)、
[隐私 URL](https://www.pin2eat.com/privacy-policy)、[使用条款 URL](https://www.pin2eat.com/use-policy)

## 为没有网站的食堂建站：需求访谈清单

### 权限与负责人

- 谁能代表食堂批准网站、域名、品牌、菜单和图片发布？大学/书院/承办商各自负责什么？
- 谁是日常菜单编辑、紧急下架、技术联系和最终验收人？人员变更后如何移交账号？
- 是否允许 CUpedia 托管，还是必须使用食堂/大学拥有的域名、代码仓库与云账号？

### 页面和内容

- 官方中英文名称、地址、地图点位、电话、无障碍路线、服务对象和公告是什么？
- 需要哪些语言；翻译由谁批准？菜品图、Logo、餐牌 PDF 的版权和使用期限属于谁？
- 是否要分别建立餐厅、茶社、档口等页面；同地点的多个 outlet 是否独立管理和结账？

### 菜单语义

- 每个菜品的稳定 ID、分类、规格、加料、套餐选择、价格、币种、服务费和最低消费是什么？
- 早餐/午餐/下午茶/晚餐/宵夜如何划分；按星期、学期、假期、考试期有哪些例外？
- “没有返回菜品”代表休息、未发布、接口故障还是售罄？何时才允许把旧菜品下架？
- 售罄、暂停供应、永久下架、价格待定分别如何表达？过敏原和饮食标签由谁负责确认？

### 更新和数据交换

- 餐牌来源是 PINME/POS、Excel、Google Sheet、邮件还是后台手工编辑？哪个是最终事实来源？
- 能否取得正式 API/export/webhook；若只能人工更新，可接受多久的延迟？
- 每次更新是否保留时间戳、来源、快照和审核记录；错误时沿用旧数据还是暂时隐藏？
- 谁负责监测同步失败、处理上游 ID 变化和确认异常价格？

### 点餐和履约

- 网站只展示信息，还是需要跳转堂食、自取、配送、排队或预订？每种模式的官方入口是什么？
- 是否允许深链到指定门店/模式；桌号、优惠、会员、订单和支付是否全部留在官方系统？
- 菜单展示价与结账价不一致时用什么提示；退款、取消、投诉由谁处理？

### 隐私、安全和运营

- 是否真的需要账号、电话、电邮、反馈表、分析 cookie 或营销订阅？可以不收集的就不收集。
- 若收集可识别资料，谁是 data user/controller、用途和保存期是什么，用户如何查阅、更正和删除？
- 域名、TLS、备份、管理员 MFA、审计日志、权限最小化、离职撤权和事故联系人如何配置？
- 上线前后支持窗口、可用性目标、预算、维护期限和退出/数据移交方案是什么？

香港个人资料私隐专员公署指出，若 cookie 可追踪可识别用户，就应按《个人资料（私隐）条例》
处理，并向用户说明收集类型、用途、是否必须及拒绝后果；不必要的可识别追踪不应默认收集。
这是建站最低限度的隐私设计提示，不是法律意见。[PCPD 官方 FAQ](https://www.pcpd.org.hk/english/faqs/faqs.html)

## 推荐交付路线

1. **先做无个人资料的展示版**：餐厅身份、地点、营业时间、公告、带来源时间的菜单快照和官方
   点餐跳转；不做账户、购物车、会员、支付和行为追踪。
2. **给食堂一个可维护的发布入口**：若无正式 POS 集成，先用受控 CMS/表格导入；每次发布保存
   snapshot、发布人、有效时段和回滚记录。不要把“网页抓到了什么”当成食堂授权的数据源。
3. **自动化只接正式边界**：取得 PINME 或其他 POS 的书面许可与技术文档后，再增加只读同步；
   adapter 只负责 provider DTO 到内部菜单模型，交易仍回到官方系统。
4. **按 outlet 建模**：同一地点的餐厅、茶社和档口可以共享地点信息，但菜单、时段、更新责任和
   点餐入口分别管理。
5. **上线前双重验收**：食堂验内容和业务规则；技术方验可访问性、移动端、失效链接、陈旧提示、
   权限、备份和故障回退。

## 事实、推断与未知汇总

| 结论                                              | 状态                 | 依据或下一步                                     |
| ------------------------------------------------- | -------------------- | ------------------------------------------------ |
| PINME 是包含 POS、菜单、CRM、履约和报表的餐饮平台 | 已确认               | 官方首页、功能模块表、Google Play 商户端应用     |
| 支持品牌定制、多门店和多业务模式                  | 已确认               | 官方首页和功能模块表                             |
| 与 Foodpanda/Deliveroo 等及多种支付方式集成       | 已确认其公开产品声明 | 具体门店是否启用仍需逐店确认                     |
| 有结构化硬件/ERP 对接能力                         | 已确认其公开产品声明 | 未找到公开第三方 API 合约                        |
| 当前公开服务使用 Alibaba Cloud/CDN                | 部分确认             | 官方客户案例 + 当前 CNAME；案例架构可能已变化    |
| 内部领域大致是品牌→门店→时段/渠道→菜单→商品→订单  | 合理推断             | 产品能力和现有只读观测一致，不等于正式 schema    |
| 可以合法持续抓取内部 H5 API 并转载菜单/图片       | 未知                 | 必须向餐厅和 PINME 取得许可、条款和速率边界      |
| PINME 可为第三方网站提供 API/webhook/沙箱         | 未知                 | 官网未找到公开开发者文档；通过授权商户询问       |
| 官方隐私/使用条款的具体内容                       | 未验证               | URL 存在，但本次只返回通用营销内容；索取现行文本 |
| 没有 PINME 的食堂也能上线网站                     | 可行                 | 先采用食堂授权的 CMS/表格发布，订单功能另行评估  |
