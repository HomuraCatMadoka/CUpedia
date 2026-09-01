# 高德 POI ID 能否直接作为 CUpedia Building 身份

> 调研日期：2026-09-01
>
> 对比方案：A = CUpedia `buildingId` + 显式高德映射；B = 高德 POI ID 直接作为 Building identity。
>
> 范围：产品与工程判断，不构成法律意见；账号已有的线下合同或许可书仍需单独核对。

## 结论

选择 **A**，但让用户看到接近 B 的体验：

```text
高德原生建筑标签 / hotspot
              ↓ 点击
(amap, poiId) ──显式映射──> CUpedia buildingId
                              ├─ 楼层
                              ├─ 课室
                              ├─ 设施
                              └─ 稳定搜索、URL 与历史
```

- 地图继续显示高德已有的建筑标签，不再画一个重叠的“第二栋建筑”。
- 点击已映射标签时，打开 CUpedia 增强建筑卡；未映射标签仍只打开“高德地图地点”临时卡。
- 搜索、楼层、课室、设施、评论、修订和 deep link 始终引用 CUpedia UUID。
- **在取得高德书面确认前，不应把 POI ID 持久写入生产数据库。** 无许可时保留 canonical Building，关闭“原生高德标签自动进入增强卡”这一项能力。

换句话说，是 **A internally、B visually**；视觉入口复用高德，不等于让高德拥有 CUpedia 的建筑身份。

## 五个直接答案

### 1. 持久保存高德 POI-ID 映射是否允许

**公开条款没有给 POI ID 类似 Google 的明确缓存豁免；对“只保存一个 POI ID → CUpedia UUID 的窄映射”是否构成被禁止的服务数据存储，存在解释空间。因此不能按“已允许”上线，必须取得工单或合同中的书面确认。**

公开条款整体明显偏向禁止：

- 2.2 把 POI 数据、地点数据、地址、坐标等都纳入“相关内容”。
- 3.5 只允许按官方文档展示服务结果，并明确禁止直接存储或缓存相关内容；如要脱离服务使用，应提交工单咨询。
- 4.12.3 禁止通过抓取、检索等工具访问后再存储、缓存或索引相关内容。通过正式 API 正常调用不等于爬虫，但这一款也没有给 POI ID 数据库映射开例外。
- 4.12.7 禁止在未获明确许可时复制或制作相关内容的衍生品，包括生成或用于数据库。
- 7.3 再次规定，超出授权范围的爬取、存储、缓存、下载和汇编需要高德事先书面同意。

以上均见当前[《高德地图开放平台服务协议》](https://lbs.amap.com/pages/terms/)。3.5 同时给出了正确出口：提交工单，让高德评估具体合作方式。

这里应区分两个问题：

1. **技术上可传 POI ID。** 高德官方 URI 与 ID 搜索文档要求调用者传入 POI ID。
2. **法律上可长期建映射表。** 公开文档没有说明 POI ID 是缓存禁令的例外。

因此结论不是“任何 POI ID 瞬时使用都禁止”，也不是“能传入 ID 就自然允许永久建库”，而是：**窄映射的公开许可不够清楚，生产持久化前需要书面确认。**

建议工单只问最小范围：

> CUpedia 是否可以仅保存 `(provider=amap, poiId, cupediaBuildingUuid)`，不缓存名称、地址、坐标、电话、营业时间、图片或搜索结果，并且只在高德地图内点击原生 POI 时解析到自有建筑详情？该映射是否受 3.5、4.12.7 与 7.3 限制？

### 2. 高德是否保证 POI ID 长期稳定

**没有找到跨数据更新、合并、删除或纠错仍永久不变的保证。**

[高德 POI 2.0 文档](https://lbs.amap.com/api/webservice/guide/api-advanced/newpoisearch)把 `id` 定义为“POI 唯一标识”，并提供 ID 搜索。这证明它适合标识当前高德数据中的一条 POI，但“唯一”只说明同一时点不会混淆记录，不等于“永久不变”。同一文档没有版本稳定期、重定向 SLA 或永久 tombstone 承诺。

高德自己的另一个数据产品更明确展示了真实生命周期：[铺货通“售点更新”接口](https://lbs.amap.com/api/rtm-api/guide/data-api/lasted-list)包含“下线 / 在线 / 变化”状态；当一个 POI 被合并时，会返回新的 `usingId`。这不是通用 POI 2.0 的兼容保证，但它足以说明高德的数据模型允许 POI 下线、变化与合并。

行业中的一手文档也明确区分“唯一”与“稳定”：

- [Google Place IDs](https://developers.google.com/maps/documentation/places/web-service/place-id)明确允许持久保存 ID，但仍说明同一地点可能有多个 ID、ID 会随数据更新改变，建议超过 12 个月就刷新；旧 ID 可能返回 `NOT_FOUND`。
- [Google Places 政策](https://developers.google.com/maps/documentation/places/web-service/policies#place-id-exemptions)专门写明 Place ID 不受一般缓存限制，可无限期保存。高德当前条款没有对应的明确豁免。
- [Nominatim 官方文档](https://nominatim.org/release-docs/latest/api/Output/#place_id-is-not-a-persistent-id)明确说内部 `place_id` 会因部署和重新导入变化，不能当永久 ID；即使使用 OSM 对象 ID，删除、拆分、重建或重新标注也会改变实体含义。

所以即使高德以后书面允许保存映射，映射也必须被设计为**可解绑、可重绑的外部引用**，而不是 Building 主键。

### 3. B 会制造哪些故障

| 故障                                    | B 的后果                                                 | A 的处理                                                |
| --------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------- |
| 高德合并、删除或替换 POI                | Building 主键失效；楼层、课室、设施和 deep link 都要迁移 | 只重绑 provider mapping，`buildingId` 不变              |
| 同一建筑存在多个 POI 或父子 POI         | 不知道哪一个才是 Building；可能重复建楼                  | 多个候选由管理员核对，一个映射指向明确 Building / Place |
| 高德把建筑 POI 改成机构、商铺或服务 POI | CUpedia 的实体含义被供应商分类变化带走                   | Building 与 Place 语义由 CUpedia/CUHK 来源决定          |
| 高德服务中断、Key 或区域许可变化        | 自有搜索、URL 和内部关系也失去身份基础                   | canonical 搜索与关系仍工作，只有底图入口降级            |
| 更换或增加地图供应商                    | 所有主外键都要迁移；最终仍要补映射表                     | 新增另一个 provider mapping 即可                        |
| 条款不允许长期保存                      | Building 数据模型本身无法合法运行                        | 映射表保持空，canonical Building 继续运行               |
| 历史与合并                              | 修改主键会破坏 revision、反馈和 tombstone 的连续性       | 外部 ID 生命周期单独留痕，事实历史不动                  |

B 的初始表面成本较低，但当前项目已经有 Floor、Place、Changeset、History 和 Provider Mapping；现在改为 B 不是“少一张表”，而是让供应商 ID 穿透所有关系，实际迁移成本更高。

### 4. “A internally、B visually” 是否合理

**合理，而且当前主线已经实现了核心路径。**

- 已接受的 [ADR 0034](../adr/0034-campus-map-provider-neutral-place-facts.md)规定 Building、Floor、Place 使用供应商无关稳定 ID；供应商 POI 只通过显式映射进入 canonical identity。
- [`campus_map_buildings`](../../src/db/schema.ts#L2240)使用 UUID；[`campus_map_provider_mappings`](../../src/db/schema.ts#L2719)把 `(provider, providerObjectId)` 单独映射到 Building 或 Place。
- [`loadCampusMapAmapPoiCard`](../../src/lib/campus-map/browse-actions.ts#L28)只按精确高德 ID 查映射；[`projectCampusMapAmapPoiCard`](../../src/lib/campus-map/amap-browse-projection.ts#L184)命中后投影 canonical 卡，未命中则返回临时高德卡。
- runtime 的 [`hotspotclick` 处理](../../src/components/campus-map/campus-map-runtime.tsx#L1626)已经把高德原生点击先交给映射解析，再决定进入 canonical selection 或 transient provider card。
- provider POI scene 在 [`scene-semantics.ts`](../../src/lib/campus-map/scene-semantics.ts#L352)中明确是 transient，不成为稳定产品场景。

这个结构也符合成熟地理系统的惯例。Who's On First 为自己的记录维护独立 [`wof:id`](https://github.com/whosonfirst/whosonfirst-properties/blob/b07030c5c88f07d41548218ab6f83ae3dd297796/properties/wof/id.json)，并把其他数据源的 ID 放在单独的 [`wof:concordances`](https://github.com/whosonfirst/whosonfirst-properties/blob/b07030c5c88f07d41548218ab6f83ae3dd297796/properties/wof/concordances.json) 字典中。相反，Pelias 的 `gid` 由来源、图层和来源 ID 组成；其[官方响应文档](https://github.com/pelias/documentation/blob/b720f5fca86b04b18af68903d1b95c2a9aad7e2f/response.md#gid)明确警告这类 ID 可能跨版本失效，不应保存作未来引用，只适合当前搜索结果。

#### 生产现状

2026-09-01 在登录后的 [CUpedia Campus Map](https://cupedia.org/campus-map)实测：

1. 高德底图已经显示“大学保健医疗中心”原生标签。
2. 点击标签会显示“大学保健医疗中心 · 高德地图地点”轻量卡。
3. 在 CUpedia 搜索框输入同名，返回“没有找到建筑或地点”。
4. 打开轻量卡不会得到 canonical Building / Place URL；当时地址仍是搜索 scene，没有稳定实体 ID。

这恰好说明视觉层与产品身份是两件事：**高德已经能画出建筑，不代表 CUpedia 已经能搜索、挂课室、保存历史或生成稳定链接。** A 的映射补的是这些产品能力，不是复制一个 marker。

### 5. 没有书面许可时的最小降级

不删除现有 Provider Mapping 架构，但生产中不写入高德 POI ID：

1. 用 CUHK 官方资料或原创核对建立 CUpedia Building UUID、名称、别名和获授权的 WGS84 anchor。
2. CUpedia 搜索结果选择 canonical Building，并用 anchor 聚焦地图、打开自己的建筑卡；楼层、课室和设施继续挂在该 UUID 下。
3. 用户直接点击高德原生标签时，只显示当前已有的 transient“高德地图地点”卡；不自动通过名称或距离升级成 CUpedia Building。
4. 可提供基于名称/坐标的实时高德搜索或导航跳转，但结果仅在本次交互中显示，不保存 POI ID；是否开放仍取决于现有账号许可。
5. 后台可生成“可能是同一建筑”的人工候选，但候选不包含持久化高德 ID；取得许可后再执行正式 bind。

代价是：同一建筑有两个入口——CUpedia 搜索入口和高德原生标签入口——暂时不能自动汇合。这个损失是可见但有限的，比让一个许可和稳定性都未确认的外部 ID 成为所有课室与设施的根身份更安全。

## 最终建议

1. **数据模型维持 A，不改 ADR，不把高德 POI ID 升格为 Building 主键。**
2. **取得书面许可后，启用最小映射：只存 provider、providerObjectId、canonical target、来源和人工决策历史。** 不缓存高德名称、地址、电话、营业时间、图片或完整搜索结果。
3. **映射必须支持 unlink / rebind。** 管理员按名称、坐标和 CUHK 证据确认；系统不得自动模糊绑定。
4. **UI 复用高德原生标签。** 已映射 POI 打开 canonical 增强卡，未映射 POI 保持 transient 卡；不要新增重叠建筑 marker。
5. **外部 ID 只负责“怎么从高德点击进来”，canonical ID 负责“这栋建筑在 CUpedia 是谁”。**

## 证据边界

- 未使用生产高德 Key 调用 PlaceSearch 或 ID Search，因此没有验证 CUHK POI 的实际 ID、ID 搜索返回或香港区账号权限。
- 没有查看 CUpedia 高德账号的许可书、线下合同或工单回复；它们可能扩大或收窄公开条款。
- 高德“售点更新”属于另一产品，只用于证明其数据体系存在下线、变化和 ID 合并，不应被理解为通用 POI 2.0 的重定向 SLA。
- 生产观察是 2026-09-01 的界面快照，后续部署可能改变搜索和卡片行为。
