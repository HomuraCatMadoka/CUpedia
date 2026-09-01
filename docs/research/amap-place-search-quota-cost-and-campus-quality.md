# 高德地点搜索：配额、成本与 CUHK 校园查询质量

日期：2026-09-01

研究问题：高德 `AMap.PlaceSearch` / `AMap.AutoComplete` 和 Web 服务地点搜索要消耗多少额度、需要什么授权，是否值得进入 Campus Map P0？

代码基线：`52d252af3`（`main`）

## 结论

**不要把高德联合搜索设为课室、游泳池和校医室 P0 的上线门槛。** P0 继续由 CUpedia 自有的 Building / Place 搜索承担准确导航；高德搜索只适合成为一个可关闭的“搜索校园外部地点”补充。

原因不是单次 API 很贵，而是目前还有两个更大的未知数：

1. **许可状态未知。** 高德现行协议把自然人的个人研究学习、组织的商业使用和组织的非商业使用分开处理。法人或非法人组织的商业使用需要先购买技术服务许可；非商业组织需要提交证明，由高德评估。基础版许可公开价格为 ¥50,000/年，高级版为 ¥100,000/年。CUpedia 当前账号主体、用途认定和既有许可没有在仓库中记录，因此不能只按“30 元/万次”判断总成本。[服务协议第 3 节](https://lbs.amap.com/pages/terms/)、[技术服务许可和价格](https://lbs.amap.com/upgrade)
2. **CUHK 实际召回质量尚未验证。** 官方文档说明了搜索方法和返回字段，但没有公布香港中文大学建筑、英文名、缩写、设施或课室的覆盖率。当前 CUpedia 代理也明确不放行 PlaceSearch / AutoComplete；研究 worktree 没有可用 Key。本次没有绕过代理或复制生产密钥，实际高德地点搜索请求数为 **0**。

建议把联合搜索拆成一个独立上线门：先确认控制台中的账号等级、共享月配额、QPS、许可和香港服务权限，再用不超过 30 次调用的校园查询集验收。通过后，可以只在自有结果不足时显示一个明确的“搜索高德地点”动作；不要边输入边同时请求 CUpedia 和高德。

## 一、官方当前如何计费

高德当前把关键字搜索、周边搜索、多边形搜索、ID 查询和输入提示合并为“基础搜索服务”。它们在 API、JS、Android、iOS 和微信小程序之间**共用**配额，不是每个平台或每个搜索子类各有一份。[服务升级页的基础服务配额说明](https://lbs.amap.com/upgrade)、[基础服务计费说明](https://lbs.amap.com/pages/base_service_price)

| 账号档位           | 基础搜索月配额 | 文档表列 QPS |         超额单价 |
| ------------------ | -------------: | -----------: | ---------------: |
| 未认证             |              0 |            0 | 不应作为生产方案 |
| 个人认证           |       5,000 次 |            3 |  ¥30 / 10,000 次 |
| 企业认证“乘风计划” |      50,000 次 |           30 |  ¥30 / 10,000 次 |
| 企业技术服务许可   |     500,000 次 |          100 |  ¥30 / 10,000 次 |

超出月配额后，高德说明会依次消耗流量包和账户余额；基础搜索服务没有阶梯折扣。QPS 如需提升，公开价格为每增加 10 QPS、每月约 ¥400–¥1,500，最终以商务和控制台为准。[基础服务计费说明](https://lbs.amap.com/pages/base_service_price)、[服务升级页](https://lbs.amap.com/upgrade)

### 文档存在冲突，生产控制台才是最后答案

仍然在线的 JS API 流量页最后更新于 2023 年，列的是每个搜索子类每天个人 100、企业 1,000、商用 10,000 次；2025 年开始执行的新定价页则改为跨平台共享的月配额。Web 服务流量页也直接要求开发者到“控制台 → 流量分析 → 配额管理”查看 QPS。因此规划应采用更新的月配额模型，但上线前必须把当前账号控制台截图或导出值作为验收证据，不能只依赖公开文档。[旧 JS API 流量页](https://lbs.amap.com/api/javascript-api-v2/flowlevel)、[Web 服务流量说明](https://lbs.amap.com/api/webservice/guide/tools/flowlevel)、[2025 年后服务升级说明](https://lbs.amap.com/upgrade)

### 一个用户搜索会消耗几次

官方 JS API 2.0 把 `AMap.AutoComplete` 和 `AMap.PlaceSearch` 封装在 JS API 中：每次应用调用输入提示搜索或地点搜索，都可能产生对应的搜索服务调用。官方曾为 AutoComplete 增加防抖，但没有承诺一次用户搜索固定只计一次，也没有公布防抖时长。[输入提示与 POI 搜索](https://lbs.amap.com/api/javascript-api-v2/guide/services/autocomplete)、[JS API 更新日志](https://lbs.amap.com/api/javascript-api-v2/changelog)

所以成本模型应由真实网络请求数计算：

```text
月调用量 = 搜索会话数 × 每会话高德请求数
超额费用 = max(0, 月调用量 - 账号月配额) × ¥0.003
```

下面的“4 次/会话”只是用于预算的保守假设：3 次输入提示加 1 次最终地点搜索，不是高德承诺值。

| 月搜索会话 | 只在提交/回退时请求：1 次/会话 | 输入提示加最终搜索：4 次/会话 | 个人 5,000 配额后的费用 | 企业乘风 50,000 配额后的费用 |
| ---------: | -----------------------------: | ----------------------------: | ----------------------: | ---------------------------: |
|      5,000 |                       5,000 次 |                     20,000 次 |                ¥0 / ¥45 |                      ¥0 / ¥0 |
|     20,000 |                      20,000 次 |                     80,000 次 |              ¥45 / ¥225 |                     ¥0 / ¥90 |
|    100,000 |                     100,000 次 |                    400,000 次 |           ¥285 / ¥1,185 |                ¥150 / ¥1,050 |

如果 100,000 次 CUpedia 搜索中只有 10% 在无结果后点了高德回退，每次只发一个请求，高德调用量为 10,000 次，全部计费也只有 ¥30。由此可见，**避免全量 typeahead 请求比购买更多额度更重要；许可和合规成本又远高于调用费。**

## 二、JS API 与 Web 服务 API 的能力边界

### JS API 2.0

`AMap.AutoComplete` 提供输入提示，支持按城市和 POI 类型限制；`AMap.PlaceSearch` 支持关键字、周边、范围和 POI ID 搜索。`searchNearBy` 的半径范围为 0–50,000 米。它们使用 Web 端 JS API Key；2021-12-02 后申请的 Key 还必须配合安全密钥。高德强烈建议把安全密钥放在代理服务器，通过 `window._AMapSecurityConfig.serviceHost` 转发，而不是把安全密钥放进浏览器。[输入提示与 POI 搜索](https://lbs.amap.com/api/javascript-api-v2/guide/services/autocomplete)、[JS API 安全密钥使用](https://lbs.amap.com/api/javascript-api-v2/guide/abc/jscode)

### Web 服务 API

Web 服务地点搜索需要单独创建“Web 服务”类型 Key。官方建议生产环境为它设置服务器出口 IP 白名单；如果设置后请求来自其他 IP，会返回 `INVALID_USER_IP`。禁止用它做压力测试。[创建 Web 服务 Key](https://lbs.amap.com/api/webservice/create-project-and-key)、[IP 白名单说明](https://lbs.amap.com/faq/webservice/webservice-api/basic-configuration/43238)、[Web 服务申请注意事项](https://lbs.amap.com/faq/webservice/webservice-api/basic-configuration/43234)

地点搜索 2.0 的 `v5/place` 接口可以返回：

- 基础字段：POI ID、名称、父 POI、坐标、类型、地址和行政区；
- 可选 `business`：电话、别名和部分类型的营业时间等；
- 可选 `indoor`：室内地图标志、父建筑和楼层；
- 可选 `navi`：入口、出口和导航引导点；
- 可选 `children`、`photos`。

这些字段都是“可能返回”，不是校园数据完整性保证；搜索也不支持导出全量数据，同一组参数翻页最多取 200 条。[地点搜索 2.0](https://lbs.amap.com/api/webservice/guide/api-advanced/newpoisearch)

对 Campus Map 的推论是：高德可能补到公开建筑、商店、ATM、体育或医疗 POI，但没有证据表明它能覆盖 `LSK 301` 之类校内课室。即使返回 `opentime_week`，也不能替代 CUHK 官方网页的开放时间或临时关闭通知。

## 三、展示、缓存和存储限制

高德现行服务协议允许应用在向用户提供其他信息时展示服务结果，但原则上禁止直接存储、缓存、抓取或索引高德的地点、地址、POI 等内容，也禁止脱离高德服务单独使用或展示这些结果；如果需要超出范围使用，应通过工单申请书面许可。[高德地图开放平台服务协议第 2.2、3.5、4.12 和 7.3 条](https://lbs.amap.com/pages/terms/)

因此联合搜索必须满足以下边界：

- 高德结果只在正在显示的高德地图页面中瞬时展示，并清楚标记“高德地图地点”；
- 不把返回的名称、营业时间、电话、照片或搜索排名同步到 Supabase；
- 不用搜索结果批量生成 Building / Place；正式地点仍来自 CUHK 官方来源或社区审核；
- 不做服务端结果缓存。应用可以在发请求前防抖、取消过期请求和合并同一时刻的重复意图，但不要把 POI 响应作为可复用数据集；
- 现有或新增的 Provider Mapping 是否可持久保存 POI ID，应在扩容前向高德提交工单确认。协议把 POI ID 和地点数据也列为相关内容，不能自行假定它天然可永久保存；
- 不把高德数据用于模型训练、搜索索引或离线召回。

## 四、CUpedia 当前接入状态

仓库已经采用了正确的安全方向，但**当前没有高德地点搜索能力**：

- `/api/campus-map/config` 只对已登录用户返回 JS Key 和 `/_AMapService` 地址；安全码仍在服务端。见 `src/app/api/campus-map/config/route.ts:12-34`。
- `/_AMapService` 只允许 GET、要求登录、设置 `no-store`、限制请求和响应大小、使用 5 秒上游超时，并只放行坐标转换和逆地理编码两种路径。任何 PlaceSearch / AutoComplete 路径都会在访问高德前返回 404。见 `src/app/%5FAMapService/[...path]/route.ts:20-38,169-245`。
- 地图加载 JS API 2.0、MarkerCluster 和 Geocoder，处理底图热点与坐标转换；没有加载 `AMap.PlaceSearch` 或 `AMap.AutoComplete`。见 `src/components/campus-map/campus-map-runtime.tsx:1498-1528,1584-1624,1873-1898`。
- 当前搜索在浏览器内查询 CUpedia 的 `browseProjection`，并且每次键入都会更新搜索状态。见 `src/components/campus-map/campus-map-runtime.tsx:2070-2090,2328-2350`。若把这里直接换成高德调用，会把每次按键都变成外部计费请求。

如果以后试点，优先沿用现有 JS Key、`serviceHost` 和“精确路径＋精确参数”代理边界，在 staging 捕获 JS API 实际发出的搜索请求后再逐项加白名单。不要把代理改成通配 `restapi.amap.com/*`。若选择直接调用 v5 Web 服务，则要创建独立 Web 服务 Key、只放在服务端、绑定出口 IP，并新建收窄参数和响应的服务端路由；不能把 Web 服务 Key 下发到浏览器。

## 五、本次质量验证结果

**没有完成 live PlaceSearch / AutoComplete 质量测试。**

| 项目                         | 结果                                                                                       |
| ---------------------------- | ------------------------------------------------------------------------------------------ |
| 高德地点搜索实际请求数       | 0                                                                                          |
| 测试消耗额度                 | 0                                                                                          |
| 延迟、Top-1 / Top-5 召回     | 未验证                                                                                     |
| 中文、英文、缩写效果         | 未验证                                                                                     |
| CUHK 建筑/设施重复和错城结果 | 未验证                                                                                     |
| 原因                         | worktree 没有 Key；当前受认证保护的 CUpedia 代理不放行搜索路径；没有绕过生产边界或复制密钥 |

官方资料只能证明接口支持地理限制、POI 类型、周边搜索和排序，不能证明 CUHK 语料的效果。高德技术服务许可页给出的“99.5% 请求平均响应时间可控制在 300ms 内”是高德服务器侧的服务承诺，不是香港用户端到端延迟，也不代表搜索正确率。[技术服务许可服务指标](https://lbs.amap.com/upgrade)

### 建议的最小实测

确认许可和控制台后，在 staging 使用现有代理做一次不超过 30 调用的人工测试，不运行压力测试：

| 组       | 查询例子                                               | 要验证什么                                     |
| -------- | ------------------------------------------------------ | ---------------------------------------------- |
| 建筑中文 | 李兆基楼、康本国际学术园、大学图书馆                   | 已知校园建筑能否进入 Top 5                     |
| 建筑英文 | Lee Shau Kee Building、YIA、University Library CUHK    | 英文全名和缩写召回                             |
| 设施     | 香港中文大学游泳池、University Health Centre CUHK、ATM | 设施覆盖、是否返回校外同名地点                 |
| 课室     | LSK 301、YIA LT1                                       | 记录“不支持课室”的真实边界，不作为高德通过门槛 |
| 泛查询   | 游泳池、诊所、图书馆                                   | 2 km 周边约束后的相关性和重复                  |

每次调用记录：查询、接口类型、结果总数、Top 5 的 ID/名称/距离/类型、命中位置、重复 ID、错误码和端到端耗时。报告只保留聚合评估和必要的短样本，不保存整批高德响应。

建议的通过门槛属于产品验收规则，不是高德官方指标：

- 预先列出的公开建筑和设施，中英文合计 Top-5 命中率至少 80%；
- 不出现位于校园 2 km 范围外却排在精确 CUHK 结果之前的同名地点；
- 相同 POI ID 不重复，近似重复可解释；
- p95 端到端响应低于 800ms；
- 任一错误或超额时，CUpedia 自有搜索仍完整可用。

## 六、P0 决定和实施建议

### P0 必须做

1. 自有 Building / Place / 课室搜索和导航可以独立上线。
2. 在高德控制台确认账号主体、Key 类型、共享月配额、QPS、余额扣费、香港服务权限和技术服务许可；把结果留作运维证据。
3. CUpedia 搜索结果为第一层。高德结果永远是瞬时、带来源标签的第二层，不能覆盖 canonical Place。
4. 预留熔断：月调用预算、每用户速率限制、超时、错误回退和总开关。

### P0 不应做

- 不把 AutoComplete 挂到当前 `onChange`；
- 不依赖高德找课室、官方开放时间、预约方法或临时关闭；
- 不缓存或入库高德 POI；
- 不在未知许可状态下扩展生产调用；
- 不为搜索开放通配代理。

### 通过外部门槛后可以做

最省额度且最符合产品边界的首版是：用户输入时只查 CUpedia；当内部结果为空或用户明确点“搜索更多地点”时，发送 **1 次**高德周边搜索，在同一地图页展示少量 transient POI。第一版不接 AutoComplete。这个方案即使搜索质量一般，也不会影响课室、泳池和校医室 P0 的正确性。

## 仍需外部确认

- 高德账号是个人、企业乘风还是技术服务许可档位；免费额度是否仍在有效期内；
- CUpedia 的运营主体和用途是否被高德认定为个人研究、组织非商业或商业使用；
- 现有生产 Key 是否已获香港地点搜索权限；
- 控制台显示的真实共享月配额、QPS、当月余量和扣费保护；
- 高德是否书面允许保存现有 Provider Mapping 所需的 POI ID；
- 上述最小校园查询集的实际召回、重复、字段完整度和延迟。

## 官方来源

- [高德地图开放平台服务协议](https://lbs.amap.com/pages/terms/)
- [高德地图开放平台技术服务使用许可协议](https://lbs.amap.com/pages/authorization/)
- [服务升级、技术服务许可与共享配额](https://lbs.amap.com/upgrade)
- [开放平台基础服务计费说明](https://lbs.amap.com/pages/base_service_price)
- [JS API 2.0 流量限制说明（旧口径）](https://lbs.amap.com/api/javascript-api-v2/flowlevel)
- [Web 服务 API 流量限制说明](https://lbs.amap.com/api/webservice/guide/tools/flowlevel)
- [JS API 2.0 输入提示与 POI 搜索](https://lbs.amap.com/api/javascript-api-v2/guide/services/autocomplete)
- [JS API 2.0 安全密钥使用](https://lbs.amap.com/api/javascript-api-v2/guide/abc/jscode)
- [Web 服务 API 创建应用和 Key](https://lbs.amap.com/api/webservice/create-project-and-key)
- [地点搜索 2.0](https://lbs.amap.com/api/webservice/guide/api-advanced/newpoisearch)
- [Web 服务 IP 白名单说明](https://lbs.amap.com/faq/webservice/webservice-api/basic-configuration/43238)
