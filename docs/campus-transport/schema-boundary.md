# 校园交通与 campus-map schema 边界

状态：issue 547 的实现前决策。本文根据 2026-08-08 的真实 CUHK 摄取结果确定 schema；它不是数据库迁移，也不表示 campus-map 已经集成。

## 结论

两个上下文只共享**稳定空间引用**，不共享运营实体：

- Campus map 拥有 `Place` 及其坐标、入口和物理连通事实；Transport 可以独立保存官方交通源明确提供的 Stop boarding-point 坐标。
- Campus transport 拥有 `Stop`、`Route`、`RoutePattern`、服务规则、`Trip`、`StopTime`、`ServiceAlert`、预测和车辆观测。
- Transport 通过自己的 `StopPlaceLink` 单向引用 `PlaceId`。关联可以不存在，也不能靠同名或最近距离自动发布。
- 今日产品读取一个编译后的 `TodayService`，不要求调用者理解校历、PDF、OCR、来源优先级或 GTFS 细节。

这使校园交通成为一个深模块：调用者只需给出香港服务日期并读取今日结果，复杂的来源、规则、例外、复核和降级全部留在模块内部。

## 来自真实数据的约束

[摄取 spike](https://github.com/HomuraCatMadoka/CUpedia/blob/codex/campus-transport-ingest-prototype/docs/campus-transport/prototypes/cuhk-bus-ingest-spike/output.prototype.json) 找到 14 个 route post、47 个 stop post 和 18 个服务时段，并为 2026-08-08 生成 267 个路线级发车候选。以下事实直接决定 schema：

1. 至少 20 个 Stop 名称含 Upward、Downward 或 PSLB 等运营语义。同一物理地点可以有多个 Stop，所以 `StopId` 不能复用 `PlaceId`。
2. Route 8 在非教学日替换 University Station 相关停站；H、N、2、Up、Down 又会按发车分钟、星期或假期增减停站。同一 Route 必须允许多个 `RoutePattern`，而 `DepartureRule` 必须选择 pattern。
3. 四条 Route 各有两个服务时段，其余十条各有一个。服务时间、服务日条件与 pattern 不是 Route 自身字段。
4. 官方 HTML 的多栏视觉 DOM 无法可靠表达站序。未核对的 stop list 只能留在 staging；没有 pattern 与起点就没有可发布 `Trip`。
5. 当前与 2024–25 PDF 的六个普通校巴服务窗口一致，但只有历史 PDF 明示 `2024-09-03` 生效。HTTP 修改时间和抓取时间不能替代业务有效期。
6. 公告 REST 正文为空，详情在图片中。最新迁站海报 OCR 平均词置信度为 69.7；OCR 只能形成草稿，不能直接成为生效 Alert。
7. CUHK 没有公开车辆位置、GTFS-Realtime 或官方逐站 ETA。`VehicleObservation` 与 `ArrivalProjection` 当前应为空，而不是填默认值。

## 所有权矩阵

| 概念                                  | Owner            | 另一个上下文能做什么                               | 禁止                                              |
| ------------------------------------- | ---------------- | -------------------------------------------------- | ------------------------------------------------- |
| `Place` / `PlaceId`                   | Campus map       | Transport 保存稳定引用并读取名称、坐标             | Transport 创建、复用或改写 Place                  |
| Place geo coordinate                  | Campus map       | 经 `StopPlaceLink` 展示已核对 Place 位置           | Transport 回写或以 Stop 坐标覆盖 Place 坐标       |
| Stop operational coordinate           | Campus transport | Map 可把有 transport provenance 的 Stop 画成图层   | 因坐标接近就合并 Stop 与 Place                    |
| Physical connection / entrance        | Campus map       | Transport 在 verified access link 存在时请求步行段 | 用直线距离、nearest-neighbour 或 draft graph 补路 |
| `Stop` / `StopId`                     | Campus transport | Map 可把已发布 Stop 作为交通图层内容               | Map 合并方向站、修改站序或运营状态                |
| `StopPlaceLink`                       | Campus transport | Map 提供目标 Place 与 redirect/tombstone           | 任一方按名称自动发布关联                          |
| `Route` / `RoutePattern`              | Campus transport | Map 只渲染已发布形状或停站 overlay                 | 把地图 Connection 当公交 pattern                  |
| Route shape / vehicle coordinate      | Campus transport | Map 只读渲染带来源与时效的交通几何                 | 反推 Place、入口、Connection 或步行路线           |
| Service rule / day / trip / stop time | Campus transport | Map 或 UI 读取今日结果                             | Map 推断班次、教学日或乘车资格                    |
| Alert / status / vehicle / prediction | Campus transport | Map 作为只读 overlay 显示                          | 把观测状态写成永久事实或把预测称为实时            |
| Source content / fetch / extraction   | 各上下文分别拥有 | 可以共享内容寻址与证据定位规则                     | 把内容版本、抓取事件和解析器运行混成一个身份      |

## Canonical schema

下面是领域级 schema。字段名用于固定语义；最终 Drizzle 表结构应在实现票据中根据查询与索引需要映射，不能删掉这些信息。

### 1. 来源与 staging

#### `SourceContent`

| 字段                                         | 约束                                                |
| -------------------------------------------- | --------------------------------------------------- |
| `contentId`                                  | 内容寻址身份，至少包含完整 SHA-256；相同 bytes 相同 |
| `kind`                                       | HTML、JSON、PDF、notice image、calendar 等          |
| `contentHash` / `byteLength` / `contentType` | 完整内容校验信息                                    |
| `retentionPolicy`                            | 原件是否保存、保存位置及许可状态                    |

#### `FetchObservation`

每次 HTTP 获取都是独立观测，即使内容 bytes 未改变也创建新的 `fetchId`。它保存 `sourceKey`、第一方 `url`、`fetchedAt`、HTTP 状态/headers、`httpLastModified` 和 `contentId`。`sourceKey`（例如 `cuhk-route-1a`）是逻辑来源，不是内容版本；HTTP 修改时间不得当作业务生效时间。

#### `ExtractionRun`

每次解析或重新解析都有独立 `extractionRunId`，保存 `contentId`、`parserVersion`、`ranAt`、结果 hash、状态与错误。同一内容用新版 parser 重跑不会伪造新的抓取或内容版本。`businessEffectiveFrom` / `businessEffectiveTo` 是抽取出的领域证据，只在来源明确声明时填写，不属于 HTTP 抓取元数据。

#### `EvidenceLocator`

| 字段                        | 约束                                                          |
| --------------------------- | ------------------------------------------------------------- |
| `contentId`                 | 指向唯一内容版本                                              |
| `fetchId`                   | 指向采用的第一方抓取观测，保留 sourceKey、URL 与取得时刻      |
| `extractionRunId`           | 指向产生该候选的解析运行；纯人工定位时可为空                  |
| `locator`                   | CSS selector + ordinal、PDF 页/表格位置、JSON path 或图片区域 |
| `extractionMethod`          | structured、PDF text、OCR、manual 等                          |
| `confidence`                | 机器抽取置信信息；结构化来源也不能暗示业务正确                |
| `reviewStatus`              | candidate、operator-reviewed、approved、rejected              |
| `reviewedBy` / `reviewedAt` | 只有人工状态才存在                                            |

#### `ExternalIdentity`

把 WordPress route/stop post ID、slug 和未来官方 ID 映射到内部稳定实体。外部 ID 变更只更新映射；名称和 slug 不成为主键。

### 2. 运营网络

#### `Stop` 与 `StopRevision`

- `stopId`: Transport 自有、永不复用的稳定身份。
- `stopRevisionId`、`stopId`、`validFrom` / `validTo`：某版已审核描述及其适用区间。
- `nameZh` / `nameEn`: 官方显示名；缺失语言可以为空并保留证据状态。
- `status`: candidate、active、retired。
- `eligibilityNote`: 只记录站点本身明确存在的限制，不继承用户身份。
- 可选 `operationalGeo`: 只接受官方交通源明确提供的 WGS84 boarding-point 坐标，并携带 Evidence locator；当前 WordPress stop 数据没有该字段。
- `evidence`: 该 revision 的 Evidence locator。

稳定 `Stop` 不复制 campus-map 的 Place 坐标，也不把 `PlaceId` 当主键。未来的 `operationalGeo` 是 Transport 自己的来源事实；它与 Place 坐标接近也不自动建立关联。改名、资格、状态或运营坐标变化产生新的 `StopRevision`，不会重写历史今日结果。

#### `StopPlaceLink`

- `stopId`、`placeId`。
- `relation`: `same-site`、`boarding-point` 或 `access-anchor`。
- `status`: candidate、verified、stale、retired；catalog redirect 或版本失配把 verified link 降为 stale。
- `evidence`、`verifiedAt`、`verifiedAgainstCatalogVersion`。

同一个 Place 可以关联多个方向 Stop；一个 Stop 也可以有多个 access anchor。步行路径及其 edge ID、距离和 graph revision 始终由 Campus map 拥有，不进入此关联。没有 verified link 时仍可做站到站服务，但不能给出地点步行段。

#### `Route` 与 `RouteRevision`

- `routeId`: 稳定内部身份。
- `routeRevisionId`、`routeId`、`validFrom` / `validTo`：某版已审核描述及其适用区间。
- `publicCode` / 双语名称。
- `riderEligibility`: `students-and-staff`、`staff-only` 或 `public-paid`。
- `status`: active、retired。

稳定 Route 不直接存站序、星期、首末班或“今天是否运行”。改名、资格或状态变化产生新的 `RouteRevision`；站序变化仍属于 Pattern revision。

#### `RoutePattern` 与 `PatternRevision`

- `patternId`: 某个乘客可区分的变体身份。
- `routeId`、方向/公开 alias。
- `patternRevisionId`: 一版已经审核的有序站序。
- `validFrom` / `validTo`: 有证据时填写；否则只允许当日 staging。
- `PatternStop`: `patternRevisionId`、`sequence`、`stopId`、可选 pickup/drop-off 规则。

站序改变产生新的 Pattern revision；如果变化形成长期可识别的新变体，再创建新的 `patternId`。网页 DOM ordinal 只属于 staging，不是 `sequence`。

### 3. 服务规则与今日编译

#### `ServiceRule`

- `serviceRuleId`。
- `weekdays`。
- `academicDay`: any、teaching、non-teaching。
- `readingWeek`: include、exclude、only。
- `universityHoliday`: include、exclude、only。
- `publicHoliday`: include、exclude、only。
- 可选来源明确的 `validFrom` / `validTo`。
- Evidence locator 与 review status。

公众假期、教学期、阅读周和大学假期保留各自证据；编译器可以把它们折叠为某天结果，但不能在 canonical schema 中压成一个永久 `isTeachingDay`。

#### `DepartureRule`

- `departureRuleId`、`routeId`、`patternRevisionId`、`serviceRuleId`。
- `windowStart` / `windowEnd`。
- `minuteSet` 或明确列举的起点发车时间。
- `riderEligibilityOverride`（仅官方资料明确时）。
- Evidence locator 与 review status。

H 的 00 分、N 的 00 分、Route 2 的 31–00 分条件以及 Route 8 的非教学日变化，应通过选择不同 pattern 的规则表达，而不是备注字符串。

#### `ServiceException`

运营变化的唯一结构化真值。它带 `effectiveFrom` / `effectiveTo` 与 typed effect：cancel service、add trip、replace pattern、skip stop、relocate stop 或 change status。开放式结束时间必须带 `reconfirmAfter`；过期或未复核的 exception 不进入发布结果。

#### `ServiceDayCompilation`

- `serviceDate`: `Asia/Hong_Kong` 的日期。
- `compiledAt` 与参与编译的 content、fetch、extraction 及 rule/pattern/route/stop revision IDs；其中包含本次编译使用的 `stopId -> stopRevisionId` 映射。
- `calendarFacts`: 公众假期、教学期、阅读周等独立结果。
- `status`: staged、reviewed、published、superseded。
- validation errors 与人工 review queue。

只允许当前来源编译其已知有效日。没有业务有效区间的当前 HTML 不得套用到历史或未来。优先级固定为：已审核且有效的 `ServiceException` 覆盖基础规则；基础规则产生计划；`ServiceAlert` 只负责向乘客解释结果；status observation、OCR draft 与未审核候选都不能修改计划。

#### `DepartureCandidate`、`Trip` 与 `StopTime`

`DepartureCandidate` 是 staging 结果；它可以只有 Route、日期与计划发车时间。当 pattern revision 和起点未通过审核时，它不能成为 Trip。

`Trip` 是发布实体，至少包含 `tripId`、`serviceDate`、`routeId`、`routeRevisionId`、`patternRevisionId`、起点计划时间、资格与 compilation ID。编译结果固定引用当时的 Route、Pattern 与 Stop revisions，使历史名称、资格和站点描述可重放。`StopTime` 只保存官方明确的计划时刻；当前来源没有中途时刻，因此不得生成中途 StopTime。

### 4. 运行变化、预测与实时

#### `ServiceAlert`

由已审核通告生成的乘客信息投影，包含双语内容、受影响 Route / Pattern / Stop / Trip、来源、最后确认时间，以及可选 `serviceExceptionId`。若通告改变运营结果，它必须引用对应 `ServiceException` 并沿用其有效期；纯信息提示可以没有 exception。Alert 本身不持有第二份 effect，也不能独立修改服务。OCR draft 与新闻 post 不是 Alert。

#### `ServiceStatusObservation`

保存 route status、`observedAt`、`fetchId` / `contentId` 和 freshness。没有来源有效期时，观察结果过期后降级为 unknown，不能重放为 Alert。

#### `ArrivalProjection`

保存 `tripId`、`stopId`、预计时间、`calculatedAt`、方法、样本量/误差说明和输入版本。产品必须显示“预计”；删除该表不应损伤官方计划时刻。

#### `VehicleObservation`

保存外部 provider、vehicle reference、观测位置/状态、`observedAt`、`expiresAt` 和证据。当前没有授权 provider，因此不创建假数据，也不以路线状态代替车辆观测。

#### `RouteShape`

若未来官方交通来源发布线路几何，Transport 可按 `patternRevisionId` 保存带 evidence 的可选 `RouteShape`；车辆坐标也是有时效的交通观测。这两者都不是 Campus map 的 Place 坐标或物理步行 graph，不能用来推导 Connection、入口或步行路径。

## 模块接口与接缝

### Campus transport

对产品调用者只暴露一个高杠杆接口：

```ts
getTodayService({ serviceDate, asOf }): TodayService
```

`TodayService` 返回已发布 routes/trips/alerts、来源更新时间、资格标签和明确 limitations。来源抓取、PDF/OCR、日历求值、pattern 选择、exception precedence、freshness 与 review gate 都是模块实现，不扩散到页面或 campus-map。

测试也只穿过这个接口验证：普通日、教学日周六、公众假期、阅读周、临时迁站、末班后、过期状态和无 ETA 降级。

### Campus map

地图尚未集成时，不提前创造一个只有单一实现的运行时 port。第一份共享物是小型只读值契约：

```ts
type PlaceId = string;

type CampusPlaceRef = {
  placeId: PlaceId;
  catalogVersion: string;
  nameZh: string;
  nameEn: string;
  geo?: {
    lat: number;
    lng: number;
    crs: "WGS84";
    provenanceRef: string;
  };
};

type PlaceResolution =
  | {
      requestedPlaceId: PlaceId;
      status: "active";
      canonicalPlaceId: PlaceId;
      redirectChain: readonly PlaceId[];
      place: CampusPlaceRef;
    }
  | {
      requestedPlaceId: PlaceId;
      status: "retired" | "missing";
      redirectChain: readonly PlaceId[];
    };
```

Transport 只存请求时的 `PlaceId` 和核对时 catalog version；读取不到 Place 时保留 Stop 名称并标示地图资料不可用。Campus map 合入并出现静态 catalog adapter 与测试 fake 后，再把真实接缝固定为一次批量解析：

```ts
resolvePlaces(
  placeIds: readonly PlaceId[],
): ReadonlyMap<PlaceId, PlaceResolution>;
```

返回 Map 必须以**请求的 ID** 为 key，每个请求都有 active、retired 或 missing 结果，不能静默省略。Redirect 必须由 Campus map 扁平解析为 canonical ID 并返回完整 chain；redirect target 必填，chain 不得循环。Transport 可以跟随 redirect 展示 Place，但 `StopPlaceLink` 会标为 stale，重新核对 catalog version 前不得用于步行路由。

Transport 不 import `CampusMapView`、插画数据、Region、Connection 或 draft graph。页面组合 `TodayService` 与可选 Place refs；两个领域模块不互相调用写接口。

## ID 与演进规则

1. 内部 ID 不由名称、slug、数组序号或页面 URL 生成，也永不复用。
2. WordPress post ID / slug 进入 `ExternalIdentity`；来源修订不更换 canonical ID。
3. Stop / Route 改名或其他已发布描述变化产生新 revision。语义相同的实体合并可留下 redirect/tombstone；一对多拆分必须人工迁移，不能静默 redirect。
4. Place 退役不级联删除 Stop、Trip 或历史 compilation；`StopPlaceLink` 进入 retired 并等待新关联。Place redirect 可用于显示，但会令 verified link 进入 stale，必须针对新 catalog version 复核后才能恢复路由资格。
5. Pattern 的站序变化产生 revision；历史 Trip 固定引用原 revision，不能随当前线路被重写。
6. Source content、Fetch observation、Extraction run、Evidence locator、reviewer 和 canonical revision 共同构成可重放证据；只有逻辑 source key 不足以审计。
7. 跨上下文不做 cascade delete。即使未来共用 Postgres，物理外键也不能赋予 Transport 修改 Place 的权力。

## 典型边界场景

- **University Health Centre Upward / Downward**：两个 Stop，可以关联同一 Place；线路 pattern 保持方向差异。
- **Route 8 非教学日**：同一 Route 下有两个 `RoutePattern`（教学日与非教学日变体），各自引用当前的 `PatternRevision`；Service rule 决定当天使用哪一个。
- **H 线 00 分班次**：00 分 Departure rule 选择含 PGH1 / Area 39 的 pattern，20/40 分选择基础 pattern。
- **University Station 临时迁站**：OCR 生成 candidate exception；operator 核对图片 hash 与有效时间后，发布一个 dated stop relocation / pattern override。开放式结束时间次日必须重新确认。
- **Campus map 尚未合入**：`StopPlaceLink` 为空，TodayService 仍返回站到站计划；地点搜索、步行时间和完整 Journey 明确不可用。
- **未来获得车辆 feed**：新增 Vehicle provider adapter 与 observation，不修改 StopTime；预测/实时过期后回退到官方计划。

## 当前发布边界

| 能力                                     | 当前结论                                             |
| ---------------------------------------- | ---------------------------------------------------- |
| Route / Stop 外部对象发现                | 可自动进入 staging                                   |
| Route-level 服务窗口与发车分钟           | 可自动抽取并由 PDF 交叉核对，仍需 source diff review |
| Ordered Route pattern                    | 阻塞；官方视觉 DOM 不能安全恢复站序                  |
| 今日 Route-level departure candidates    | 可生成 staging 候选                                  |
| Published Trip / StopTime                | 阻塞，直到 pattern 与起点审核完成                    |
| Image notice                             | OCR draft + operator review                          |
| Stop–Place link / 步行段                 | 阻塞，直到 campus-map Place 与物理入口通过核对       |
| Arrival prediction / Vehicle observation | 无数据；不得生成                                     |

因此第一阶段实现顺序应是：先审核 Stop inventory 与 Route patterns，再把今天的 departure candidates 升级为 Trip；campus-map 只在 verified Stop–Place link 出现后逐站接入。

## GTFS 边界

GTFS 是发布 adapter，不是 canonical schema。只有 Stop、按 `stop_sequence` 排序的 pattern、Trip，以及规范要求的首末站 arrival/departure 等必填事实都已审核时，才可从发布模型导出 GTFS 并运行 feed validator。当前路线级 `DepartureCandidate` 缺少有序站序、起点与逐站时刻，不能伪装成完整 GTFS feed。
