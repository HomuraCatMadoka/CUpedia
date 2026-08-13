# CUHK NA、UC、WS 二维码点餐调研

调查日期：2026-08-12。范围仅限仓库已有二维码来源、PINME 官方公开页面和其当前官方前端 bundle 的静态/只读分析。没有调用 `add-order`、支付或其他会产生真实订单的接口，也没有尝试绕过任何优惠资格。

## 结论

NA、UC、WS 三个入口均是 PINME（`meal.pin2eat.com`），不是 iCHEF；三者共用同一套 REST 前端和流程，区别是 `store_id`：

| 餐厅 | 官方点餐入口                                  | 2026-08-12 只读检查       |
| ---- | --------------------------------------------- | ------------------------- |
| WS   | `https://meal.pin2eat.com/store/4898/takeout` | 302/前端路由后为 HTTP 200 |
| UC   | `https://meal.pin2eat.com/store/5198/takeout` | 302/前端路由后为 HTTP 200 |
| NA   | `https://meal.pin2eat.com/store/5500/takeout` | 302/前端路由后为 HTTP 200 |

三个入口当前分别落到：

```text
https://meal.pin2eat.com/v2/package_store/pages/store/home?store_id=4898
https://meal.pin2eat.com/v2/package_store/pages/store/home?store_id=5198
https://meal.pin2eat.com/v2/package_store/pages/store/home?store_id=5500
```

匿名浏览是官方前端支持的正常路径。前端通过 `/api/account/token` 获取 H5 临时 token，再读取门店和菜单；购物车主要保存在浏览器状态中，确认页为官方前端路由。真正提交订单是 `/api/order/add-order`，支付 URL 由 `/api/payment/pay-order` 根据已存在订单动态返回。因此 CUpedia 可以安全地展示菜单并把用户交给上述 `takeout` 链接，但不应代用户提交订单或拼接支付链接。

“任意时候都能取得全天完整菜单”不能从当前证据保证。入口全天可达并不代表 API 会忽略门店营业时段、销售日期、停售、库存或时段菜单；应把同步结果视作当次快照，并保留官方入口作为最终事实来源。

## 一手来源

仓库自己的二维码生成脚本 [`scripts/regen-canteen-qr.py`](../scripts/regen-canteen-qr.py) 将三个资产明确映射到上述 `takeout` URL，并在生成后用 `pyzbar` 反解校验。仓库说明 [`public/assets/canteen-qr/README.md`](../public/assets/canteen-qr/README.md) 还记录了采用 `takeout` 的原因：这些门店配置了 `all_share_table=1`，使用 `/store/{id}/table/1` 会加入共享堂食购物车，可能看到其他扫码者的菜品；网站二维码因此必须避免绑定桌号。

当前 PINME 页面加载的官方资源包括：

- `https://meal.pin2eat.com/v2/static/js/index.d6668f70.js`
- `https://meal.pin2eat.com/v2/static/js/chunk-vendors.b9c2e65c.js`
- `https://meal.pin2eat.com/v2/static/js/package_store-pages-confirm-confirm.982f4771.js`
- `https://meal.pin2eat.com/v2/static/js/package_store-pages-confirm-confirm1.4349fa91.js`
- `https://meal.pin2eat.com/v2/static/js/pages-store-menu.4d7da910.js`
- `https://meal.pin2eat.com/v2/static/js/pages-store-menu-product_detail.58626f6f.js`

这些带 hash 的 bundle 是实现证据，不是 PINME 承诺给第三方的稳定 API 合约，发布后可能更换。

## 匿名点餐链路

### 1. 入口与门店状态

`/store/{store_id}/takeout` 将订单类型设为 `TAKEOUT`，清空桌号绑定并进入门店首页/菜单。公共 HTML 不要求用户登录；bundle 中的 `GET_H5_COMMON_TOKEN = /api/account/token` 表明匿名浏览器会取得临时 H5 身份，而非使用 CUpedia 用户身份。

用于初始化和读取菜单的 REST 常量包括：

```text
GET_HOME_START       /api/home/start
GET_PRODUCT_MENUS    /api/home/product-menus
GET_STORE_INFO       /api/store/store-info
STORE                /api/v2/home
GET_H5_COMMON_TOKEN  /api/account/token
```

因此三家店的 POS/点餐系统识别为 PINME REST，而非 GraphQL。具体 header、token 生命周期和请求 schema 属于内部实现，未通过写操作探测。

### 2. 菜单与“全天”含义

静态 bundle 能确认菜单由门店初始化与 `product-menus` 响应驱动，也能确认前端会处理营业状态、预订时间、商品活动、停售/售罄等状态。它不能证明服务器在闭店后仍会返回当天所有时段、隐藏商品或未来菜单。

逐店可确认的边界相同：

- 匿名入口在调查时可达；
- 官方前端具备匿名菜单读取路径；
- 未建立三店跨多个营业时段的观测样本，因此“全天完整菜单”是**未知**；
- 菜单同步应记录抓取时间、失败原因和原始门店状态，不能把空菜单直接解释为餐厅无菜品。

补充的官方页面浏览器只读实测显示：三家在闭店状态下仍显示“推荐”内容；WS、UC 同时显示“預選菜品”入口并可浏览完整菜单，NA 当次没有“預選菜品”。这证明闭店不等于页面完全无菜单，也说明能力是门店配置相关，不能由同一套 bundle 推断三店一致。该观测仍只是 2026-08-12 的快照，不保证未来、所有日期或所有销售时段均返回同一集合。

### 3. 购物车与 checkout

bundle 包含菜单页、商品详情页以及两个确认页 chunk：`package_store/pages/confirm/confirm`、`confirm1`。`takeout` 入口初始化本地购物车；正常用户选择商品后进入确认页，可填写电话/电邮、选择优惠并查看总额。

服务器侧订单相关常量包括：

```text
POST_ADD_ORDER       /api/order/add-order
GET_ORDER_DETAIL     /api/order/detail
GET_ORDER_STATUS     /api/order/order-status
GET_PAY_METHOD       /api/payment/pay-method
GET_PAY_ORDER        /api/payment/pay-order
```

本调查没有调用 `POST_ADD_ORDER`，因此没有生成订单；也没有调用支付接口。可以确认的只是：匿名临时 token + 本地购物车 + 官方确认页是前端设计好的路径。三店在调查时是否允许某一具体商品走到“可提交”状态，取决于当时菜单、营业状态和商品选择，本次未做写入式端到端验证，标记为**未知**。

浏览器实测时三家均处于闭店状态，无法从页面正常进入购物车/确认页；因此没有用修改状态或直接调用接口的方式绕过营业限制。确认页与 payload 结论来自官方 bundle 静态证据，不应描述成三家当次成功走通了 checkout。

支付不是固定 URL。bundle 显示前端以已有 `order_id`、金额、渠道和方式调用 `GET_PAY_ORDER`，再使用服务器返回的 `form` 或 `url`。在没有真实订单时不能可靠或安全地提前生成付款页。

## WS 卡/会员优惠的防御性分析

### 已确认

当前通用 PINME bundle 暴露以下优惠/资格相关接口：

```text
GET_COUPON_DISCOUNT               /api/customer/coupon-by-code
GET_COUPON_LIST                   /api/customer/coupon-list
GET_MEMBER_PLAN                   /api/store/meal-member-plan
GET_ORDER_MEMBER_PLAN_BENEFITS    /api/home/get-order-member-plan-benefits
```

前端会根据门店的 `member_discount_info`、商品的 `member_discount`、当前 `memberPlan`、优惠券日期/时段/门槛等数据计算或展示优惠预览。也就是说，**UI 有优惠展示和初步可用性判断**；但 bundle 中存在会员方案和订单权益的服务器接口，最终订单又必须提交到 `/api/order/add-order`，所以客户端显示不能被视为资格的权威证明。

### bundle 中的具体代码路径

以下模块号来自 `index.d6668f70.js`；它们是 webpack 内部编号，不是公开 API：

| 模块                                                                   | 可确认的职责与字段                                                                                                                                                                                                                                              |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `56636`                                                                | REST endpoint 表：`GET_MEMBER_PLAN`、`GET_ORDER_MEMBER_PLAN_BENEFITS`、`GET_COUPON_DISCOUNT`、`POST_ADD_ORDER`、`GET_PAY_ORDER` 等                                                                                                                              |
| `92682`（MobX store 名 `member`）                                      | `getMemberPlan(store_id)` 调用 `/api/store/meal-member-plan`，把响应 `member_plan`、`membership` 分别保存为 `memberPlan`、`memberShip`；资格派生字段包括 `member_id`、`plan_id`、`member_level_discount.level_id`、`points`、`create_time`、`open_registration` |
| 门店 store                                                             | 首页响应的 `member_discount_info` 由 `setMemberDiscountInfo` 保存；该对象是门店级折扣规则字典                                                                                                                                                                   |
| `28999`                                                                | 商品活动/会员价格选择与展示计算；读取商品 `member_discount`、门店 `member_discount_info` 和会员 `memberPlan/memberShip`                                                                                                                                         |
| `42742`（MobX store 名 `confirm`）                                     | 确认页状态与付款方式；识别 `hasMemberDiscount`，保留已存在订单返回的 `activity_discount_total`、`member_discount_total`；付款奖励只读请求还发送 `order_total`、`customer_id`、`has_special_price_product`、`has_member_price_product`                           |
| `30057`（共享结账模块，位于当前同版本懒加载 chunk `uc-chunk-6658.js`） | `formatData`、`formatProduct`、`tapSubmit`、`addOrder`；构造并提交完整订单 payload                                                                                                                                                                              |
| `88930`                                                                | 已有订单的支付请求：调用 `/api/payment/pay-order`，参数为 `order_id`、`total`、`pay_channel`、`pay_method`、`pay_type`，MasterCard 时另有 `card_id`                                                                                                             |

确认页 UI 位于 `package_store-pages-confirm-confirm.982f4771.js` 和 `package_store-pages-confirm-confirm1.4349fa91.js`。它显示 `displayRealTotal`、`displayDiscountTotal`，且提交按钮受 `enableAddOrder` 控制并调用 `tapSubmit`。两个页面复用模块 `30057`；该模块从同版本懒加载 chunk 中定位后，可确认完整的订单请求构造边界。

### 前端价格计算

`28999` 的会员规则解析过程是：

1. 要求门店有 `member_discount_info`、商品有 `member_discount`、当前有 `memberPlan`；用于实际会员价时还要求 `isMemberUser = Boolean(memberShip)`。
2. 从 `memberPlan.member_level_discount.level_id` 取得会员等级；以该等级作为 key 读取商品 `member_discount[level_id]`，其值再索引门店 `member_discount_info`，得到具体规则。
3. 规则的 `discount_method === 1` 时，前端把 `discount` 当作固定减免额；其他值按 `basePrice * discount / 100` 算减免。
4. `discount_type === 0` 时，商品活动与会员优惠择优；其他值允许先减商品活动、再对剩余金额应用会员优惠。前端分别计算活动折扣和会员折扣，并用于购物车/确认页展示。
5. 未登录但门店允许展示规则时，文案可显示 `joinMemberDiscount`；这只是“加入会员可享”的预览，不等于当前匿名用户已具资格。

模块 `30057` 还会逐项乘 quantity 汇总 `memberDiscountTotal`；`discountTotal` 组合活动、会员与 coupon 减免。`realTotal` 把商品折后价、座位/服务/配送/餐具/外卖费等合并，并在客户端格式化至四位小数。

因此 `displayRealTotal` 和 `displayDiscountTotal` 是用户体验层的即时预览。订单详情中的 `activity_discount_total`、`member_discount_total` 来自服务器已有订单响应，证据强度不同，不能混为一个本地计算字段。

### add-order 与 pay-order 的权威边界

- `/api/order/add-order` 是产生订单的 mutation。模块 `30057.formatData()` 构造的顶层 payload 包括 `store_id`、`table_id`、`order_type`、`order_sub_type`、`customer_num`、`language`、`comment`、`products`、`total`、`discount_total`、`activity_discount_total`、`member_discount_total`、`seat_fee`、`service_fee`、`email`、`telephone`、`telephone_area_code`、`coupon_total`、`coupon_id`、`member_id`、`delivery_fee`、`order_id`、`qr_code`、`table_group_name`、`pre_time_id`、`cutlery_num`、`cutlery_total`、`need_cutlery_num`；特定模式另有 `group_buy_id`/`address_info`。
- `formatProduct()` 对单品发送 `product_id`、`group_id`、`standard_code`、`condiments`、`quantity`、`price`、`activity_id`、`box`、`store_id`、`dine_in_takeout`、`member_discount_id`，套餐/加料另带 `package`/`policy_products`，兑换券可能附 `coupon_id`/`coupon_total`。
- 这证明浏览器会发送 `member_id`、`member_discount_id`、商品 `price`、折扣合计和订单 `total`，所以这些值都是必须由服务器重新验证/计算的**不可信输入**。但静态前端不能证明 PINME 后端遗漏了校验，也不构成可绕过资格的证据。本次没有调用该 mutation。
- `/api/payment/pay-order` 是订单后阶段。模块 `88930` 明确要求 `order_id` 和 `total`，并携带支付渠道/方式；响应随后才被转换为支付 `form` 或跳转 URL。它不是菜单报价或会员资格验证接口。
- `GET_ORDER_MEMBER_PLAN_BENEFITS` 的常量存在，但当前取得的 bundle 中未定位到具体调用构造器；不能据此声称 WS 一定启用了该接口。
- `store_id=4898` 使用同一通用代码，但静态 bundle 本身不能证明 WS 当前配置了哪个会员等级、折扣率或“WS 卡”身份类型。

### 仍未知

本次没有取得一份可明确识别为“WS 卡”的真实优惠响应，也没有提交订单，因此无法从一手证据确认：

- “WS 卡”具体指学生卡、书院卡、会员计划还是优惠码；
- 资格凭证是在登录、手机号、卡号、二维码或柜台核验中的哪一步采集；
- `/api/order/add-order` 是否以及如何重新校验该资格；
- 优惠是否仅对部分商品、时段或取餐方式有效。

这些未知项不能通过伪造卡号、修改前端状态或尝试真实结账来补证。

### 风险与修复建议

若资格只由 UI 布尔值或客户端传入的折扣金额控制，而 `add-order` 接受客户端价格，将存在篡改优惠、重放优惠码和越权使用会员权益的风险。通用前端做过日期/时段预检也不能替代服务端校验。

餐厅/PINME 应在服务器端：

1. 从可信会员/卡记录推导资格，不信任客户端的 `isMember`、折扣率或应付金额；
2. 在创建订单时重新读取商品价格、营业时段、库存、优惠范围与使用次数，并重新计算总额；
3. 将优惠绑定到当前临时 token/正式会员、门店和订单，使用短时、单次凭证防止重放；
4. 对失败原因返回通用错误，避免泄露可枚举的卡号或会员状态，并记录异常尝试；
5. 如需现场验证卡片，应由餐厅员工或受信终端完成，不把可绕过的“已验卡”开关留在网页。

正常合规用法是让符合资格的用户在 WS 官方 PINME 页面按页面指引登录/出示本人卡或输入由餐厅发放的合法凭证，最终价格以服务器确认页和餐厅规则为准。CUpedia 不采集卡号、不替用户声明资格、不计算或承诺折扣。

## 推荐集成方案

1. 菜单同步仅调用匿名只读门店/菜单路径，并对三家店分别保存 `store_id`，不要把 API 写死在餐厅业务代码里；把来源 URL 和适配器配置存到餐厅/菜单来源表。
2. 定时同步把 PINME 响应规范化成内部菜单快照；保留 `observedAt`、门店营业状态和来源错误。闭店或异常时沿用最近成功快照并标记陈旧，而不是覆盖为空。
3. “去点餐”按钮直接打开各店 `takeout` URL。不要改用 `/table/1`，否则会加入共享购物车。
4. 购物车、确认、优惠资格、订单和支付全部留在 PINME 官方页面完成。不要由后端调用 `/api/order/add-order` 或 `/api/payment/pay-order`，也不要存匿名 token。
5. UI 明示“将离开 CUpedia；实时价格、库存、优惠资格与付款状态以餐厅/PINME 页面为准”。

## transient provider schema 与 DB normalized schema

PINME 响应字段应先进入只存在于单次同步内存中的 provider DTO，再转换为稳定的内部菜单模型；不要把上游 JSON 直接塞进业务表，也不要为 PINME 的每个字段扩充核心 schema。

### transient provider DTO（同步期间）

建议保留足够的上游语义用于转换、诊断与 hash，但不长期保存匿名/会员身份：

```text
PinmeStoreSnapshot
  provider = "pinme"
  storeId, observedAt, sourceUrl
  business/open/service-time state
  currency/language
  memberDiscountRules: member_discount_info
  categories[]: providerCategoryId, names, sortOrder, availability window
  products[]:
    providerProductId, providerCategoryId, names, description
    base prices/standards, condiments, package choices
    soldOut/available flags, activity
    memberDiscountByLevel: member_discount
  rawSchemaVersion/bundleVersion (如可观察)
```

其中 `member_discount_info`、`member_discount`、`activity.discount_method`、`discount_type` 和 provider 原始 ID 只用于解释当次快照。`membership`、`member_id`、`points`、临时 H5 token、优惠码、卡号、`customer_id` 不属于菜单数据，不应进入同步 DTO 日志、snapshot hash 或数据库。

### normalized DB（长期、跨 provider）

现有 `canteen_menu_sources`、`canteen_menu_items`、`canteen_menu_item_prices` 的分层方向是合适的：

- source：`provider`、`externalStoreId`、启用状态、`lastAttemptAt`、`lastSuccessAt`、`lastSnapshotHash`、`lastError`；接入前需把 `pinme` 加入 provider enum/check，而不是伪装成 `aigens` 或 `ichef`。
- item：稳定的 `externalSource + externalKey`、规范化名称、meal periods、排序、`isAvailable`、`lastSyncedAt`。
- price option：只存金额最小单位、币种、稳定展示标签和排序。标准/规格价格可转成多条 option。

会员/WS 卡价不应无条件覆盖商品 base price。只有在它是公开、非个性化且可清楚表达资格时，才可作为带标签的参考 price option（例如“合资格 WS 会员价”），并在 UI 明示“资格及最终金额由 PINME 确认”。更稳妥的第一版是只同步公开 base price，把会员规则留在 transient DTO，不落库也不在 CUpedia 自行算价。

若产品以后确实需要长期展示优惠条件，应另建 provider-neutral 的 `menu_price_qualifications`/`menu_promotions` 域表，至少区分 `kind`、公开文案、适用 item/option、有效时段、来源、`observedAt` 与 `authoritative=false`；不要把 `level_id`、`memberShip` 或 PINME 的规则 JSON塞入 `canteen_menu_item_prices.label`。订单实付、卡资格、coupon redemption 和支付状态仍完全不进入菜单库。

### 转换失败策略

- 未识别的 `discount_method`/`discount_type`：保留 base price，记录结构化同步警告，不猜测折扣。
- 空菜单且门店关闭/上游异常：不把所有历史商品立即标为永久下架；保留最近成功快照并标记陈旧。
- 同一 provider product 的规格或规则改变：用 provider ID 保持 item identity，替换规范化 price options；snapshot hash 基于去除身份/易变 token 后的 canonical DTO。
- 所有金额在边界处转成整数 minor units；上游浮点仅存在于 provider adapter 内。

## 验证边界

已验证：仓库二维码映射；三个公开入口均重定向到对应 `store_id` 的官方页面并返回 HTTP 200；闭店时三家仍显示推荐、WS/UC 有“預選菜品”并可见完整菜单而 NA 当次没有；PINME 官方 bundle 中的路由、REST 常量、临时 token、确认页、订单和支付跳转实现。

未验证：三家在所有时间段返回的菜单集合；营业中任一具体商品的库存和可提交状态；三家当次从购物车进入确认页（闭店限制）；WS 卡的真实资格响应与服务端订单校验；真实订单、订单状态和支付。涉及订单、支付或优惠凭证的验证有意不执行。

## Appendix A：PINME API root 与 transport inventory

### root 与环境分支

`index.d6668f70.js` 模块 `56636` 定义 `SeverUrl = https://dev-meal.pin2eat.com` 和按门店缓存的 `storeServerUrl`，但当前 H5 build 的 `fullUrl(path)` 与 `orginUrl(path)` 都直接返回原始 `path`。因此实际 `/api/...` 请求是**当前页面同源相对 URL**，没有拼接该 dev URL 或缓存域名。

`checkServer(storeId)` 以 `store_id` 调用 `/api/home/server-domain`，可把响应的 `server_domain` 写入本地 `_kStoreDomainMap`；当前编译产物的 `fullUrl()` 并不使用这个值。`currentServer()` 只把 `meal-au.pin2eat.com` 标成 `au`、`meal.pin2eat.com` 标成 `prod`，其他 hostname 标成 `test`，它是环境标签而非 API URL 构造器。

所以 WS、UC、NA 的 API root 分别由其同源页面决定，当前均为 `https://meal.pin2eat.com`；接口路径相同，`Store-id`/请求参数决定门店。

### 公共 request wrapper

- `chunk-vendors.b9c2e65c.js` 模块 `54558` 是 axios-like client：默认 `GET`、空 `baseURL`、`withCredentials=true`。GET/HEAD/DELETE/OPTION 把 object body 编码进 query；其他 object/array body 默认 JSON 序列化并使用 `Content-Type: application/json;charset=utf-8`。HTTP 2xx/304 进入成功 interceptor。
- `index.d6668f70.js` 模块 `71558` 在未设置 `headerNoStoreId` 时注入 `Store-id: <storeId>`；token 非空时注入 `Authorization: Bearer <token>`；总是注入 `langcode: <languageCode>`。store/table 业务参数仍由各调用点放入 query/body，不由 wrapper 自动添加。
- response 必须满足业务层 `data.code === 200` 才 resolve，除非请求设置 `ignoreCode`。业务 code 401 在微信 H5 走微信认证；其他平台调用 `silentLoginForPlatform(true)` 后重放原请求。其他业务错误 reject 原 `data`；网络/HTTP 错误 reject `{code: HTTP status, msg: translated serverError}`。`loading` 控制全局 loading，`ignoreErrorCode: "all"` 只抑制通用提示分支，不会把失败变成功。
- wrapper 记录 URL、body、method、状态与耗时用于诊断/telemetry；这意味着适配器不应把 token、会员字段或顾客资料送入自身日志。

匿名 bootstrap 的调用点可确认 `GET /api/account/token`，参数包含签名后的 `store_id`；成功数据存入 user store，后续成为 Bearer token。bundle 可以确认三店共用这套机制，UC/NA 的现有只读响应也均以业务 code 200 返回门店/菜单数据；本次没有保存三店各自 token 的值，也不应把 token 纳入菜单快照。

### 三店只读响应差异

| 店      | API root / transport                                              | 已取得的能力响应                                                                                                                                                                                                                                                        | 菜单能力边界                                                                                    |
| ------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| WS 4898 | 同源 `meal.pin2eat.com`；通用匿名 token + `Store-id` + `langcode` | 浏览器页面只读观测：闭店仍有推荐，存在“預選菜品”并可浏览完整菜单                                                                                                                                                                                                        | 未保存 WS 原始 JSON/token；闭店未进入 cart/confirm                                              |
| UC 5198 | 同上                                                              | `/api/v2/home` 风格响应 code 200，含 `config`、`currency`、`current_schedule`、`member_discount_info`、`theme`；菜单响应 code 200，含 `group`、`menu_group`、`service_time`、`table_is_open/status`；table 响应含 `allow_share`、`is_open`、`store_id`、`table_id/name` | 闭店仍有推荐与“預選菜品”，可浏览完整菜单；支付方式请求当次业务 code 300，不代表 endpoint 不存在 |
| NA 5500 | 同上                                                              | 门店与菜单响应同样 code 200，顶层能力字段与 UC 同构；支付方式请求当次业务 code 300                                                                                                                                                                                      | 闭店仍有推荐但当次无“預選菜品”；不能把 UC/WS 的预选能力套用到 NA                                |

### 已从调用点确认的 HTTP method

下表只列可见调用点，不依据 `GET_`/`POST_` 常量名猜测：

```tsv
constant	method	path
GET_H5_COMMON_TOKEN	GET	/api/account/token
SEVER_DOMAIN	GET	/api/home/server-domain
STORE	GET,POST	/api/v2/home
GET_TABLE_BY_QRCODE	GET	/api/home/get-table-by-qrcode
GET_PRODUCT_MENUS	GET,POST	/api/home/product-menus
PRODUCT_POLICY	GET	/api/product/policy
GET_TABLE_INFO	GET	/api/store/get-table-info
GET_PRO_ORDER_TIME_TABLE	GET	/api/home/get-pre-order-time-table
GET_COUPON_DISCOUNT	GET	/api/customer/coupon-by-code
GET_COUPON_LIST	GET	/api/customer/coupon-list
POST_COUPON_REMOVE	POST	/api/order/remove-coupon
POST_ADD_ORDER	POST	/api/order/add-order
POST_ADD_FOOD	POST	/api/order/add-food
GET_PAY_METHOD	GET	/api/payment/pay-method
GET_PAY_ORDER	GET	/api/payment/pay-order
POST_PREPARE_ORDER	POST	/api/order/prepare-table-order
POST_CLEAN_MY_PREPARE_TABLE_FOOD	POST	/api/order/clean-my-prepare-table-food
SALE_PACKAGE_LIST	GET	/api/v2/sale-package/list
```

另有调用点确认 `MAP_AUTO_COMPLETE`、`MAP_GEOCODE`、`GET_COURIER_INFO`、`GET_DISTANCE_LIST`、`GET_HOME_COMPONENT`、`GET_PAY_REWARD_DISCOUNT`、`STORE_POPS/V2` 为 GET，`POP_NUM/V2` 为 POST。所有写接口都仅做静态定位，未执行。

### 全量 endpoint 常量（machine-readable YAML）

以下是模块 `56636` 的 108 个 endpoint/asset 常量，按 path owner 分类。没有 `method` 的条目表示仅确认常量存在。

```yaml
account:
  GET_H5_COMMON_TOKEN: /api/account/token
  GET_LIKON_LOGIN: /api/account/likon-login
  LOGIN: /api/account/login
  SENT_EMAIL_VERIFY_CODE: /api/account/send-email-verify-code
  VERIFY_EMAIL_VERIFY_CODE: /api/account/verify-email-verify-code
  VERIFY_TELEPHONE_VERIFY_CODE: /api/account/verify-telephone-verify-code
  RESET_EMAIL_PASSWORD: /api/account/reset-email-password
  POST_SEND_VERIFY_CODE: /api/account/send-verify-code
  GET_ACCOUNT_LEVEL: /api/account/level
  ACCOUNT_REMOVE: /api/account/remove
  EMAIL_LOGIN: /api/account/login-by-email
  TELEPHONE_LOGIN: /api/account/login-by-telephone
  SET_PASSWORD: /api/account/set-password
store:
  STORE_LIST: /api/store/list
  GET_STORE_INFO: /api/store/store-info
  LAST_GO: /api/store/last-go
  GET_COURIER_INFO: /api/store/courier-info
  GET_DISTANCE_LIST: /api/store/distance-list
  GET_MEMBER_PLAN: /api/store/meal-member-plan
  AUS_GROUP_STORE_LIST: /api/store/aus-group-store-list
  GROUP_STORE_LIST: /api/store/group-store-list
  GET_REDEEM_RULE_DETAIL: /api/store/redeem-rule-detail
  GET_TABLE_INFO: /api/store/get-table-info
  STORE_POPS: /api/store/store-pops
  POP_NUM: /api/store/pop-num
home_menu:
  STORE: /api/v2/home
  GET_TERMS: /api/home/terms
  GET_PRIVACY: /api/home/privacy
  GET_PRO_ORDER_TIME_TABLE: /api/home/get-pre-order-time-table
  SEVER_DOMAIN: /api/home/server-domain
  MAP_AUTO_COMPLETE: /api/home/map-auto-complete
  MAP_GEOCODE: /api/home/map-geocode
  GET_ORDER_MEMBER_PLAN_BENEFITS: /api/home/get-order-member-plan-benefits
  GET_TABLE_BY_QRCODE: /api/home/get-table-by-qrcode
  GET_HOME_START: /api/home/start
  GET_PRODUCT_MENUS: /api/home/product-menus
  GET_HOME_COMPONENT: /api/home/component
  GET_SINGLE_PAGE: /api/home/single-page
  PRODUCT_POLICY: /api/product/policy
  PRODUCT_DETAIL: /api/product/detail
  POLICY_LIST: /api/policy/list
customer:
  LATEST_VISIT: /customer/merchant-info
  GET_COUPON_DISCOUNT: /api/customer/coupon-by-code
  GET_COUPON_LIST: /api/customer/coupon-list
  GET_COUPON_DETAIL: /api/customer/coupon-detail
  REMOVE_CARD: /api/customer/remove-card
member:
  POST_REGISTER_MEMBER: /api/member/register-member
  POST_UPDATE_MEMBER: /api/member/update-member
  QUIT_MEMBER_PLAN: /api/member/quit-member
  BIND_MEMBER: /api/member/bind-member
  GET_POINT_LIST: /api/member/get-point-list
  CONSUME_MEMBER_POINTS: /api/member/consume-member-points
  GET_PLAN_DESCRIPTION: /api/member/plan-description
  NEED_SET_PASSWORD: /api/member/need-set-password
  CREATE_APPLE_WALLET: /api/member/create-apple-wallet-pass
  CREATE_GOOGLE_WALLET: /api/member/create-google-wallet-pass
order:
  ORDER_LIST: /api/order/order-list-app
  ORDER_CANCEL: /api/order/cancel
  POST_ADD_ORDER: /api/order/add-order
  POST_ADD_FOOD: /api/order/add-food
  GET_ORDER_DETAIL: /api/order/detail
  GET_REFUND_ORDER: /api/order/apply-refund
  GET_CANCEL_ORDER: /api/order/cancel
  GET_ORDER_STATUS: /api/order/order-status
  CHANGE_ORDER_TELEPHONE: /account/change-order-telephone
  IS_ORDER_BIND_MEMBER: /api/order/is-order-bind-member
  POST_COUPON_REMOVE: /api/order/remove-coupon
  GET_ORDER_COUPON: /api/order/get-order-coupon
  GET_SOCKET_GROUP_NAME: /api/order/get-group-name
  POST_PREPARE_ORDER: /api/order/prepare-table-order
  POST_CLEAN_MY_PREPARE_TABLE_FOOD: /api/order/clean-my-prepare-table-food
  GET_LAST_ORDER_INFO: /api/order/get-last-order-info
  GET_HEADCOUNT: /api/order/get-table-order-person-number
  SIMPLE_ORDER_DETAIL: /api/order/simple-order-detail
payment:
  GET_PAY_ORDER: /api/payment/pay-order
  GET_PAY_METHOD: /api/payment/pay-method
  POST_PAY_OFFLINE: /api/payment/pay-order-offline
  GET_PAY_REWARD_DISCOUNT: /api/pay-reward-activity/get-available
third_login:
  WECHAT_LOGIN: /third-login/wx-app-login
  ALIPAY_LOGIN: /third-login/ali-mini-login
  GET_H5_WECHAT_TOKEN: /api/third-login/we-chat-oauth
  FACEBOOK_LOGIN: /api/third-login/facebook
  GOOGLE_LOGIN: /api/third-login/google
  UPDATE_EMAIL: /api/third-login/update-email
  GET_WX_AUTH_APP_ID: /api/third-login/app-id
queue:
  QUEUE_SCHEDULE_LIST: /api/queue/schedule-list
  QUEUE_LIST: /api/queue/queue-list
  QUEUE_NUMBER: /api/queue/number
  QUEUE_NUMBER_DETAIL: /api/queue/number-detail
v2_campaign_and_misc:
  GET_SALE_PACKAGE_DETAIL: /api/v2/sale-package/detail
  STORE_POPS_V2: /api/v2/store/store-pops
  POP_NUM_V2: /api/v2/store/pop-num
  GET_STORE_LIST: /api/v2/store/lists
  SALE_PACKAGE_LIST: /api/v2/sale-package/list
  COUPON_CLAIN_ACTIVITY_DETAIL: /api/v2/coupon-claim-activity/detail
  COUPON_CLAIN: /api/v2/coupon-claim-activity/claim
  COUPON_CLAIN_RULE: /api/v2/coupon-claim-activity/rule
  GET_THEME: /api/v2/home/theme
  VALIDATE_ELIGIBILITY: /api/v2/coupon-claim-activity/validate-eligibility
  MGM_ACTIVITY_DETAIL: /api/v2/mgm-activity/detail
  MGM_COUPON_CLAIN: /api/v2/mgm-activity/claim
  MGM_COUPON_CLAIN_RULE: /api/v2/mgm-activity/rule
  MGM_VALIDATE_ELIGIBILITY: /api/v2/mgm-activity/validate-eligibility
  MGM_COUPON_REFERRER_PROGRESS: /api/v2/mgm-activity/referrer-progress
  TRACK_SHARE: /api/v2/mgm-activity/track-share
  FOOD_COURT_PAGE_DETAIL: /api/food-court-page/detail
assets:
  HUANGYOU_FONT: /assets/fonts/pinme-huangyou.ttf
  AKROBAT_FONT: /assets/fonts/akrobat-black.woff
```

静态限制：常量存在不代表 WS/UC/NA 启用对应功能；常量名称不证明 method；客户端 headers/payload 不揭示后端授权、RLS、资格核验、重算或幂等实现；source map/bundle 也不是受支持的第三方 API 合约。

## Appendix B：仓库全部 canteen QR 盘点

`public/assets/canteen-qr` 当前有 5 个 PNG（另有 README）：

| 文件                                       | QR 内容/来源                                                                                          | provider     | 现有 adapter 复用判断                                              |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------- | ------------ | ------------------------------------------------------------------ |
| `ws-can.png`                               | `https://meal.pin2eat.com/store/4898/takeout`；由 `scripts/regen-canteen-qr.py` 生成并反解校验        | PINME        | 不能复用现有 Aigens/iCHEF adapter；三家 PINME 可共享一个新 adapter |
| `uc-can.png`                               | `https://meal.pin2eat.com/store/5198/takeout`；同上                                                   | PINME        | 同上                                                               |
| `na-can.png`                               | `https://meal.pin2eat.com/store/5500/takeout`；同上                                                   | PINME        | 同上，但能力 flags 必须读取 NA 响应，不能复制 UC/WS 配置           |
| `Ebeneezer's.png`                          | OpenCV `QRCodeDetector` 反解为 `https://www.ebeneezers.com/`                                          | 普通官网链接 | 不能复用菜单 adapter；入口没有 store/menu API identity             |
| `9539dbf3-3f22-4749-b532-e42357e0be96.png` | 反解同为 `https://www.ebeneezers.com/`；与 `Ebeneezer's.png` SHA-256 完全相同，是同一资产的 UUID 别名 | 普通官网链接 | 同上；应在资产层去重，不创建第二个 provider source                 |

后两个文件随原 UI/QR commit 加入，仓库没有对应生成脚本或 API 来源说明。仅凭官网主页不能推断 Ebeneezer's 使用 Aigens、iCHEF 或 PINME，也不应对官网 HTML 做菜单 adapter。若将来获得其官方结构化点餐入口，再以实际域名/API 单独归类。

## Appendix C：新增门店与用户提供 QR

### 四张 QR 的离线解码

使用 OpenCV `QRCodeDetector` 直接从图片像素解码；解码动作不访问目标 URL。

| 图片                                                       | QR 内容                                                                                                                                | 门店/provider                 | adapter 结论                                                                     |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | -------------------------------------------------------------------------------- |
| `codex-clipboard-9acc49d3-99ce-488c-8163-c8691b6d0af2.jpg` | `https://scan.aigens.com/scan?code=c3RvcmU9MTAyODMwJm1vZGU9cHJla2lvc2smcGFnZT1ieW9k`；Base64 为 `store=102830&mode=prekiosk&page=byod` | 善衡書院餐廳；Aigens 102830   | 可直接复用现有 Aigens adapter；仓库已有 `generate-shho-menu-sync.ts`             |
| `codex-clipboard-55680891-0704-44e6-98a7-a65a1bd3bca9.jpg` | `https://pth5.qmai.cn/mp-monorepo-h5/web/index.html#pages/takefood/index?store_id=221033&multi_id=331725`                              | 敬文書院餐廳/Maxim's；Qmai    | 不可复用 Aigens/iCHEF/PINME；需要独立 Qmai adapter，当前证据不足以实现           |
| `codex-clipboard-bddb0a6f-7557-45b5-9814-eddfd3fcdaa8.jpg` | `https://meal.pin2eat.com/v2/package_store/pages/store/store?store_id=5505`                                                            | Cafe Shaw；PINME 5505         | 可复用新增的 PINME provider adapter；入口不是 `takeout`，handoff 应保留原 QR URL |
| `codex-clipboard-23baac87-8c47-4ffd-b9cc-f7fdd78d5341.jpg` | `https://scan.aigens.com/scan?code=c3RvcmU9MTAyMjE2Jm1vZGU9cGlja3VwJnBhZ2U9YnlvZA==`；Base64 为 `store=102216&mode=pickup&page=byod`   | 大學站 B 口 MX；Aigens 102216 | 可复用现有 Aigens adapter；handoff 保留 `pickup` mode                            |

### PINME 4899、5581、5505

三个公开入口当前均可达并落到 PINME v2 门店首页：

```text
4899 -> Cafe Tolo
5581 -> The Green
5505 -> Cafe Shaw
```

只读门店配置使用前文同一 transport：`POST /api/v2/home`，body 含 `store_id`/订单类型，headers 含 `Store-id` 与 `langcode`。这里的 POST 读取配置但没有创建订单或修改服务器业务状态。三店响应均为 HTTP 200、业务 `code=200`，币种 HKD，并公开 `config`、schedule、theme、`member_discount_info` 等能力字段。

| store          | takeout              | 预订                                 | 门店折扣/会员规则                           | 公开能力快照                                            |
| -------------- | -------------------- | ------------------------------------ | ------------------------------------------- | ------------------------------------------------------- |
| 4899 Cafe Tolo | `takeout=1`，20 分钟 | `has_pre_order=0`, `open_preorder=0` | `has_discount=0`；`member_discount_info=[]` | dine-in/takeout 启用；当次 `current_schedule=null`      |
| 5581 The Green | `takeout=1`，15 分钟 | 同上                                 | 同上                                        | dine-in/takeout 启用；当次 `current_schedule=null`      |
| 5505 Cafe Shaw | `takeout=1`，15 分钟 | 同上                                 | 同上                                        | `allow_dine_in_takeout=1`；当次 `current_schedule=null` |

这只能证明当次公开配置没有门店级会员折扣规则，不能证明餐厅永远没有优惠，也不能排除独立 coupon/campaign。PINME bundle 中公开领取相关常量包括 coupon list/detail/by-code，以及 `/api/v2/coupon-claim-activity/{detail,rule,validate-eligibility,claim}` 和 MGM 对应接口。合规顺序应是官方活动页读取 detail/rule、由服务器 `validate-eligibility`，用户主动 claim 后在正式订单中由服务器重新核验；本调查没有调用 claim、coupon-by-code、redeem 或 order mutation，也没有枚举优惠码。

### Aigens/CSD 112891、102830、102216

CSD/CU CAFÉ 的入口是 `https://csd.order.place/home/store/112891?_aigens_source=scan&catMode=false&mode=prekiosk`。该 branded shell 受 Cloudflare 保护，本调查没有绕过；仓库第一方脚本 `scripts/generate-cucafe-menu.ts` 已明确使用 Aigens 官方公开菜单 JSON：

```text
https://aigensstoreapp.appspot.com/api/v1/menu/store/{storeId}.json
  ?locale=default&open=true&menu=prekiosk&groupId=1000&country=hk
```

同一只读 endpoint 对 112891、102830、102216 均返回 HTTP 200 JSON，顶层为 `{status,time,duration,data}`，当次 `status="1"`：

补充的外部 Chrome 正常浏览器会话已通过 Cloudflare 并加载 CSD build `2026-05-26.4.2.0.20260527`，页面共加载 20 个 scripts。console 明确记录创建 `member`、`preorder`、`order` contexts，随后执行 menu/getMenu preload/fetch；观察到的菜单 cache key 为：

```text
/api/v1/menu/store/112891.json?menu=prekiosk&locale=multi&date=2026-08-12&channel=mobile&ngsw-bypass=true?
```

同一正常会话还记录 `getOrderSession starts/fetch`。这些运行时证据确认官方 CSD shell 会在进入页面时并行初始化会员、预订、订单上下文，预载当日 mobile/prekiosk 菜单并读取 order session；它们**不确认创建订单的 endpoint、method 或 payload**。当时处于非营业状态，官方 UI 仍阻止选餐，调查没有绕过该限制。

| store  | 官方响应名称     | modes                                  | menu categories/groups | 优惠/会员公开字段                                                                                                       |
| ------ | ---------------- | -------------------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| 112891 | CU CAFÉ          | kiosk, prekiosk, dinein, takeaway      | 17 / 34                | `menu.discounts=[]`, `discountInput=false`, `couponTemplates=[]`; CRM `anfield`, recruitable，但 points/stamps 均未启用 |
| 102830 | 中文大學善衡書院 | kiosk, prekiosk, dinein, takeaway      | 36 / 49                | 同样没有 discounts/coupon templates；CRM `anfield`，points/stamps 未启用                                                |
| 102216 | 大學站MX         | dinein, takeaway（QR 自身要求 pickup） | 38 / 55                | 没有 discounts/coupon templates；CRM 为 Eatizen，公开能力含 points/recruitable                                          |

Aigens JSON 还包含 menu periods、categories/groups、商品/规格关系、营业 openings、mode、closed/published 等，现有 adapter 已能规范化公开商品与 base price。`open=true` 是菜单请求过滤参数，不应被解释为“强制门店营业”。

优惠资格边界：`crm.recruitable` 或 `features=[point]` 只说明前端可展示会员能力；它不是当前匿名用户资格。`couponTemplates=[]`/`discounts=[]` 只是当次公开 store snapshot。若官方 UI 未来显示 offer，应由 Aigens/品牌 CRM 登录态返回用户可用权益，结账时由后端按会员、store、SKU、时段和使用次数重新计算。CUpedia 不应保存 CRM profile/token、模拟会员登录、调用领取/兑换或把客户端显示折扣当作 authoritative price。

### Qmai 221033 / multi 331725

QR 指向 Qmai 官方 H5。公开 HTML 返回 HTTP 200，并加载：

```text
https://rscdn.qmai.cn/mp-monorepo-h5/web/7349.62333a19b8e00c26.js
https://rscdn.qmai.cn/mp-monorepo-h5/web/app.656b188c1e59eb82.js
```

bootstrap bundle 可确认 API root 形如 `https://webapi.<derived-domain>`；特定 `inth5` 环境切换 `webapiga`。它从 URL/localStorage 读取 `storeId`、`sourceType`，先 GET：

```text
/web/iot-center/ext-info/detail?sellerId=<storeId>[&sourceType=...]
```

再动态加载业务 chunks。当前静态证据没有可靠定位敬文门店的菜单、优惠领取、eligibility 或订单 payload；因此不能声称存在匿名菜单 API，也不能实现 Qmai adapter。后续如继续调查，应仅观察官方页面自身的 GET/只读请求，区分公开活动 detail/rule 与 claim/redeem mutation；不得调用领取、核销、下单或支付接口，也不得伪造 Maxim's 会员资格。

### 扩展后的 provider 分层

| provider         | stores                             | 当前同步建议                                                        |
| ---------------- | ---------------------------------- | ------------------------------------------------------------------- |
| PINME            | 4898, 4899, 5198, 5500, 5505, 5581 | 新建一个 PINME adapter；能力字段逐店读取，handoff 保存原始入口/mode |
| Aigens           | 112891, 102830, 102216             | 复用现有 Aigens adapter；source 表只需新增 store IDs/入口元数据     |
| Qmai             | 221033 + multi 331725              | 暂不接入；等待官方只读菜单 schema 被确认后新增 provider             |
| ordinary website | Ebeneezer's                        | 只作外链，不创建 menu source                                        |

`externalStoreId` 对 Qmai 可能不足，因为门店身份由 `store_id + multi_id` 组合；未来 provider config 应允许非敏感 JSON 参数或独立 `externalLocationId`，但不能把会员 token、coupon code、用户卡号混入 source 配置。

## Appendix D：Qmai、Aigens 与 PINME 的下单前边界

### Qmai 221033：官方 H5 transport 与只读能力

Qmai bootstrap 的 API host 由页面域名推导为 `https://webapi.<domain>`，`inth5` 场景改用 `webapiga`。启动参数来自 hash query/localStorage：`storeId`、`sourceType`；本 QR 的 `multi_id=331725` 是额外地点/门店组合标识，不能丢弃。启动 GET 为：

```text
/web/iot-center/ext-info/detail?sellerId=221033
```

官方业务 chunk `4885.d291d7e2.js` 的 API 模块 `71112` 可确认以下菜单/门店读取调用：

```tsv
method	path	confirmed params
GET	/catering/shop/shop-detail	call-site object; store identity supplied by app state/request
GET	/catering/shop/get-ext-info	call-site object
POST	/catering/goods/list/category-item	orderType, storeId, buyTime, version=3; optional districtId, orderSubType, peopleNum, tableNo
POST	/catering/goods/detail	goodsId, orderType, storeId, buyTime, combinedPractice=1, version=2; optional couponTemplateId
GET	/catering/goods/list/shop-time	call-site object
POST	/catering/activity/get-store-activity-scene	call-site object
POST	/catering/activity/list-for-calculate	call-site object
POST	/catering/order/cart/compute	cart payload
POST	/catering/order/cart/goods/compute	cart/goods payload
```

Qmai 把许多读取/计算也实现为 POST，不能用 HTTP method 判断是否产生订单；上表的 cart compute 是报价/计算边界，不等于 create-order。为避免无意产生业务状态，本次只做静态定位，没有调用这些 endpoint。

优惠/会员相关 API 表面包括：

```tsv
method	path	boundary
POST	/catering/crm/coupon/list	用户 coupon 列表；需要用户/会员上下文
POST	/catering/coupon/template/list	公开模板/可用模板读取候选
GET	/catering/coupon/activity-list	活动列表候选
POST	/catering/advertising/pop-coupon/detail	弹窗活动详情
POST	/catering/crm/member-benefits-is-pop	会员权益展示判断
POST	/catering/coupon-receive/web-coupon/detail	公开领取页 detail 候选
POST	/catering/coupon-receive/web-coupon/list	领取页列表候选
POST	/catering/coupon/gain	领取 mutation（未调用）
POST	/catering/crm/coupon/take	领取 mutation（未调用）
POST	/catering/coupon-receive/web-coupon/receive	领取 mutation（未调用）
POST	/catering/coupon/exchange	兑换 mutation（未调用）
```

静态 bundle 还存在付费会员、学生认证 `checkStudentProve`、coupon package 等通用功能；这不证明敬文门店启用它们。官方页面领取流程会先读取活动/detail，并在需要时触发登录/手机号授权；学生券包 UI 还检查 `studIdentityCheck` 和学生证明状态。资格必须由服务器基于登录态、活动、门店、时间和次数判断。CUpedia 不应调用 gain/take/receive/exchange，也不能把客户端 `isStudent` 或弹窗状态视为 eligibility。

当前证据足以设计 Qmai provider 的只读研究计划，但不足以安全实现定时同步：尚未取得 221033 的实际菜单响应、完整 request headers/signature 和 `multi_id` 如何映射到 `storeId`。因此保持“暂不接入”。

### Aigens：cart、checkout、order 与支付

Aigens 公开 store JSON 对三店给出 `menu.checkoutFlow="default"`、菜单/规格、modes、营业与 CRM 能力；这些数据足以读取菜单，但不创建 server cart。官方扫码入口中的 `mode=prekiosk/pickup` 是前端 handoff context，应该原样保留。

离线取得的 CSD 主 bundle `main.js`（4,049,703 bytes；build 见上文）进一步确认了以下边界。所有内容来自静态调用点，未发送请求。

#### OrderSession 与本地 cart

`getOrderSession` 使用：

```text
POST /api/v1/menu/session.json
```

body 包括 `storeId`、mode/locale 相关上下文与所需 `fields`；按 mode 增加 `addresses`、`passes`、`order`、`freeflow`，可带 `memberSecret`/deviceId。query/header 参数可含已有 `sid`。响应被保存到 `orderContext.session`，读取 `sessionId`、`member`、`membership`、`form`、`behavior`、`spot`。这是页面初始化/恢复 session，不等于创建已提交订单。

OrderContext 的 `makeSaveData()`、`restoreSavedData()` 和 storage service 保存/恢复浏览器 order/cart；`disableCheckout()` 明确在 cart 为空、金额不满足或不允许零元结账时禁用 checkout。因此只深链 checkout 不能得到有效订单。

#### 报价与优惠

```tsv
method	path	visible input/boundary
POST	/api/v1/menu/calculate.json?ts=<store-local-time>	clean order body；加入 member、cutlery/contactless、address、referral、qrId、version 等；服务器返回报价
GET	/api/v1/crm/offer.json	brandId；读取 CRM rewards
POST	/api/v1/reward/offer.json	action=redeemcode, membershipId, brandId, code；兑换 mutation，未调用
POST/PUT	/api/v1/menu/member.json	OTP/register/edit member；会员 mutation，未调用
POST	/api/v1/reward/activity.json	join membership；会员 mutation，未调用
```

`calculate` 是服务端报价边界，但客户端仍发送 order/member/selected offers 等输入；最终 checkout 必须重验 SKU、offer、会员和金额。bundle 的 redeem-code 调用在 guest 时先要求登录，随后提交 membershipId/brandId/code；本调查没有枚举或兑换优惠码。

#### 创建订单

prekiosk 快捷路径明确调用：

```text
POST /api/v1/menu/order.json?locale=<lang>
```

body 由 `toOrderData()` 生成，并设置 `type="prekiosk"`、`session`、`takeout`；preorder-same-as-prekiosk 使用同一 endpoint，另可带 `uuid`。

完整 checkout 最终调用：

```text
POST /api/v1/menu/checkout.json
  ?errorFormat=json&spot=<spot>&groupId=<groupId>&storeId=<storeId>&locale=<lang>
```

body 是规范化 order `qo`，静态可见的附加字段包括 member、guest phone/countryCode/email/name、cutlery、contactless、addressId、payment charge/current payment、grandTotal、tip，以及 e-credit 场景的 `canUseEcredit`、`brandId`、`usedEcredit`。court 场景切换 `/api/v1/menu/orders.json?type=master&courtId=...`。代码虽先构造过 v1/v2 order URL，当前分支随后明确覆盖为 checkout URL；不能据此声称普通完整 checkout 使用 v2 order endpoint。

成功响应读取 `data`（真实 order）和 `charge`，清空 cart；若已 paid 直接进入订单详情，否则把 response 保存为 `responsePostedOrderJson` 并交给 payment component。由此可确认支付发生在服务器订单创建之后。

#### payment request / redirect

```tsv
method	path	boundary
POST	/api/v1/pay/config.json	order data + selected charge；为 MPGS/Stripe 等取得 session/client secret
POST	/api/v2/order/intent.json	charge, grandTotal, storeId, browserInfo；query/header context 含 storeId/session
GET	/api/v1/pay/token.json	可带 groupId, brandId, paymentId；读取已保存卡 token
GET	/api/v1/pay/status.json?orderId=<id>	gen1 订单状态
GET	/api/v2/order/pay/status.json?orderId=<id>	gen2 订单状态
POST	/api/v2/order/pay/redirect.json?orderId=<id>&shouldRedirect=false	Adyen additional details；返回完成后的 orders
```

payment component 还会依服务器响应选择动态 URL、二维码或创建隐藏 HTML form 并 POST；`createFormAndPost()` 的 action、method、hidden inputs 均来自 payment response/config。`checkPaymentStatus()` 在没有 `order.id` 时直接返回 null。这证明支付 redirect 不能在菜单阶段预先构造，也不能只凭 cart total 深链。

静态边界按阶段总结如下：

1. 商品选择与 cart 先在浏览器前端状态中组合，公开 store/menu JSON 不返回已创建订单。
2. checkout 必须带当前 store/mode 和非空 cart 才有业务意义；仅深链到页面不能得到可付款订单。
3. order creation 是独立写操作，成功后才会有 order identity/number。没有该 identity 时，支付状态、additional-details redirect 或订单详情不可构造。
4. 支付页面/请求必须基于服务器订单及其未付金额，不能以公开菜单价格直接拼静态链接。

本次没有调用 order creation 或支付。Aigens branded CSD 页面可在正常 Chrome/Cloudflare 会话中加载；本调查没有绕过 Cloudflare。运行时只确认 `getOrderSession` fetch 和菜单预载；上述 create/pay endpoint 来自离线 bundle 调用点，并未在运行时触发。对 CUpedia 的安全实现仍是：菜单用公开 JSON 同步，“点餐/付款”交给原始 `scan.aigens.com` 或 `csd.order.place` 入口，cart/checkout/order/pay 全留在官方前端。

#### 主 bundle `/api/` inventory 边界

离线字符串抽取共得到 71 个唯一 `/api/` path/template，覆盖 asset/CMS、store/menu/session/order、CRM/reward/member、payment、PMS/HKBU 与 recommendation。除上表外的重要只读路径包括 `/api/v1/menu/store/{id}.json`、`/api/v2/menu/store/{id}`、`/api/v1/menu/order/{id}.json`、`/api/v1/menu/history.json`、`/api/v1/store/member/me.json`、`/api/v1/pay/config.json`。路径字符串存在不等于当前三店启用，也不证明 auth/HTTP method；文档仅对可见调用点标 method。

### PINME：最终提交按钮前后

2026-08-13 补充运行时验证：后端使用官方 bundle 的签名算法调用匿名
`GET /api/account/token`，再以返回的临时 bearer token 调用只读
`GET /api/home/product-menus`。NA `store_id=5500` 实时返回 HTTP 200、业务
`code=200`，包含 21 个分组和 164 个商品。该链路不依赖 Cloudflare
浏览器 cookie；token 仅应存在于单次同步内存中，不进入数据库、日志或快照哈希。

不创建真实订单时可验证到：

- 原始门店/桌号/takeout route 是否可达；
- 匿名 H5 token bootstrap、门店 config、菜单/商品/规格/活动与库存展示；
- 商品加入本地购物车、前端活动/会员/coupon 价格预览逻辑；
- 营业时由官方流程进入 confirm route，填写本地订单资料、查看付款方式，并看到受 `enableAddOrder` 控制的提交按钮；
- `tapSubmit -> formatData/formatProduct -> POST /api/order/add-order` 的完整静态 payload 边界。

本轮观测时相关门店处于闭店状态，因此没有绕过营业限制进入 confirm。即使 confirm route 可直接打开，也不能证明某一 cart 可提交。

点击最终提交后才进入不可只读验证的边界：

1. `/api/order/add-order` 创建真实订单并返回 `data.order_id`；
2. 前端随后清空本地 cart、进入订单详情并查询服务器订单状态；
3. `/api/payment/pay-order` 以 `order_id`、服务器应收金额/客户端 total 和支付方式换取动态 `form`、URL 或支付参数；
4. 支付状态、收单回调、优惠最终重算与订单归属只能由服务端/支付方确认。

因此 PINME 不能提供“预先计算好、无订单的支付 deep link”。最多交接到官方门店/桌号入口或官方 cart/confirm 流程；不要由 CUpedia 后端预创建订单来换支付 URL。
