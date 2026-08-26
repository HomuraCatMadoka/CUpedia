# CUSIS 登录会话接入方案调研

Status: Research snapshot

Last verified: 2026-08-27

## 结论

如果目标是让用户在部署于 Vercel 的 CUpedia 页面里完成 CUSIS 登录，然后由 CUpedia 读取课程历史、当前课程、Shopping Cart 和毕业要求，那么：

- **纯前端、CUSIS iframe、CUSIS popup 都不能读取数据。** 浏览器会把 CUpedia 和 CUSIS 当成两家网站；登录成功不等于 CUpedia 获得了读取另一家网站页面、Cookie 或接口响应的权限。
- **普通 Vercel Function 可以运行打包进去的无头 Chromium，但不能直接给用户一个看得见、可操作的登录窗口。** 要补上画面传输和鼠标键盘转发后，它才成为远端浏览器。
- **本机 Next.js + 本机 Playwright 可行，且是最低成本的技术验证。** 但浏览器窗口开在运行 Next.js 的电脑上，因此不适用于普通用户访问线上 Vercel 部署。
- **线上第一版最值得验证的是 Vercel Sandbox + Chrome + noVNC + Playwright。** Vercel 官方已有把 Sandbox 内的 Chrome 桌面通过 noVNC 嵌入 Next.js iframe 的开源示例。它不依赖 Kernel 或第三方云浏览器，也不需要另租服务器，但仍然是在构建一个小型、私有的远端浏览器流程。
- **自托管 browser worker 可行，但运维更多。** 只有当 Sandbox 的网络、成本、产品成熟度或安全控制不能满足要求时，才值得切换。

因此，部署态的最低复杂度推荐不是普通 Vercel Function，而是先做一个 **Vercel Sandbox 内测 spike**。用户只在远端 Chrome 里输入 CUHK 密码和多因素认证；同步结束后只把标准化课程数据返回 CUpedia，并立即销毁浏览器会话。

## 为什么“已经在 CUSIS 登录”仍然不能让 CUpedia 前端读取

浏览器的[同源策略](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Same-origin_policy)规定，不同协议、主机或端口属于不同“来源”。CUpedia 页面最多可以打开 CUSIS 窗口，但不能读取其 DOM。跨来源窗口只有在对方页面主动配合时，才能通过 [`postMessage`](https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage) 传递数据；本次没有观察到 CUSIS 提供这种集成。

跨来源 `fetch` 也不是绕路。浏览器只有在 CUSIS 明确返回允许 CUpedia 来源和凭据的 CORS 响应头时，才会把响应交给 CUpedia JavaScript；即使设置 `credentials: "include"` 也一样。详见 MDN 的 [CORS 指南](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS)和 [Fetch credentials 说明](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch#including_credentials)。

CUSIS 的会话 Cookie 也不能“转交”给 CUpedia：

- `HttpOnly` Cookie 不能被 JavaScript 读取；没有 `Domain` 属性的 Cookie 只发给设置它的主机。[Set-Cookie 说明](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie)
- 浏览器 JavaScript 不能自行设置 `Cookie` 请求头。[Forbidden request header 说明](https://developer.mozilla.org/en-US/docs/Glossary/Forbidden_request_header)

### 2026-08-27 的 CUSIS 只读探测

本次只做了匿名 `GET`、`HEAD` 和 `OPTIONS`，没有提交登录表单，也没有使用或保存任何用户凭据：

- [CUSIS PeopleSoft landing page](https://cusis.cuhk.edu.hk/psc/CSPRD/EMPLOYEE/HRMS/c/NUI_FRAMEWORK.PT_LANDINGPAGE.GBL?) 返回 `302`，跳转到 CUHK ADFS 的 SAML 登录流程；响应设置了一个 host-only、`HttpOnly; Secure` 的负载均衡 Cookie。
- 带 `Origin: https://www.cupedia.app` 的 `GET` 和预检 `OPTIONS` 响应均未返回 `Access-Control-Allow-Origin` 或 `Access-Control-Allow-Credentials`。
- 跳转后的 CUHK ADFS 登录页返回 `X-Frame-Options: DENY`。这会禁止页面被任何站点放进 iframe，详见 [X-Frame-Options](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/X-Frame-Options)。
- 匿名读取到的 [PeopleSoft 运行时 bundle](https://cusis.cuhk.edu.hk/cs/CSPRD/cache/PT_AJAX_NET_MIN_1.js) `PT_AJAX_NET_MIN_1.js` 中确实出现了 `/PSIGW/RESTListeningConnector/`，但相关代码只是把顶层页面导航到一个 REST URL。Oracle 文档说明，只有管理员导出的 PeopleSoft Application Services 才能供第三方使用，并受安全配置控制；因此一个通用运行时字符串不等于 CUHK 已公开课程 API。[Oracle Application Services 文档](https://docs.oracle.com/en/applications/peoplesoft/peopletools/8.63/integration-broker/exporting-application-services.html)

这些结果证明当前不能把“用户在 CUSIS 登录一次”直接变成“CUpedia 前端可调用 CUSIS API”。它们不证明 CUHK 永远不存在未公开接口；真正的课程读取 endpoint 和返回结构仍需在用户授权的登录会话中逐页验证。

## 方案对比

| 方案                                          | 能否完成目标                     | 关键原因                                                                                                                        | 第一版判断         |
| --------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| 1. 纯前端浏览器                               | 否                               | 同源策略挡住 DOM；CUSIS 当前没有允许 CUpedia 的 credentialed CORS；JS 读不到 `HttpOnly` Cookie                                  | 排除               |
| 2. 本地 Next.js + 本机 Playwright             | 是，仅本机                       | Playwright 在同一台电脑打开有界面的 Chrome，用户直接登录；自动化随后复用同一个 BrowserContext                                   | 最低成本技术验证   |
| 3. Vercel Function + Chromium/Playwright      | 只能做已有会话下的一次性无头任务 | Chromium 不是 Function 自带能力；即使打包成功，浏览器窗口也在服务器，没有用户可操作的桌面；跨请求保存进程和内存不是可靠会话存储 | 不适合交互式登录   |
| 4. 自托管 browser worker                      | 是                               | 长驻 VM/容器负责浏览器、画面、输入和会话；CUpedia 只做鉴权与结果接收                                                            | 可行但运维最高     |
| 5a. reverse proxy                             | 理论上可以，实际不推荐           | 必须代理并重写 CUSIS、ADFS/SAML 的页面、表单、脚本、跳转和 Cookie；密码、MFA 与会话材料都会经过 CUpedia 代理                    | 脆弱且安全边界过大 |
| 5b. iframe / popup                            | 只能用于导航登录，不能抽取数据   | ADFS 明确拒绝 iframe；popup 仍受同源策略限制，除非 CUSIS 主动 `postMessage`                                                     | 排除               |
| 6. Vercel Sandbox + Xvnc/openbox/noVNC/Chrome | 是，最符合线上约束               | Sandbox 运行完整隔离 Linux VM；公开端口把 noVNC 桌面送进 CUpedia iframe；Playwright 在 VM 内读取同一 Chrome 会话                | **线上内测首选**   |

### 1. 纯前端浏览器

可做的只有 `window.open(CUSIS_URL)`，让用户在独立标签页登录。登录状态保存在 CUSIS 来源下，CUpedia 不能读取它。添加一个 Next.js API route 也不会改变这一点：浏览器不会把 CUSIS Cookie 发给 CUpedia route。

### 2. 本地 Next.js + 本机 Playwright

Playwright 可以用 `headless: false` 打开本机窗口，也可以用 [`launchPersistentContext(userDataDir)`](https://playwright.dev/docs/api/class-browsertype#browser-type-launch-persistent-context) 将 Cookie 和 localStorage 放在指定浏览器目录。最安全的内测方式是每次创建临时目录，只在内存或临时磁盘保留会话，提取完成后删除。

这条路适合先证明：登录和 MFA 是否能完成、四类页面能否稳定定位、数据能否标准化。它不适合线上用户，因为部署后“本机”变成了 Vercel 的服务器，用户看不到那个窗口。

Playwright 也支持导出包含 Cookie、localStorage 和 IndexedDB 的 [`storageState`](https://playwright.dev/docs/api/class-browsercontext#browser-context-storage-state)，但官方明确提醒这类文件可能让持有者冒充账号，不能提交进仓库。[Playwright authentication 指南](https://playwright.dev/docs/auth)

### 3. Vercel Function 自带 Chromium / Playwright

准确说法是：**Vercel Function 不自带可直接使用的 Chrome 桌面。** Vercel 的 [Puppeteer 模板](https://vercel.com/templates/template/puppeteer-on-vercel)使用 `@sparticuz/chromium-min`，说明应用需要自行提供或下载兼容的 Chromium。

Vercel Node.js Function 有可写但临时的 `/tmp`，实例闲置后会被归档，详见 [Vercel runtimes](https://vercel.com/docs/functions/runtimes)。Fluid Compute 的暖实例有时可复用全局变量和子进程，但请求并发、扩容和冷启动意味着不能把用户浏览器永久绑在某个 Function 进程上。[Fluid Compute](https://vercel.com/docs/fluid-compute)

2026 年 Vercel 已把 Node/Python Function 的最长运行时间提高到 30 分钟 beta，并把包体上限提高到 5 GB beta，浏览器自动化也被列为使用场景。[时长公告](https://vercel.com/changelog/vercel-functions-can-now-run-up-to-30-minutes)、[包体公告](https://vercel.com/changelog/vercel-functions-can-now-be-up-to-5-gb-in-package-size)。这缓解了“跑不动 Chrome”的问题，却没有解决“用户怎样看见它并输入密码/MFA”。如果自己再实现画面串流和输入转发，本质上已经进入方案 4 或方案 6。

### 4. 自托管 browser worker

可以在一台自己管理的 VM 或容器上运行 Playwright。Playwright 支持 [`launchServer()` / `connect()`](https://playwright.dev/docs/api/class-browsertype#browser-type-launch-server) 做远端控制，但它只提供自动化连接，不会自动生成给终端用户使用的远程桌面。

因此还要负责每用户隔离、画面串流、鼠标键盘输入、会话 ID 映射、超时销毁、日志脱敏、补丁和扩容。它完全可行，也不依赖云浏览器供应商，但对第一版比 Sandbox 重。

### 5. reverse proxy、iframe 或 popup

reverse proxy 若只转发“数据 API”，拿不到用户浏览器里的 CUSIS Cookie；若代理整个登录网站，就要改写多个主机之间的 SAML 跳转、页面链接、表单 action、静态资源和 Cookie 范围，还要处理 PeopleSoft 的页面状态。它会让用户实际上通过 CUpedia 输入 CUHK 密码和 MFA，并迫使应用绕过 ADFS 的 framing 防护，不适合作为内测捷径。

iframe 已被当前 ADFS 的 `X-Frame-Options: DENY` 明确阻止。popup 能显示登录页，但 CUpedia 不能读取其中内容，所以只能作为人工导航，不是同步方案。

### 6. Vercel Sandbox + noVNC + Chrome

[Vercel Sandbox](https://vercel.com/docs/sandbox)可以通过 `@vercel/sandbox` 从 Next.js 创建隔离的 Linux microVM；部署在 Vercel 时，OIDC 鉴权由平台自动提供。Sandbox 可以暴露端口并通过 [`sandbox.domain(port)`](https://vercel.com/docs/sandbox/sdk-reference#sandboxdomain) 得到公开 URL。

Vercel Labs 的 [AI SDK Computer Use 示例](https://github.com/vercel-labs/ai-sdk-computer-use/tree/ed103da5ebe75112850fbba39872206dd3c439de)已经验证了关键拼图：snapshot 内安装 Xvnc、openbox、noVNC/websockify 和 Chrome，暴露 `6080`，把 noVNC URL 放进 Next.js iframe。这里 iframe 装的不是 CUSIS，而是远端桌面的像素流，所以不会被 CUSIS/ADFS 的同源和 framing 规则挡住。

这仍需补一层 Playwright：用户在远端 Chrome 中登录后，运行在同一 Sandbox 的 adapter 复用该浏览器上下文，访问四类页面并提取数据。

当前官方示例是可行性 demo，不是安全模板：它用 `Xvnc -SecurityTypes None`，而 Sandbox 暴露端口是公开 URL。CUpedia 版至少要加入单次短期访问凭证、将 sandbox ID 绑定到已登录的 CUpedia 用户，并禁止任何人凭 URL 接管桌面。

还有一个容易忽略的当前默认值：Sandbox 的文件系统现在**默认会在停止时创建快照并在下次恢复**，并非天然一次性。CUSIS 同步必须显式设置 `persistent: false`，结束时关闭 Chrome、停止并删除 Sandbox，不能保存浏览器 profile。[Sandbox 生命周期](https://vercel.com/docs/sandbox/concepts)

Sandbox 默认会在 5 分钟停止；Hobby 单次最长 45 分钟，Pro/Enterprise 单次最长 24 小时。登录用例应主动设置一个短的 10–15 分钟期限并在成功、取消或超时后立即销毁。[Sandbox pricing and limits](https://vercel.com/docs/sandbox/pricing)

## 推荐的第一版交互

建议只做一个 `/cusis-sync` route，并把“连接”和“分析”拆开：

1. 用户在 CUpedia 登录后点击“连接 CUSIS”。服务端为该用户创建 `persistent: false` 的 Sandbox，并启动 Chrome 桌面。
2. 页面显示 noVNC 远端桌面。Chrome 直接打开官方 CUSIS；用户在其中完成 CUHK SSO 和 MFA。CUpedia 表单不接收、记录或自动填写学校密码。
3. 用户点击 CUpedia 页面外层的“我已登录，开始同步”。第一版不必自动猜测登录是否完成。
4. Sandbox 内的 adapter 依次读取课程历史、当前课程、Shopping Cart 和毕业要求页面。先从 DOM/PeopleSoft 响应提取，再转换成 CUpedia 自己的稳定数据结构。
5. 只把标准化 JSON 返回 CUpedia。搜索、筛选、排课表和毕业要求分析都在 CUpedia 数据上进行，不再实时操纵 CUSIS UI。
6. 无论成功、失败、取消或超时，都关闭浏览器并删除 Sandbox；不保存 Cookie、浏览器 profile、密码、MFA 内容或原始页面 HTML。

第一轮 spike 应只验证登录加一个页面，例如“本学期课程”。成功标准是：普通内测用户能在 Vercel 部署中看见远端 Chrome、完成 SSO/MFA、返回一份脱敏后的结构化课程列表，并且结束后无法再访问该桌面。之后再扩展 Shopping Cart、课程历史和毕业要求；不要一开始同时解决四种页面的解析。

## 仍需实测的未知项

- CUHK ADFS 是否会因为 Sandbox 的数据中心 IP、自动化 Chrome 特征或 MFA 策略拒绝登录。
- 登录后四类页面实际使用的是稳定 JSON endpoint，还是依赖 PeopleSoft `.GBL` 表单状态的 HTML/partial HTML。
- CUSIS 闲置超时、并发登录和重新认证行为。
- Sandbox 公开端口前如何放置足够强的短期访问控制；Vercel Labs demo 的无密码 VNC 配置不能直接复用。
- 内测用户平均同步时长、Sandbox 区域到 CUHK 的网络延迟和实际费用。

这些未知项影响实现细节，但不改变架构边界：浏览器原生前端不能借用 CUSIS 登录态；需要一个真正持有该会话的浏览器运行环境。对线上 Vercel 内测，Sandbox 是目前最少新增基础设施的候选。
