# iCHEF 匿名店内点餐与支付跳转调研

调研日期：2026-08-12（Asia/Hong_Kong）
目标门店：`#FOTD`，iCHEF public ID `UQftKWxU`，桌号参数 `VDE`

## 结论

匿名点餐是 iCHEF 官方前端支持的正常流程，但这里的“匿名”不是“无状态地向一个下单 API POST 一份菜品 JSON”。官方流程先用有效桌号创建 ordering session，再为当前浏览器创建 diner，购物车及下单均绑定该 session；前端还把本机 diner UUID 保存在 local storage。会员登录是可选的独立能力，不是这个门店建立 diner、加入购物车或送单 mutation 的必填前置条件。

不建议由 CUpedia 后端代游客调用这些 mutation。最安全且稳定的集成是给游客返回 iCHEF 官方桌号链接：

<https://shop.ichefpos.com/store/UQftKWxU/instore/ordering?tableName=VDE>

游客进入后，由 iCHEF 官方页面负责创建 session、选择菜品、处理动态库存与营业时段、采集结账资料、生成订单，并跳转到支付服务商。CUpedia 不接触 session、diner、支付参数或订单状态。

## 一手来源

本结论只使用以下 iCHEF 一手来源：

- [iCHEF 官方店内点餐页面](https://shop.ichefpos.com/store/UQftKWxU/instore/ordering?tableName=VDE)。页面 HTML 声明当前前端版本 `2.367.0`。
- [RootApp 官方 bundle（2.367.0）](https://ichef-cloud2-production.s3.ap-northeast-1.amazonaws.com/online_restaurant_frontend/shared/2.367.0/js/RootApp-3NcLf.ee6b9259.js)：路由、session 查询、session 生命周期、支付时序。
- [InstoreOrderingMenuPage 官方 bundle（2.367.0）](https://ichef-cloud2-production.s3.ap-northeast-1.amazonaws.com/online_restaurant_frontend/shared/2.367.0/js/InstoreOrderingMenuPage-jXfc3.de86b9d1.js)：按桌号创建 session、创建 diner、更新人数。
- [InstoreOrderingOrderFormLayout 官方 bundle（2.367.0）](https://ichef-cloud2-production.s3.ap-northeast-1.amazonaws.com/online_restaurant_frontend/shared/2.367.0/js/InstoreOrderingOrderFormLayout-rGXMv.4b5eea0d.js)：结账表单、`sendOrder`、支付选项及成功后的官方订单页跳转。
- [iCHEF 公开 GraphQL endpoint](https://shop.ichefpos.com/api/graphql/online_restaurant)：执行了 `instoreOrderingInformationQuery` 与 `instoreOrderingPaymentOptionsQuery` 两个只读查询，并做了一次以明确无效桌号为输入的 `createSession` 可达性探测；该探测返回 `TableIsInvalidError`，没有创建有效 session。未调用 diner、cart、`sendOrder` 或支付 mutation。

bundle 带有 Sentry release `2.367.0-4da80d9`。以上带 hash 的资源可能在 iCHEF 后续发布中被替换，因此 operation 和 payload 都属于未承诺的前端内部接口，而不是稳定的第三方 API 合约。

## 匿名流程

### 1. 桌号链接进入菜单

官方路由表将菜单定义为：

```text
/store/:storePublicId/instore/ordering
```

它接受以下互斥用途的 query 参数：

- `tableName`：桌上二维码使用的桌号；当前二维码是 `VDE`。
- `sessionUuid`：返回或加入已经建立的 ordering session。
- `viewMenuOnly=true`：只看菜单，不建立可下单 session。

`RootApp` 的 redirector 明确表明：有 `tableName` 时进入菜单并由页面处理 session；只有 `viewMenuOnly=true` 时允许纯浏览。没有桌号、session 或 browse-only 标记时会进入 table/session not found 页面。

### 2. 创建 ordering session

菜单页定义：

```graphql
mutation instoreOrderingSessionCreateSessionMutation(
  $publicId: String!
  $tableName: String!
) {
  restaurant(publicId: $publicId) {
    order(platformType: ICHEF_INSTORE) {
      createSession(tableName: $tableName) {
        ... on CreateSessionOutputType {
          sessionUuid
        }
        ... on IPFNoModuleError {
          message
        }
        ... on IPFOverQuotaLimitError {
          message
        }
        ... on TableIsInvalidError {
          message
        }
        ... on EntryCodeCannotProduceError {
          message
        }
        ... on UnhandledError {
          message
        }
      }
    }
  }
}
```

这说明 API 层没有登录 token 变量，但服务端仍会验证桌号、模块开通状态、配额及 entry code。成功以后前端将 `sessionUuid` 放入 URL，并缓存为该门店最后一次 session。

补充的最小写入探测使用了**明确无效的桌号**（不带 cookie、Authorization 或会员凭据），服务端可达并返回 typed result `TableIsInvalidError`。这证明 GraphQL endpoint 与 `createSession` operation 对匿名客户端可达，也证明服务端会校验桌号；该探测没有创建有效 session。GraphQL introspection 当前同样可读。不过，可达/introspectable 不等于 iCHEF 向第三方承诺了公开 API 支持。

### 3. 创建本机 diner（点餐者）

菜单页接着调用：

```graphql
mutation instoreOrderingSessionCreateDinerMutation(
  $publicId: String!
  $sessionUuid: String!
  $payload: DinerPayload!
) {
  restaurant(publicId: $publicId) {
    order(platformType: ICHEF_INSTORE) {
      orderingSession(sessionUuid: $sessionUuid) {
        createDiner(dinerPayload: $payload) {
          uuid
          name
          avatar
        }
      }
    }
  }
}
```

官方表单的 diner payload 是 `{ name, avatar }`，必要时另用 `instoreOrderingSessionUpdatePeopleCountMutation` 更新用餐人数。成功后，前端以 session UUID 为 key 将返回的 diner UUID 存入 local storage，有效期 24 小时。这是为什么后端替游客创建 session 后只返回一个 URL 仍不完整：新浏览器没有对应的本机 diner 状态，官方页面仍需引导游客建立或加入 diner。

### 4. 加入购物车

菜品编辑器定义：

```graphql
mutation instoreOrderingSessionAddCartItemMutation(
  $publicId: String!
  $sessionUuid: String!
  $payload: CartItemInputObject!
) {
  restaurant(publicId: $publicId) {
    order(platformType: ICHEF_INSTORE) {
      orderingSession(sessionUuid: $sessionUuid) {
        addCartItem(payload: $payload) {
          ... on OkOutput {
            message
          }
          ... on MenuNodeSnapshotDoesNotExistError {
            message
          }
          ... on UnhandledError {
            message
          }
        }
      }
    }
  }
}
```

bundle 显示 payload 由完整菜品编辑器状态生成，至少包括根菜品/菜单 snapshot、数量、所选 modifier 树、备注、本机 diner UUID，以及推荐来源信息。modifier 是递归结构，不能安全地只凭 CUpedia 当前扁平菜单记录复原。购物车返回数据还带 `uuid` 与 `hashedValue`；后续更新、删除和送单用于并发一致性检查。

### 5. checkout 与送单

该门店的只读 `instoreOrderingInformationQuery` 当前返回：

```json
{
  "enabled": true,
  "onlineRestaurantUrl": "https://shop.ichefpos.com/store/UQftKWxU",
  "paymentTiming": "PREPAY",
  "publicId": "UQftKWxU",
  "name": "#FOTD"
}
```

只读 `instoreOrderingPaymentOptionsQuery` 当前返回：

```json
{
  "paymentOptions": [{ "type": "ALL_IN_PAY", "gatewayInfo": null }]
}
```

因此这家店目前是先付款（`PREPAY`），可选支付方式是 `ALL_IN_PAY`。这些都是门店动态设置，不能硬编码为长期事实。

最终送单 operation 是：

```graphql
mutation InstoreOrderingSessionSendOrderMutation(
  $publicId: String!
  $sessionUuid: String!
  $payload: SendOrderWithOnlineOrderCartPayload!
) {
  restaurant(publicId: $publicId) {
    order(platformType: ICHEF_INSTORE) {
      orderingSession(sessionUuid: $sessionUuid) {
        sendOrder(payload: $payload) {
          ... on OrderOutput {
            uuid
            traceUuid
            displayId
            totalAmount
            sendPayload
            expectedPickupAt
            payment {
              paymentOption
            }
          }
          ... on InstoreMealTimeLimitsReachedError {
            message
          }
          ... on InstoreLastOrderingTimeLimitsReachedError {
            message
          }
          ... on UnavailableItemsError {
            message
          }
          ... on NotEnoughPointsError {
            message
          }
          ... on InvalidRedeemNumberError {
            message
          }
          ... on TooManyPointsUsedError {
            message
          }
          ... on BelowRedeemThresholdError {
            message
            thresholdAmount
          }
          ... on CouponNotApplicableError {
            message
          }
        }
      }
    }
  }
}
```

### 能确认的 payload 边界

官方前端以多个 form module 组合 `SendOrderWithOnlineOrderCartPayload`。从 bundle 可以确认最终 payload 至少会组合：

- `cartItems`: 当前购物车项的 `{ uuid, hashedValue }`；
- `traceUuid`: 前端生成的订单追踪 UUID；
- `paymentRedirectUrl`: iCHEF 自己的订单结果页 URL，带 `sessionUuid`；
- `serviceType: DINE_IN`；
- `paymentOption` 及支付适配器动态补充的数据；
- `eater`（例如 email/device code，具体必填项由门店配置决定）；
- `orderComment`；
- 可选的 `checkoutModules`、会员、积分、优惠券字段。

不能在不产生真实状态的前提下确认某一笔有效订单的最终完整 JSON：它依赖 session 当前购物车、服务端返回的 hash、门店 checkout modules、会员状态及支付方式。尤其支付适配器会在提交前根据所选 payment option 动态加字段。因此不应把上述最小字段列表当成可直接 POST 的完整 schema。

送单后服务端仍会检查 hash、购物车是否为空、菜品/库存、营业及最后点餐时间、session 状态、模块状态、订单数量上限、积分、优惠券与支付时序。成功并不等于付款完成；官方前端会转到订单页，再根据支付结果与 session 生命周期继续处理。

## 支付跳转与链接 handoff

### 可以安全返回的链接

推荐返回桌号入口：

```text
https://shop.ichefpos.com/store/UQftKWxU/instore/ordering?tableName=VDE
```

这是二维码本身表达的官方入口。游客可以在 iCHEF 页面完成整个流程，包括支付。若只希望提供“查看菜单”，可返回：

```text
https://shop.ichefpos.com/store/UQftKWxU/instore/ordering?viewMenuOnly=true
```

但 browse-only 没有桌号 session，不能继续支付。

### 不可以预先返回的链接

不能在游客尚未建立购物车/订单时直接返回支付服务商 URL。对于 `ALL_IN_PAY`，支付 URL 是订单/付款流程产生的动态结果，而不是门店级固定链接；官方 GraphQL payment fragment 也把它建模为 `allInPay.paymentUrl`。它与金额、订单、transaction UUID、返回地址及服务端校验绑定。

也不建议由 CUpedia 后端预创建 session 后返回：

```text
/store/UQftKWxU/instore/ordering?sessionUuid=...
```

因为这会产生外部状态，session 默认生命周期可达 24 小时，可能消耗店家配额；而新浏览器仍没有 local diner UUID。桌号入口能让 iCHEF 自己按当前 session/table 状态决定“新建、加入或报错”。

官方还定义了 `/ordering/checkout-cart`、`/ordering/order/:orderTraceUuid` 等页面，但前者要求有效 session、cart 与 local diner，后者要求已经成功产生的 `orderTraceUuid`。它们都不是可从菜单记录静态构造的支付入口。

## 风险

- **真实业务副作用**：`createSession`、`createDiner`、cart 与 `sendOrder` 都写入餐厅系统；自动探测可能制造幽灵 session、占用配额或产生订单。
- **内部 API 无稳定性保证**：operation 名、input object、错误 union 与 bundle hash 会随 iCHEF 发布变化。
- **一致性与库存**：CUpedia 的每日菜单快照不含当前 session 的 snapshot/hash，也可能落后于停售、库存与 modifier 变更。
- **支付与合规**：代理提交会让 CUpedia 处理个人资料、支付跳转和订单争议，扩大安全及合规边界。
- **桌号滥用**：公开桌号链接理论上可在店外建立 session。链接应只在确有点餐意图的页面显示，不用于定时探测或预创建。
- **可用性变化**：当前门店是 `PREPAY + ALL_IN_PAY`，店家可随时切换支付时序、支付方式或关闭店内点餐。

## 推荐实现

1. 在 `canteen_menu_sources.config` 保存经过人工确认的官方 ordering URL 或 `tableName`，不要从菜名推断桌号。
2. CUpedia 菜单页显示“前往 iCHEF 点餐/付款”按钮，使用普通外链打开官方桌号 URL。
3. 在跳转前提示“将离开 CUpedia；菜品、价格、库存与付款状态以 iCHEF 页面为准”。
4. 不代理 `createSession`、diner、cart、`sendOrder` 或支付；也不把 iCHEF session UUID 存进 CUpedia 数据库。
5. 若未来需要预填购物车，只在取得餐厅与 iCHEF 的正式 API/合作授权后实施，并使用被支持的服务端 API，而不是复制网页内部 GraphQL。

综上，匿名 POST 在技术链路上存在，但不是适合后端封装的无状态公开下单 API。对当前产品目标，官方桌号链接 handoff 已能让游客匿名进入可下单并支付的完整界面，也是风险最低的方案。
