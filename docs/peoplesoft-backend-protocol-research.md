# PeopleSoft PIA / Fluid 后端通信机制调研

Status: Research snapshot

Last verified: 2026-08-27

## 范围与方法

本文只依据 Oracle 官方 PeopleSoft / PeopleTools 文档与 Oracle 官方测试工具文档，解释 PeopleSoft 页面通信和正式集成接口之间的边界。没有访问任何 CUSIS 登录会话，没有探测 CUHK 的未知接口，也没有收集个人数据。

## 结论

- `...MENU.COMPONENT.GBL` 是 **PeopleSoft 组件页面地址**，不是 REST API。最后的 `GBL` 是组件的市场（Market）代码，表示全球通用版本。
- 普通 PIA（PeopleSoft Internet Architecture）组件是有状态的服务器页面。浏览器提交控件动作时，需要带回服务器刚生成的隐藏状态字段；页面状态过期、字段落后或动作不匹配都可能失败。因此不能把一次浏览器录制得到的请求参数当成稳定 API。
- `ICStateNum`、`ICSID` 等值应视为动态且不透明的会话/页面关联材料。Oracle 自己的负载测试工具也会从最新响应中提取并替换它们，而不是硬编码。
- `ICAction` 表示页面上发生的动作或被触发的控件。它不是一个具有稳定业务语义和固定 JSON schema 的 REST operation。
- Oracle 的公开文档没有给出 `ICAJAX` 或 `ICAppClsData` 的稳定第三方接口契约。不能仅凭字段名猜其语义。尤其不要把 PIA 内部的 AJAX 回传，与 Oracle 明确定义的 Integration Broker REST 服务混为一谈。
- PeopleSoft 确实有正式 REST 能力：管理员通过 Integration Broker 定义并发布 service operation；旧版本生成 WADL，PeopleTools 8.60 起可生成 OpenAPI。较新的 Application Services 还可以通过官方 discovery service 列出**已导出且调用方有权访问**的服务。
- 对 CUpedia 来说，优先顺序应是：先确认校方是否已发布可访问的 OpenAPI/WADL 服务；若没有，再用短命浏览器会话驱动 PIA 页面，并把它明确封装成易更换的页面 adapter，而不是称作 CUSIS API。

## 1. `.GBL` 页面到底是什么

Oracle 定义的组件 URL 由 portal、node、内容类型和内容 ID 组成。组件内容 ID 的格式是 `menu.component.market`；官方示例为 `MAINTAIN_SECURITY.USERMAINT.GBL`。[Oracle: Basic Portal URL Format](https://docs.oracle.com/cd/E05317_01/psft/acrobat/pt849prt-b0307.pdf)

`GBL` 是 Market 属性，不是类似 `.json` 的响应格式后缀。Oracle 说明，在全球范围使用的组件通常把 Market 设为 `GBL`，而面向特定地区的变体可以使用 `FRA` 等代码。[Oracle: `%Market` system variable](https://docs.oracle.com/en/applications/peoplesoft/peopletools/8.63/peoplecode-language-reference/market.html)

一个完整组件 URL 可以表达：

```text
/psc/<site>/<portal>/<node>/c/<menu>.<component>.<market>
```

其中 `psc` 是 content servlet，返回不带 portal 外壳的内容；`psp` 是 portal servlet。Oracle 明确说明 `psc` URL 仍要求 portal 和 node 占位，即使 content servlet 本身不使用它们。[Oracle: URL Format for Unwrapped PIA Content](https://docs.oracle.com/en/applications/peoplesoft/peopletools/8.63/portal-technology/url-format-unwrapped-peoplesoft-pure-internet-architecture-content.html) Oracle 提供的 `GenerateComponentContentURL` 也把 menu、market、component、page、action 和 key list 作为独立参数来生成这种 URL。[Oracle: GenerateComponentContentURL](https://docs.oracle.com/en/applications/peoplesoft/peopletools/8.63/peoplecode-language-reference/generatecomponentcontenturl.html)

所以直接 `GET` 一个 `.GBL` 地址，只是在打开一个组件。它可能先进入搜索页，也可能根据 key 和权限打开记录；它不承诺返回稳定的数据结构。

## 2. PIA 为什么是有状态页面协议

Oracle 的 PIA 管理文档把页面状态描述为保存在 Web 服务器上的二维结构 `State[ICElementNum][ICStateNum]`。每次服务器往返都会产生状态；超出 `maxSavedState` 后，旧状态会被移除，浏览器返回旧页面时会出现 “Page Expired”。[Oracle: PeopleSoft Internet Architecture Administration](https://docs.oracle.com/cd/B28723_01/psft/acrobat/tools842svt-b1102.pdf)

Oracle OpenScript 的 PeopleSoft Load Test Module 进一步证明这些不是可硬编码的业务参数：它内置 correlation rules，从响应 HTML 的隐藏字段或脚本中提取最新 `ICStateNum` 和 `ICSID`，再替换后续录制请求中的旧值。官方把这类规则称为对 PeopleSoft 动态数据的参数化。[Oracle: Using the PeopleSoft Load Test Module](https://docs.oracle.com/cd/E59557_01/OPSUG/opscrpt_using_peplt_module.htm)

可以把它理解成：

```text
打开组件
  -> 服务器创建当前页面状态并返回 HTML + 隐藏字段
  -> 用户点击某个控件
  -> 浏览器把当前表单状态 + 控件动作发回
  -> 服务器执行 PeopleCode / 组件逻辑并生成下一份状态
```

这与 REST 的心智模型不同。REST 调用通常凭资源 URL、方法和明确的请求 schema 工作；PIA 回传还依赖“这位用户当前正在操作哪一版页面”。

## 3. 常见 `IC*` 字段能确认到什么

| 字段           | 官方资料能确认的含义                                                                                                                         | 集成时应如何处理                                                                                   |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `ICStateNum`   | 与 `ICElementNum` 一起索引 Web 服务器保存的页面状态；每次往返会推进，旧状态可能过期。                                                        | 只使用当前页面刚返回的值；不要跨页面、跨会话或长期保存。                                           |
| `ICElementNum` | Oracle 称其为系统控制值，是服务器状态索引的一部分。                                                                                          | 视为动态页面状态；不要自行编造。                                                                   |
| `ICSID`        | Oracle OpenScript 将它识别为隐藏字段中的动态值，并为回放做 correlation；公开文档没有给出可依赖的业务语义。                                   | 当作不透明动态标记，跟随当前 BrowserContext 和最新响应。不要因为名字像 session ID 就自行定义契约。 |
| `ICAction`     | Oracle 的监控文档称它为执行动作的 ID，可以是 OK 按钮或其他页面动作；Query URL 也用它表示 `ICQryNameURL` 等导航动作。                         | 它是 UI 事件/导航动作，不是稳定 REST operation。具体值与组件控件定义耦合。                         |
| `ICAJAX`       | 在本次查阅的 Oracle 公开 PeopleTools 文档中没有找到该字段的第三方契约。                                                                      | 即使页面请求使用它，也只应视为 PIA 客户端实现细节；不可据此宣布发现 JSON API。                     |
| `ICAppClsData` | 在本次查阅的 Oracle 公开 PeopleTools 文档中没有找到字段级契约。Activity Guide 官方资料只确认实例可以携带上下文数据并调用 application class。 | 不解析、不构造、不持久化；若页面流程需要，由浏览器执行官方脚本并原样维护。                         |

`ICAction` 的官方旁证包括：Oracle RUEI 的 PeopleSoft 监控维度把它描述为用户执行的动作 ID；Oracle Query 文档展示 `ICAction=ICQryNameURL=PUBLIC...` 用于 query drilling URL。[Oracle: PeopleSoft Support in RUEI](https://docs.oracle.com/cd/E26370_01/doc.121/e26360/psft.htm) [Oracle: Defining Query Drilling URLs](https://docs.oracle.com/en/applications/peoplesoft/peopletools/8.63/query/defining-query-drilling-urls.html)

这里刻意不给 `ICAJAX` 和 `ICAppClsData` 补一个“听起来合理”的定义：没有官方契约时，字段名和压缩后的 JavaScript 都不足以建立稳定集成边界。

## 4. 不要混淆两种 AJAX

PeopleSoft 页面内部可能使用异步请求更新当前组件的一部分；抓包时可能看到 `ICAJAX` 一类内部字段。但 Oracle 正式文档中的 **AJAX Transfers** 是另一个更具体的功能：在 Activity Guide 或 master/detail 这类 Fluid wrapper 中，组件之间的跳转可以留在 wrapper 的 target content area，而不是替换整个窗口。

Oracle 说明 AJAX Transfers 只适用于 `Transfer`、`TransferExact`、`ViewContentURLClassic`、`ViewContentURLFluid` 四类 PeopleCode 跳转；默认关闭。Activity Guide / Fluid navigation collection 用 URL 参数 `AJAXTransfer=y` 开启，master/detail 用 `ICAJAXTrf=true`，自定义 wrapper 也可以用 `SetMDAJAXTrf`。[Oracle: AJAX Transfers, PeopleTools 8.60 Fluid UI Guide](https://docs.oracle.com/cd/F82754_01/psft/pdf/pt860tflu-b062023.pdf) [Oracle: SetMDAJAXTrf](https://docs.oracle.com/en/applications/peoplesoft/peopletools/8.63/peoplecode-language-reference/setmdajaxtrf.html)

因此：

- `AJAXTransfer=y` / `ICAJAXTrf=true` 控制 wrapper 内的组件跳转方式。
- 页面回传中的 `ICAJAX` 即使存在，也不能仅凭相似名字等同于 AJAX Transfers。
- 两者都不等于 Integration Broker REST API。

## 5. Activity Guide 如何工作

Activity Guide 是一个带步骤、顺序、依赖、权限和进度状态的流程容器。模板定义属性、参与者、上下文数据和 action items；运行时从模板生成实例。实例的 key context data 用来区分不同流程，例如员工 ID、地区等。[Oracle: Activity Guide Templates and Instances](https://docs.oracle.com/en/applications/peoplesoft/peopletools/8.63/portal-technology/activity-guide-templates-instances.html) [Oracle: ContextData Class](https://docs.oracle.com/en/applications/peoplesoft/peopletools/8.63/peoplecode-api-reference/contextdata-class.html)

Activity Guide 的每一步可以链接到本地或远程 transaction，也可以链接外部 URL；访问权限和步骤依赖会影响用户是否能打开它。[Oracle: Using Activity Guides](https://docs.oracle.com/en/applications/peoplesoft/peopletools/8.63/applications-user-s-guide/using-activity-guides-1.html)

Activity Guide 本身也有正式 URL 类型。Oracle 的 `GenerateActGuideContentUrl` 生成 `/l/<activity-guide>.<component>.<market>` 形式的 content servlet URL，而不是 `/c/<menu>.<component>.<market>` 组件 URL。[Oracle: GenerateActGuideContentUrl](https://docs.oracle.com/en/applications/peoplesoft/peopletools/8.63/peoplecode-language-reference/generateactguidecontenturl.html)

这意味着毕业要求一类功能若由 Activity Guide 承载，adapter 面对的不只是“读一张课程表”：还可能需要启动或打开一个特定实例、传入上下文、遵守步骤权限，然后在 wrapper 中加载实际组件。它仍是状态化 UI 流程，除非系统另外发布了对应的 Integration Broker 服务。

## 6. 官方支持的 REST / Integration Broker 发现方式

PeopleSoft 的正式 REST 入口属于 **Integration Broker**。管理员需要先配置 REST target location，再创建 provider REST service、service operation、routing、handler 和 resource URI template。Oracle 明确说明 provider REST operation 是同步 operation，并由 handler 执行业务逻辑。[Oracle: Understanding REST Service Operations](https://docs.oracle.com/en/applications/peoplesoft/peopletools/8.63/integration-broker/understanding-rest-service-operations.html) [Oracle: Managing REST Resources](https://docs.oracle.com/en/applications/peoplesoft/peopletools/8.63/integration-broker/managing-rest-resources.html)

典型 REST 基地址由管理员配置为：

```text
https://<host>/PSIGW/RESTListeningConnector/<default-local-node>
```

[Oracle: Setting Target Locations for REST Services](https://docs.oracle.com/en/applications/peoplesoft/peopletools/8.63/integration-broker-administration/target-locations.html)

元数据和发现路径分两代：

- PeopleTools 8.60 之前，REST service 元数据使用 WADL；8.60 起也支持 OpenAPI。[Oracle: Understanding Managing REST Services](https://docs.oracle.com/en/applications/peoplesoft/peopletools/8.63/integration-broker/understanding-managing-rest-services.html)
- 对 Application Services，管理员执行 Export 后会生成 OpenAPI。Oracle 提供 `PTIB_SERVICELIST_GET`，可从 `.../servicelist.v1/discovery` 返回调用方可访问的已导出服务及其 OpenAPI 链接。[Oracle: Exporting Application Services](https://docs.oracle.com/en/applications/peoplesoft/peopletools/8.63/integration-broker/exporting-application-services.html)
- 传统 provider REST service 可以在 PeopleSoft 的 Provider REST Template 工具中读取已经生成的 WADL 并测试 operation。[Oracle: Provider REST Template](https://docs.oracle.com/en/applications/peoplesoft/peopletools/8.63/integration-broker-testing-utilities-and-tools/using-provider-rest-template-page.html)

“有 discovery URL”不表示任何登录用户都能列出全部服务。Oracle 说明 provider REST operations 使用 permission lists 控制权限，并可要求 Basic Auth、OAuth 2.0、PeopleSoft Token、SSL 等验证方式。[Oracle: Securing Provider REST Service Operations](https://docs.oracle.com/en/applications/peoplesoft/peopletools/8.63/integration-broker/securing-provider-rest-service-operations.html)

也不能假定浏览器已经登录 PIA，就一定能用同一 Cookie 调用 Integration Broker。Oracle 将 Integration Broker 的 inbound user authentication 和 service-operation permission list 作为独立验证流程；具体身份映射与凭据取决于管理员配置。[Oracle: Integration Broker User Authentication](https://docs.oracle.com/en/applications/peoplesoft/peopletools/8.63/integration-broker-administration/user-authentication.html)

因此，安全且有意义的发现方式是让 PeopleSoft 管理员确认或提供：

1. 已发布 service / application service 的名称；
2. WADL 或 OpenAPI 文档；
3. REST target location；
4. 调用身份、认证方式和 permission list；
5. 版本、字段定义和变更约定。

不能从一个 `.GBL` 页面名推导出对应 REST endpoint；PeopleSoft 也不会自动把每个组件公开成 Integration Broker API。

## 7. 如何区分内部页面请求与稳定 API

| 信号     | PIA / Fluid 内部页面请求                                        | 正式 Integration Broker API                                               |
| -------- | --------------------------------------------------------------- | ------------------------------------------------------------------------- |
| 地址     | 常见 `/psp/`、`/psc/` 和 `/c/menu.component.market`             | 常见 `/PSIGW/RESTListeningConnector/<node>/...`                           |
| 返回     | 完整 HTML、局部 HTML、脚本指令或页面控件状态                    | 文档约定的 JSON/XML 等消息                                                |
| 请求状态 | 带 `ICStateNum`、`ICSID`、`ICElementNum`、`ICAction` 和表单字段 | 按 OpenAPI/WADL 定义的 path、query、header、body                          |
| 生命周期 | 依赖当前登录会话、当前组件实例和最新服务器页面状态              | 依赖明确的调用身份、service operation 权限和版本化资源                    |
| 动作命名 | 常是页面控件 ID 或 PeopleSoft 导航动作                          | HTTP method + resource URI + service operation                            |
| 可发现性 | 从页面 HTML/JavaScript 观察到，但没有外部兼容承诺               | 由管理员发布 WADL/OpenAPI；Application Services 可进入官方 discovery 列表 |
| 稳定性   | 页面补丁、配置、个性化、语言或 PeopleTools 升级都可能改变       | 仍会演进，但至少存在显式服务定义和机器可读契约                            |

判断规则很简单：**看到 fetch/XHR 不等于看到 API。** 只有当请求对应已发布的 Integration Broker service，并能拿到该服务的 WADL/OpenAPI 或管理员提供的契约时，才应把它当成稳定 API。否则它只是浏览器正在替用户操作 PeopleSoft 页面。

## 8. 对 CUpedia adapter 的建议

如果后续没有发现校方正式发布的服务，可以实现页面 adapter，但边界要保守：

1. 让 Playwright 保持完整、短命的 BrowserContext；页面自己维护 Cookie、隐藏字段、JavaScript 和服务器状态。
2. 通过正常的页面导航和可见控件触发只读流程，不手工拼接 `ICStateNum`、`ICSID`、`ICAJAX` 或 `ICAppClsData` 请求。
3. 每种数据源建立独立 adapter，例如 current courses、history、cart、requirements；adapter 输出 CUpedia 自己版本化的 JSON。
4. parser 只依赖最少量的可验证页面结构，并保存不含个人数据的 fixture 做回归测试；不要持久化原始 HTML、Cookie 或 `IC*` 状态。
5. 把 `sourceKind` 标为 `peoplesoft-page-adapter`，不要伪装成 `cusis-api`。这样未来出现正式 OpenAPI 时，可以替换输入层而不改分析模型。
6. 遇到 Page Expired、登录重定向、权限页或未知 wrapper 状态就停止并要求重新同步，不尝试猜测或修补状态字段。

建议的抽象边界是：

```text
CUSIS temporary browser session
  -> PeopleSoft page adapters (unstable, UI-coupled)
  -> normalized personal-course snapshot (stable, versioned)
  -> CUpedia filters / timetable / graduation analysis
```

这个结构把最脆弱的 PeopleSoft 页面协议关在 adapter 内。课程分析只读 CUpedia 的标准化 snapshot，不需要理解 `.GBL`、Activity Guide 或任何 `IC*` 字段。

## 仍需由授权环境确认的事项

- CUHK 是否启用了 Integration Broker REST target location。
- 是否导出了与学生课程、Shopping Cart 或学业要求有关的 service / application service。
- 当前账号是否被授予 discovery service 或具体 service operation 的 permission list。
- 四类 CUSIS 页面分别是普通 Fluid component、Activity Guide，还是自定义组合。
- 页面 adapter 在有真实非空数据的账号上能否稳定抽取结构化字段。

这些只能通过校方提供的元数据，或在明确授权的环境中检查。本文不从公开页面路径猜测任何 CUHK endpoint。
