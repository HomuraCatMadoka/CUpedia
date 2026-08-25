# 餐饮供应商黑盒协议与合作边界调研

调查日期：2026-08-24（Asia/Hong_Kong）。对象为 PINME、Aigens、iCHEF、
Qmai。本文补充：

- [`../cuhk-qr-ordering-research.md`](../cuhk-qr-ordering-research.md)
- [`ichef-guest-ordering.md`](../ichef-guest-ordering.md)
- [`pinme-platform-and-canteen-site-research.md`](pinme-platform-and-canteen-site-research.md)
- [`ORDERING-SOURCE-DESIGN.md`](ORDERING-SOURCE-DESIGN.md)

## 范围与证据等级

本轮仅使用供应商官网、官方帮助中心、官方条款、官方安全白皮书、官方应用商店资料、
正常顾客页面会调用的公开只读接口，以及仓库已有的只读观测。没有进行端口扫描、目录爆破、
登录绕过、凭证测试、GraphQL introspection、批量限流压测或订单、支付、领券等写操作。

证据分三级：

- **已确认**：官方资料明确声明，或正常公开流程可以重复观测；
- **合理推断**：多个公开 DTO、引用关系和客户端行为共同支持，但不是供应商承诺；
- **未知**：需要合同、商户后台、正式 API 文档、沙箱或供应商书面确认。

所谓“数据库结构”只指领域关系推断。除 Qmai 官方白皮书披露的基础设施轮廓外，没有取得任何
供应商的真实表名、DDL、数据库连接或生产数据访问权限。

## 总结

四家的消费者前端都不是完整主数据的直接镜像。菜单通常是品牌、门店、服务模式、营业窗口、
渠道、库存和商户发布配置共同产生的投影。仅解析一个接口的所有数组，会把“候选目录”“当前
菜单”“推荐分组”和“可下单商品”混为一谈；#732 与 #733 正是这类建模错误的实例。

四家都存在正式集成能力的公开迹象，但开放程度不同：Aigens 明确宣传 Open API；iCHEF 公布了
ERP API、stage endpoint、版本记录和多种主动导出方案；Qmai 白皮书确认第三方应用使用独立密钥；
PINME 宣传硬件/ERP 结构化输出。它们都不等于 CUpedia 已取得调用、缓存或转载授权。

## Provider 对比

| Provider | 公开身份                                               | 顾客菜单形态                                      | 正式集成证据                                                       | 当前最大未知                                                 |
| -------- | ------------------------------------------------------ | ------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------ |
| Aigens   | store、menu、period、category/group、`backendId`       | 当前门店、模式和菜单上下文的投影                  | 官网明确列出 Open API、POS/PMS/ERP/支付整合                        | CUHK 合同适用的 API、SLA、ID 生命周期和内容许可              |
| iCHEF    | restaurant public ID、menu/category/item snapshot UUID | `menuHoursSnapshot` 引用 category snapshot        | 官方 API/ERP 文档、stage endpoint、版本记录、JSON/CSV/FTP/API 导出 | 顾客 GraphQL 是否属于获支持集成接口及 snapshot UUID 生命周期 |
| PINME    | store、`menu_group`、group、`product_id`               | `menu_group` 选择 broad group pool 的当前页面投影 | 官网宣传 ERP/硬件结构化输出                                        | 正式 API、版本、授权、拓扑及商品 ID 保证                     |
| Qmai     | seller/owner、multi-store、category、`goodsId`/SKU     | `buyTime` 决定的点时菜单                          | 白皮书确认开放平台应用独立密钥                                     | 公开合作文档、时段覆盖、goods ID 生命周期和香港合同边界      |

## HTTP / GraphQL route inventory

前一版结论集中在数据模型和合作边界，没有把已经从 bundle 调用点、动态只读观测和 adapter
确认的 route 汇总到同一张协议表。这会造成一个误解：好像只分析了页面和 GET，没有分析网站通过
POST 读取菜单、建立匿名上下文或计算报价的接口。实际上，**HTTP POST 不等于业务 mutation**：四家
前端都使用 POST 承载查询或计算；是否有副作用必须根据 operation、调用点、响应实体和后续状态变化
共同判断。

本文使用五种状态分类：

- **read-only query**：读取门店、菜单、营业窗口、库存展示或活动详情；
- **session bootstrap**：取得临时 token 或初始化/恢复点餐上下文，可能产生短期服务端状态，但不创建订单；
- **quote computation**：按购物车、会员和优惠输入计算服务端报价，不创建订单，但输入可能含个人或会员上下文；
- **transaction orchestration**：要求已有订单或支付上下文，可能创建支付会话、返回支付跳转或推进交易；
- **mutation**：创建/修改 session、购物车、会员、优惠、订单、支付或退款状态。

下面的“静态 bundle”只证明当前版本存在调用点；“动态只读”表示正常顾客页面或有界脚本曾读取；
“adapter”表示当前 CUpedia 生产代码实际依赖；“官方文档”才可能构成受支持的合作接口证据。带 hash
的前端 bundle 和未公开网页 API 均不是稳定合约。实现证据见
[`canteen-menu-source-adapters.ts`](../../src/lib/canteen-menu-source-adapters.ts)、
[`cuhk-qr-ordering-research.md`](../cuhk-qr-ordering-research.md) 和
[`ichef-guest-ordering.md`](../ichef-guest-ordering.md)。

### PINME

PINME 使用同源 REST wrapper：一般注入 `Store-id`、`langcode`，取得匿名 H5 token 后再注入
`Authorization: Bearer <token>`。wrapper 对 GET/HEAD/DELETE 把对象编码到 query，对 POST 等方法
默认发送 JSON。业务成功还要求响应 `code === 200`，不能只看 HTTP 200。

| Method | Route / operation                | 请求参数或 body                                                           | 认证/上下文                                            | 主要响应或实体                                                            | 状态分类                  | 证据                             |
| ------ | -------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------- | ------------------------- | -------------------------------- |
| GET    | `/api/account/token`             | query：`store_id`、`ts`、`sign`；签名算法见 adapter                       | `Store-id`、`langcode`；初始无 bearer                  | 临时 H5 token                                                             | session bootstrap         | 静态 bundle + 动态只读 + adapter |
| POST   | `/api/v2/home`                   | body 至少含 `store_id` 和订单类型上下文                                   | 同一 H5 transport；若已 bootstrap，wrapper 会带 bearer | `config`、`currency`、`current_schedule`、`theme`、`member_discount_info` | read-only query           | 静态 bundle + 动态只读           |
| GET    | `/api/home/product-menus`        | query：`store_id`、`takeout`、`order_sub_type`                            | `Store-id`、`langcode`、匿名 bearer                    | `group`、`menu_group`、`service_time`、商品/规格/价格、营业和桌台状态     | read-only query           | 静态 bundle + 动态只读 + adapter |
| POST   | `/api/home/product-menus`        | 调用点传入与菜单上下文相同的门店/订单模式对象；当前 adapter 不使用此变体  | 同一 H5 transport                                      | 与 GET 变体同属菜单投影读取；不能仅凭 method 推断写入                     | read-only query           | 静态 bundle                      |
| POST   | `/api/order/prepare-table-order` | 桌台、商品和订单上下文                                                    | bearer + 门店/桌台上下文                               | 预备桌单状态                                                              | mutation                  | 静态 bundle                      |
| POST   | `/api/order/add-order`           | `formatData/formatProduct` 生成的购物车、顾客、订单模式、优惠及金额上下文 | bearer + 当前门店/桌台/顾客上下文                      | `order_id` 等已创建订单信息                                               | mutation                  | 静态 bundle                      |
| GET    | `/api/payment/pay-order`         | 已存在的 `order_id`、服务端应收/客户端 total、支付方式                    | 当前订单上下文                                         | 动态 form、URL 或支付参数                                                 | transaction orchestration | 静态 bundle                      |

`POST /api/v2/home` 和 `POST /api/home/product-menus` 是本次最重要的反例：它们用 POST 读取
配置或菜单，没有证据表明会创建订单。相反，`GET /api/payment/pay-order` 虽是 GET，却位于已创建
订单后的支付编排边界，不能由同步器或探测器调用。当前 adapter 有意只执行 token bootstrap 和
GET 菜单读取；fixture 只保留 `group/products/prices` 等规范化所需字段，不保存 token。

### iCHEF

iCHEF 顾客端把 GraphQL query 和 mutation 都发送到同一个 HTTP POST endpoint：
`https://shop.ichefpos.com/api/graphql/online_restaurant?op=<operationName>`。因此必须以 GraphQL
operation type 和字段路径判断副作用，不能以 HTTP method 判断。当前两个同步 query 不带
Authorization 或会员凭据，只带 `accept-language` 和 JSON content type。

| Method | Route / operation                                     | 请求参数或 body                                                                          | 认证/上下文                                 | 主要响应或实体                                                      | 状态分类        | 证据                                              |
| ------ | ----------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------- | --------------- | ------------------------------------------------- |
| POST   | GraphQL `menuHoursSnapshotQuery`                      | variables：`publicId`、`platformType`；query 读取 `onlineOrderingMenu.menuHoursSnapshot` | 公开餐厅 ID；未观察到 auth                  | `startTime`、`endTime`、`categorySnapshotUuids`                     | read-only query | 静态 bundle + 动态只读 + adapter                  |
| POST   | GraphQL `storeMenuItemCategoriesQuery`                | variables：`publicId`、`platformType`、第一步取得的 `categoriesSnapshotUuids`            | 同上                                        | category snapshot 的 `uuid/name/menuItemsSnapshot{uuid,name,price}` | read-only query | 静态 bundle + 动态只读 + adapter                  |
| POST   | GraphQL `instoreOrderingInformationQuery`             | `publicId`、`platformType=ICHEF_INSTORE`                                                 | 公开餐厅 ID                                 | 门店、是否启用、`paymentTiming`、官方 URL                           | read-only query | 静态 bundle + 动态只读                            |
| POST   | GraphQL `instoreOrderingPaymentOptionsQuery`          | `publicId`、店内点餐上下文                                                               | 公开餐厅 ID                                 | 当次 payment options                                                | read-only query | 静态 bundle + 动态只读                            |
| POST   | GraphQL `instoreOrderingSessionCreateSessionMutation` | `publicId`、`tableName`                                                                  | 有效桌号；服务端校验模块、配额和 entry code | `sessionUuid` 或 typed error                                        | mutation        | 静态 bundle；仅以明确无效桌号做过无状态可达性探测 |
| POST   | GraphQL diner/cart/send-order mutations               | `sessionUuid`、diner payload、递归 modifier/cart hash 或 checkout payload                | 有效 session + 浏览器 diner/购物车状态      | diner、cart 或真实订单/payment data                                 | mutation        | 静态 bundle                                       |

同步器的两段 query 也揭示后端读模型：`menuHoursSnapshot` 先给出发布时段和 category snapshot
引用，再按 UUID 批量读取 category/item snapshot。它支持“版本化菜单投影”的推断，但不能证明
数据库中存在同名表。`createSession`、diner、cart 和 send-order 都禁止定时或自动探测。

### Qmai

Qmai H5 先以空用户 token 做匿名 bootstrap，再用返回 token 和复合门店身份读取菜单。公开页面的
seller/owner `221033` 与 multi-store `331725` 不能互换：header `store-id` 使用 seller，
`multi-store-id` 和菜单 body 的 `storeId` 使用实际多门店 ID。业务成功要求 `code=0` 且
`status=true`。

| Method | Route / operation                                      | 请求参数或 body                                                                                            | 认证/上下文                                                                    | 主要响应或实体                                                | 状态分类          | 证据                             |
| ------ | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------- | ----------------- | -------------------------------- |
| POST   | `/web/account-center/oauth/mini-app-login`             | JSON：`code:""`、seller `storeId`、`sellerId`、`appid:""`、`flowScene:""`                                  | `Qm-User-Token:""`、`store-id:<seller>`、`Qm-From:h5`、`Qm-From-Type:catering` | 匿名 token                                                    | session bootstrap | 动态只读 + adapter               |
| POST   | `/web/catering/goods/list/category-item`               | JSON：`orderType`、multi-store `storeId`、HKT `buyTime`、`version:3`；调用点还允许 district/table 等上下文 | `Qm-User-Token:<token>`、seller `store-id`、`multi-store-id`                   | `categoryItems -> itemList -> goodsId/skuList/saleTime/stock` | read-only query   | 静态 bundle + 动态只读 + adapter |
| POST   | `/web/catering/goods/detail`                           | `goodsId`、`orderType`、`storeId`、`buyTime`、`combinedPractice=1`、`version=2`；可选 coupon template      | 匿名/用户 token + 门店上下文                                                   | 商品、modifier/做法和当次可售详情                             | read-only query   | 静态 bundle                      |
| POST   | `/web/catering/activity/list-for-calculate`            | 调用点 activity/cart context                                                                               | token + 门店上下文                                                             | 可参与计算的活动候选                                          | read-only query   | 静态 bundle                      |
| POST   | `/web/catering/order/cart/compute`                     | cart、门店、时段、会员/活动输入                                                                            | token + 当前 cart 上下文                                                       | 服务端 cart 报价                                              | quote computation | 静态 bundle                      |
| POST   | coupon `gain` / `take` / `receive` / `exchange` routes | 活动、会员、coupon 或兑换码上下文                                                                          | 登录/会员及资格上下文                                                          | 已领取或已兑换权益                                            | mutation          | 静态 bundle                      |

`category-item` 的 `buyTime` 是 #733 的直接证据：同一门店在不同时间返回不同菜单，且响应可能
没有可用 `saleTime`。它是点时只读投影，不是全天 catalog。`mini-app-login` 虽然使用 POST 并返回
token，但它只用于建立匿名读取上下文；token 只应存在于单次同步内存。cart compute 虽不是创建
订单，也不应纳入日常菜单同步，因为 payload 依赖购物车、会员和优惠上下文。

### Aigens

Aigens 的公开菜单 JSON 是最简单的同步入口；官方前端其余 POST 则覆盖 session、报价、会员、
订单和支付阶段。公开菜单无需 session，但后续调用可能使用 `sid`、`memberSecret`、device ID 或
当前 order context。

| Method | Route / operation                                       | 请求参数或 body                                                                                                    | 认证/上下文                                 | 主要响应或实体                                                                    | 状态分类          | 证据                             |
| ------ | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------- | --------------------------------------------------------------------------------- | ----------------- | -------------------------------- |
| GET    | `/api/v1/menu/store/{storeId}.json`                     | query：`locale`、`open`、`menu`、`groupId`、`country`；官方 shell 还可传 date/channel                              | 无公开 auth                                 | store、published/terminated、menu periods/categories/groups/items、openings/modes | read-only query   | 静态 bundle + 动态只读 + adapter |
| POST   | `/api/v1/menu/session.json`                             | body：`storeId`、mode/locale、所需 `fields`；按 mode 可含 addresses/passes/order/freeflow、`memberSecret`/deviceId | 可带已有 `sid` 和会员/设备上下文            | `sessionId`、member/membership、form、behavior、spot                              | session bootstrap | 静态 bundle；正常页面观察到调用  |
| POST   | `/api/v1/menu/calculate.json?ts=<store-local-time>`     | clean order body + member、cutlery/contactless、address、referral、qrId、version 等                                | order session；可含会员/优惠上下文          | 服务端报价、优惠和校验结果                                                        | quote computation | 静态 bundle                      |
| POST   | `/api/v1/menu/order.json?locale=<lang>`                 | `toOrderData()`；prekiosk 场景含 `type`、`session`、`takeout`，preorder 可含 UUID                                  | 当前 session + 非空 cart                    | 真实 order                                                                        | mutation          | 静态 bundle                      |
| POST   | `/api/v1/menu/checkout.json?...`                        | 规范化 order、顾客资料、配送/用餐、payment charge、grand total、tip 等                                             | 当前 session、store/mode、cart 和付款上下文 | order + charge；随后清 cart                                                       | mutation          | 静态 bundle                      |
| POST   | `/api/v1/pay/config.json` / `/api/v2/order/intent.json` | 已创建订单、selected charge、grand total、browser info                                                             | order/session/payment context               | payment session、client secret 或 intent                                          | mutation          | 静态 bundle                      |

`session.json` 是页面初始化/恢复上下文，不等于已提交订单；`calculate.json` 是报价计算，不等于
checkout。两者仍可能记录短期 session、处理个人/会员数据或触发配额，因此不属于菜单同步器。
Aigens 官网所称 Open API 与这些网页内部 route 不能自动等同；只有合同、正式 schema、token 和
sandbox 能把其中某个能力升级为受支持集成。

### 调研与实现边界

后续黑盒分析可以继续做低频、可重复的只读 query：保存 observation time、请求参数的非敏感
canonical form、HTTP/业务状态、响应 schema fingerprint、cache/rate-limit headers 及实体数量。
session bootstrap 只在公开页面读取菜单确实必需时执行，并立即丢弃 token。quote computation 只做
静态调用点和授权 sandbox 分析。

以下 operation 即使公开前端包含 route，也不得在生产商户上主动调用：创建有效 ordering
session/diner/cart、会员注册或绑定、领券/兑换、创建或取消订单、支付 intent/redirect、退款。探索
数据库结构也只能基于 DTO 引用、发布 snapshot、错误 union、缓存行为和供应商授权材料；不得通过
注入、报错诱导、越权、GraphQL introspection 或隐藏管理接口枚举取得内部 schema。

## 1. 删除、合并与 ID 重用

### 已确认

- CUpedia 当前分别使用 Aigens `backendId`、iCHEF item snapshot UUID、PINME
  `product_id`、Qmai `goodsId` 作为 provider 商品身份。
- iCHEF 官方商户文档表明，POS 商品可导入 Online Store；线上商品随后可以独立修改或删除，
  而批量导入会整体替换当前线上菜单且不可撤销。这说明 POS 主数据、线上菜单投影和 snapshot
  身份不是同一个生命周期。[iCHEF Menu Settings](https://support.ichefpos.com/?lang=en&p=56938)
- iCHEF ERP 对接另有商户可配置的 external integration ID；该 ID 是 ERP 映射键，不能和公开
  ordering snapshot UUID 自动等同。[iCHEF API Service](https://support.ichefpos.com/?lang=en&p=19624)

### 合理推断

- Aigens 的 period/category/group/item 引用、iCHEF 的 snapshot UUID、PINME 的
  `menu_group -> group -> product`、Qmai 的 category/goods/SKU 都支持“稳定实体 + 发布投影”模型。
- 名称和价格不是身份；同一商品可在不同分类、时段和渠道重复出现。
- 删除后重建、门店复制、菜单复制、批量替换或 POS 迁移，都可能产生新 ID；供应商也可能把旧
  ID 重新绑定到新业务实体。

### 未知与防护

没有一家公开承诺这些商品 ID 永不复用，也没有公开 merge/alias/tombstone 协议。因此：

1. 保留 CUpedia UUID，不按名称/价格自动合并；
2. 保存 provider ID 的首次/末次观察、退役和重新出现证据；
3. 同一旧 ID 长时间消失后若以不兼容名称/价格/结构重现，应阻断而非覆盖；
4. 大规模 ID churn、疑似一对一替换和多对一合并继续走人工审核 artifact；
5. 向供应商索取 ID 创建、复制、删除、恢复、门店迁移和数据保留规则。

## 2. SLA、限流与兼容期限

- **Aigens**：官网宣传 99.9% SLA 和所有工单 15 分钟响应，并明确宣传 Open API。
  但其标准条款同时说明服务可能变更，并以具体 quotation/合同为准；官网数字不能直接当成
  CUHK 门店的合同承诺。[Aigens 官网](https://www.aigens.com/)、
  [Standard Terms](https://www.aigens.com/wp-content/uploads/2024/06/20240605_StandardTermsAndConditions-1.pdf)
- **iCHEF**：官方 API 页面和发票 API 文档包含 stage endpoint、provisioned token、分页行为与
  更新记录，说明至少部分 API 有版本管理。官方“方案用量”不是菜单 API rate limit；没有找到
  公开的菜单 API SLA、429 配额或兼容期限。[iCHEF API](https://www.ichefpos.com/en-sg/ichef-api)、
  [ERP API details](https://support.ichefpos.com/?p=56364)
- **Qmai**：官方安全白皮书说明会监控上下行流量并进行降级限流，但没有公开阈值；合作应用采用
  独立密钥。[Qmai Security White Paper](https://files.qmai.cn/public/file/Qmai_SecurityWhitePaper_V1.2.pdf)
- **PINME**：未找到公开 SLA、配额、版本或兼容政策。

不能通过高频请求“测出限流”。正确做法是低频记录 429、`Retry-After`、缓存头和错误码，并向
供应商取得书面配额、burst、重试、维护通知、弃用期和事故联系人。

## 3. 长期抓取、缓存与图片转载

- 公开可访问不等于允许持续抓取或再发布。
- Aigens 网站条款限制复制和再发布其网站材料；这不自动决定餐厅自己上传的菜单数据归属，但
  足以说明必须取得餐厅和供应商许可。[Aigens Terms of Service](https://www.aigens.com/terms-of-service/)
- iCHEF 文档确认图片由商户在 POS/Online Store 上传，并可同步至 Google Business Profile；
  这证明商户控制发布流程，不授予第三方转载许可。
  [iCHEF Google Business Profile](https://support.ichefpos.com/?lang=en&p=25553)
- Qmai 白皮书确认图片、附件和公共资源使用 OSS 存储；存储位置不是版权或热链许可。
- PINME 尚未取得可核验的具体缓存/图片条款。

合作前需书面确认：文字、价格、Logo、菜品图片的权利方；允许缓存还是只能热链；允许的尺寸、
转换、CDN、保存期和删除 SLA；终止合作后何时清除。未确认前，CUpedia 应只保存规范化文字和
价格证据，不批量镜像供应商图片。

## 4. 商户后台的真实发布流程

### iCHEF：证据最完整

官方帮助中心显示：商户从 POS 商品导入 Online Store，再独立设置分类、名称、描述、图片、
modifier 可见性和排序；线上商品可单独删除；批量导入会整体替换且不可撤销。营业信息、封面和
Google Business Profile 也可在后台维护。停售状态可从 POS/Ordering Page 实时同步。
[Online Store FAQ](https://support.ichefpos.com/?lang=en&p=9693)、
[Menu Settings](https://support.ichefpos.com/?lang=en&p=56938)

### Aigens

官网说明 Aigens Console 可把菜单和库存变化同步到多个渠道，售罄会从配送 storefront 移除；
具体 CUHK 门店是否以 Aigens、上游 POS 或人工后台为主数据仍未知。
[Aigens Connect](https://www.aigens.com/omnichannel-ordering-for-restaurants-connecting-in-store-delivery-platforms-and-loyalty/)

### PINME 与 Qmai

PINME 官网说明菜单和价格可远程配置，商户 POS App 参与桌台、下单和厨房打印；Qmai 公开登录页
与“数店 App 扫码配置”页面证明商户端存在。两者的审批、草稿、发布、回滚和跨门店复制流程仍
需要授权 Demo 或商户 screen-share 验证。

最关键的访谈问题不是“后台有哪些表”，而是：谁编辑、哪个系统是事实来源、何时发布、是否要
审核、如何处理售罄/节假日、批量替换能否回滚，以及前台多久可见。

## 5. Webhook、导出与合作 API

- **Aigens**：官网明确宣传 Open API 和复杂第三方整合，但未找到无需商务接洽即可使用的公开
  developer portal、schema 或 sandbox。
- **iCHEF**：已确认 ERP/发票 API、stage endpoint、provisioned token、版本记录，以及
  CSV/Email、CSV/FTP、JSON/API PUT/POST 等主动导出方案。这些是付费/授权商户能力，不是公开
  菜单抓取许可。[ERP integration PDF](https://www.ichefpos.com/s/iCHEFERP-_202007.pdf)
- **PINME**：官网确认可向硬件输出规格、加料和原料，并向大型 ERP 输出订单、商品元数据、
  状态和支付数据；未找到公开 webhook/API 合约。[PINME 功能模块](https://www.pin2eat.com/system-kit)
- **Qmai**：安全白皮书确认开放平台第三方应用按商户和应用分配独立密钥，但本轮未取得可公开
  使用的接口目录、sandbox 或 webhook 语义。

优先由食堂作为数据权利方发起询问：菜单 catalog/export、publish webhook、inventory event、
稳定 ID、签名、版本、重放/幂等、失败重试、历史补发、配额、沙箱和退出导出。

## 6. 支付、退款与订单责任

- iCHEF 官方文档显示退款是商户 POS 操作：作废交易、开 credit note；Stripe 可随作废自动退款，
  某些 Global Payments 异常要由商户联系支付机构。由支付机构、商户和 iCHEF 共同维护交易与
  对账状态。[Void Transaction](https://support.ichefpos.com/?lang=en&p=18855)、
  [Global Payments manual refund](https://support.ichefpos.com/?lang=en&p=53229)
- Aigens 标准条款把 POS、支付网关和第三方服务纳入客户设备/第三方集成责任，具体收单、退款、
  chargeback 和支持边界取决于合同与支付方案。
- PINME 与 Qmai 的消费者前端显示交易能力，但本轮没有取得足以分配退款、拒付、取消和履约
  责任的公开合同文本。

CUpedia 当前的 ordering handoff 边界是正确的：只打开人工确认的官方 URL，不保存 session、
购物车、会员、订单、支付 URL 或退款状态。若未来代理交易，必须另立 ADR，并先取得供应商批准、
sandbox、商户身份、幂等与 quote expiry、PCI/隐私评估，以及退款和客服运营责任。

## 内部数据库与领域结构推断

### Qmai：基础设施已确认，表结构未知

Qmai 白皮书明确提及 MySQL、Redis、MQ、配置中心、水平分库分表、敏感数据加密、独立权限控制和
OSS 文件存储。这确认了多租户与高并发基础设施，不确认任何表名、分片键或外键。seller/owner、
multi-store、category、goods、SKU、sale time 很可能是逻辑实体；也可能由文档存储、搜索索引或
物化读模型组合输出，不能反推为一张一实体的关系表。

### iCHEF：snapshot 聚合最明显

公开 GraphQL 使用 `onlineOrderingMenu -> menuHoursSnapshot -> categorySnapshotUuids ->
categoriesSnapshot -> menuItemsSnapshot`。这强烈支持版本化菜单 snapshot/aggregate 的领域模型，
但 snapshot 可能是发布时生成的文档或缓存，而非数据库中的同名表。

### Aigens

公开菜单响应把 period、category、group 和 item 作为可互相引用的集合，适合推断 normalized
catalog 加渠道/时段投影。官方又称可以从 POS 实时同步菜单和库存，因此 Aigens 也可能主要保存
外部 POS 映射与物化渠道视图，而不是唯一主目录。

### PINME

`menu_group` 引用 group，而 group 内嵌 products、prices 和 standard items。它既可能来自关系
查询，也可能是为 H5 组装的文档 DTO。#732 只能据此确定前端选择拓扑，不能宣称知道后端表关系。

### 推荐的 provider-neutral 逻辑模型

```text
Provider account / tenant
  -> Brand
    -> Store / outlet
      -> Service mode + schedule + channel
      -> Catalog product identity
        -> variant / modifier / price
      -> Published menu snapshot
        -> menu/group/category references
        -> availability/inventory projection
      -> Order -> payment/refund/fulfilment (official system only)
```

该模型服务于 adapter 边界，不假定四家有相同物理数据库。

## 对 #732 与 #733 的结论

- **#732 PINME**：先修复。官方前端用 `menu_group[].groups` 选择 `data.group`；adapter 遍历整个
  broad group pool 是确定的投影边界错误。保留 `product_id`，不要按名称/价格合并。
- **#733 自适应时段**：随后实现。调度器必须把数据库时间和观察窗口传入 adapter；无 provider
  sale window 时按本次观察时段保存。最初实现用各时段最新快照并集保护 scope；#743 的生产
  复盘进一步确认，等待全天并集会让已观察的当前 Tab 长期保留旧菜。现行投影因此改为逐餐段
  局部替换：absence 只移除自己的 scope，未观察 scope 保持不变，最后一个 scope 消失时才全局
  下线同一 UUID。
- 两个修复都不能解决长期 ID 重用；另行增加退役 ID 墓碑和不兼容重现阻断更稳妥。

## 下一步授权验证清单

由一家合作食堂抄送供应商，申请一次 60 分钟技术/运营访谈和只读 sandbox，要求：

1. 展示从 POS/catalog 到线上菜单的创建、草稿、审核、发布、停售和回滚；
2. 提供匿名样本说明品牌、门店、菜单、商品、SKU、时段和渠道 ID 生命周期；
3. 书面说明删除、恢复、复制、合并、门店迁移和 ID 重用规则；
4. 提供 catalog/export API、webhook、sandbox、版本和弃用政策；
5. 提供 SLA、配额、429/重试、维护窗口和事故联系人；
6. 确认文字、价格、Logo、图片的展示、缓存、转换和终止删除许可；
7. 明确 merchant of record、收单方、订单接受点、取消、退款、拒付和客服责任；
8. 约定退出时的数据导出、撤权、删除和迁移流程。

在取得这些材料前，公开黑盒观测只用于保证 CUpedia 不误解顾客页面；它不是供应商合作协议的
替代品。
