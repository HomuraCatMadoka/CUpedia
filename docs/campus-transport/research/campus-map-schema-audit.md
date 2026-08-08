# campus-map 可共享交通 schema 与接入缝隙审计

> 审计日期：2026-08-08（香港时间）
>
> 审计对象：`/Users/wangkunyu/CU-Claw` 当时的现场工作树；campus-map 相关目录均未被 Git 跟踪，首页入口也只是现场修改，因此本文描述的是**尚未提交、尚未集成的候选实现**，不是 `main` 已有的产品契约。

## 结论

校园交通可以复用 campus-map 的**空间身份契约**，但不能直接把现有 campus-map 数据当成可发布的地点到站步行路由器。

- 最值得共享的是 `PlaceId`、双语名称、WGS84 坐标、来源 ID / 核对日期，以及“事实坐标与插画坐标分离”的约束。地图上下文已经明确拥有空间身份，其他上下文只能引用稳定 Place ID，不能反向改写地图事实（[`docs/campus-map/CONTEXT.md`](../../campus-map/CONTEXT.md)）。
- 校巴站、站台方向、线路停靠顺序、班次、服务日、职员专车和当天通告仍应由校园交通拥有。它们是运营实体或易变事实，不应塞入地图的 `PlaceNode` / `ConnectionEdge`。
- 当前基础图只有一个 `kind: "transport"` 地点：`station-exit-a`（大学站 A 出口），没有 CUHK 校巴站清单、官方站点代码、站台/方向或站—地点映射（[`src/lib/campus-map/data.ts`](../../../src/lib/campus-map/data.ts)）。
- 当前最完整的政府路网试点仍有 16 个物理分量、86 栋建筑全部没有人工批准入口，release 明确为 `blocked`；它生成的单一连通地点图依赖候选吸附、两个回退吸附和 MST + 2-nearest-neighbour，只适合评审，不可用于实际寻路（[`src/lib/campus-map/pilot-types.ts`](../../../src/lib/campus-map/pilot-types.ts)、[`tests/lib/campus-map/pilot.test.ts`](../../../tests/lib/campus-map/pilot.test.ts)）。
- 因此 CU Bus 的第一版可以先做“站到站”与当天班次；地点选择可提前共享 Place ID。步行段只能在每个站点拥有经核对的 map anchor / entrance link 后逐站开放，不能以附近直线、插画位置或当前 draft place graph 自动补齐。

## 现场集成状态

审计时，以下实现全部只存在于未跟踪文件：`docs/campus-map/`、`assets/campus-map/`、`scripts/campus-map/`、`src/app/(main)/campus-map/`、`src/components/campus-map/`、`src/lib/campus-map/` 和 `tests/lib/campus-map/`。`git ls-files` 对这些路径没有输出。首页现场修改已经加入 `/campus-map` 卡片，而路由页只是把 `CampusMapView` 挂到 App Router（[`src/app/(main)/page.tsx`](<../../../src/app/(main)/page.tsx>)、[`src/app/(main)/campus-map/page.tsx`](<../../../src/app/(main)/campus-map/page.tsx>)）。

视图是纯客户端静态消费：组件直接 import `CAMPUS_*` 常量、固定审计路线和生成 JSON；没有数据库表、server action、API route 或运行时外部地图请求（[`src/components/campus-map/campus-map-view.tsx`](../../../src/components/campus-map/campus-map-view.tsx)）。这符合 Phase 1“静态连通图 + 自有 SVG、不建数据库”的边界，却意味着校园交通不能假定已经有可查询的空间服务。

接入前还应先把地图候选实现提交并明确 owner；否则交通代码若直接 import 这些未提交模块，会把尚未通过产品集成的试验接口固化成跨上下文依赖。

## 当前真实存在的三套数据

### 1. 手工审核的基础事实图

核心契约是 [`src/lib/campus-map/types.ts`](../../../src/lib/campus-map/types.ts) 的 `CampusMapDataset`：

| 实体             | 已有字段                                                                | 对交通的价值               | 边界                                                                 |
| ---------------- | ----------------------------------------------------------------------- | -------------------------- | -------------------------------------------------------------------- |
| `SourceRef`      | 稳定 source ID、`kind`、publisher、URL、`accessedOn`、双语说明          | 可统一 provenance 形状     | 当前 `accessedOn` 只精确到日，没有有效期、抓取哈希或 supersession    |
| `Region`         | 稳定 `RegionId`、双语名、hub、`portalPlaceIds`、art、source IDs         | 可分组地点、显示区域       | Region hub 不是现实入口，绝不能参与换乘或步行                        |
| `PlaceNode`      | 稳定 `PlaceId`、kind、双语名、`regionId`、可选 `geo`、`art`、source IDs | 是最安全的共享空间锚点     | 没有官方 building/facility ID；`regionId` 必填，不适合未经归区的站点 |
| `ConnectionEdge` | `from`/`to`、方向、真实/插画几何、楼层、设施、长度/时间/成本、evidence  | 将来可承载经核对的步行段   | `mode` 目前固定为 `walk`；不是公交路段模型，很多权重仍为空           |
| `OfficialRoute`  | A–E 有序节点/边、整条路线分钟数、来源                                   | 可作为少量官方步行 overlay | 总时间不可拆成边权重，不能作为任意 OD 路由快捷边                     |

现场数据有 12 个 Region（九所书院 + Central Campus、Area 39、Eastern Campus）以及 47 个 Place：12 个 display-only region hub 和 35 个 routing place。每个 Region 已有至少一个 Portal；Region hub 不作为边端点（[`tests/lib/campus-map/graph.test.ts`](../../../tests/lib/campus-map/graph.test.ts)）。

稳定 ID 的约束已经写明：地点/连接改名或移动插画位置不换 ID；每个事实至少有来源 URL 与 `accessedOn`；真实 `geo` / `geoGeometry` 与编辑性 `art` / `artGeometry` 分字段保存（[`docs/campus-map/CONTEXT.md`](../../campus-map/CONTEXT.md)、[`docs/adr/0015-campus-map-three-graph-layers.md`](../../adr/0015-campus-map-three-graph-layers.md)）。这些都适合上提为跨功能的空间契约。

不过，“稳定”目前只是代码约定，不是数据库约束，也没有 alias、deprecated ID、merge/split 或迁移表。一旦交通保存 `mapPlaceId`，地图侧必须保证 ID 退役有显式 redirect/tombstone，而不是删除或复用字符串。

### 2. LandsD 3D Pedestrian Network 试点

`pilot-gold-set.json` 使用 schema `1.2`，范围仅是“大学站—崇基—中央校园”。它对账 86 个 CUHK 官方建筑记录，摄取 2,009 段、1,827 个网络节点，保留三维 WGS84/HKPD 几何、方向、设施类型、楼层、轮椅字段、原 feature ID、快照哈希与证据 locator（[`src/lib/campus-map/pilot-types.ts`](../../../src/lib/campus-map/pilot-types.ts)、[`scripts/campus-map/build-pilot.ts`](../../../scripts/campus-map/build-pilot.ts)）。

这里存在另一套身份：建筑 ID 为 `cuhk-building-<officialBuildingId>`，另保留 `officialBuildingId` 和 `sourceRecordId`；唯一 transport node 是 `topology-university-mtr-northern-exit`，来源为官方 location database 的 `facilities_id=247`。它与基础事实图的 `station-exit-a` 并不是同一个 ID，也没有显式 alias。交通不能任选其中一个字符串当 canonical identity。

更重要的是，这套数据主动阻止错误发布：

- 物理网络仍有 16 个分量，15 个 raw component 被 draft topology graph 排除；
- 每栋建筑有 3 个最近网络候选，共 258 个，但人工批准数为 0；
- 87-node / 124-edge 的“连通”地点图只在 `component-01` 上派生，两个建筑使用非首选回退候选；
- release blockers 包含无人工批准入口、fallback attachment、多分量和范围/室内 seam。

这些断言有测试固定（[`tests/lib/campus-map/pilot.test.ts`](../../../tests/lib/campus-map/pilot.test.ts)）。所以这套 schema 很适合成为**将来**步行路由摄取层，但当前不能向 CU Bus 提供“任意建筑到最近站”的发布级结果。

### 3. 全校园 Reading zones / 道路走廊草案

`reading-zones.json` 使用 schema `0.6`，拥有 6 个互斥 reading zone、159 个官方建筑、主校园 mask、地形统计、道路/铁路/等高线上下文及 13 条 source-backed named corridor。建筑同样使用 `cuhk-building-<officialBuildingId>`，因此它与 pilot 具备可对账的官方建筑 seam（[`src/lib/campus-map/reading-zones.ts`](../../../src/lib/campus-map/reading-zones.ts)）。

但 Reading zone 是阅读/制图分区，不是官方校园归属；`officialCampusId` 与 `readingZoneId` 被刻意分开。13 条 Corridor 保存名称、OSM way IDs 和真实几何，却还没有切分路口和吸附端点，严格线形检查仍是两个分量。文档明确禁止因视觉交叉或近接生成 graph edge（[`docs/campus-map/CONTEXT.md`](../../campus-map/CONTEXT.md)）。它可帮助站点落在哪个阅读区域、显示道路背景，不能承担步行 routing。

## 来源与资产边界

来源登记把事实、资产版权和使用状态分开（[`assets/campus-map/SOURCES.md`](../../../assets/campus-map/SOURCES.md)）：

- CUHK Online Map / PDF 可人工核对地点、穿梭巴士站和名称，但不是稳定下载 API，也没有允许复制地图作品的开放许可；不能把截图、图标或描摹几何带进产品。
- 2026-07-16 OSM snapshot 有固定 bbox、SHA-256 与 source ID；派生数据库/成图必须保留 `© OpenStreetMap contributors` 和 ODbL 义务。OSM 道路存在不证明人行权、开放时间或无障碍。
- LandsD 数据需要保留当前数据入口、版本/哈希和相应署名；固定点到点路线只是查询快照，不是全校园网络。
- 现有 ArtPoint、SVG 线条和 reading-zone 色块都是表现层，不能用于算最近站、距离、ETA 或路线。

交通数据因此应延续 source snapshot + per-assertion provenance，而不是只保存一个网页 URL。特别是站点位置和名称也可能随校方时刻表版本变化，不能因它看似“空间事实”就省略有效期与原始定位信息。

## 建议的共享身份缝隙

### 所有权

建议把稳定空间身份抽成一个不依赖 UI 的小模块（例如 `src/lib/campus-spatial/`），由 campus-map 拥有：

```ts
type PlaceId = string;

interface SpatialPlaceRef {
  id: PlaceId;
  nameZh: string;
  nameEn: string;
  geo?: { lat: number; lng: number; sourceId: string };
  sourceIds: readonly string[];
}
```

这里共享的只是 identity/reference contract；`ArtPoint`、reading zone、多边形、地图图层状态和 SVG 均不进入交通核心。`PlaceKind` 也不宜成为交通枚举，因为当前宽泛的 `transport` 无法表达 stop、platform、站点组或方向。

校园交通自己拥有类似以下关系：

```ts
interface TransitStop {
  id: string; // 交通稳定 ID；不复用线路名或显示名
  nameZh: string;
  nameEn: string;
  mapPlaceId?: PlaceId; // 已核对的同一物理地点；可为空
  geo?: { lat: number; lng: number; sourceId: string };
  sourceIds: readonly string[];
}

interface StopAccessLink {
  stopId: string;
  placeId: PlaceId; // 建筑/入口/Portal，而不是 Region hub
  status: "candidate" | "verified";
  distanceM?: number;
  travelTimeS?: number;
  physicalEdgeIds?: readonly string[];
  sourceIds: readonly string[];
}
```

`TransitStop.id` 与 `mapPlaceId` 分开很重要：一个物理巴士站 Place 可能服务多个运营 stop/platform；反之，同名停靠点在不同方向或不同线路资料里可能要先保持多个候选记录，直到完成实体解析。线路、trip、stop sequence、班次、服务日、当天 override、职员标记属于交通上下文，只引用 `stopId`，不引用地图 Connection。

### 现有 ID 的合并规则

1. 基础图的语义 slug `PlaceId` 暂作唯一对外地图 ID。
2. `officialBuildingId`、`sourceRecordId`、OSM way ID、LandsD object/route ID 都是 source identifiers，不直接暴露成跨上下文主键。
3. 在 pilot / reading-zone 的 `cuhk-building-*` 与基础 Place 建立显式 alias 前，不宣称它们相同。基础 `PlaceNode` 目前甚至没有 `officialBuildingId` 字段。
4. `station-exit-a` 与 `topology-university-mtr-northern-exit` 需要人工判定是同一出口、站点组还是不同设施后再建 alias；仅凭英文近似不能合并。
5. Region hub 永远不能作为站点或接驳端点；至少引用 Portal、建筑入口或独立 transport Place。

## 当前能否支持地点到站步行段

答案是：**不能支持任意地点到任意 CUHK bus stop；只能逐个开放有证据的限定连接。**

| 能力                     | 当前状态                                                                    | 判定                                            |
| ------------------------ | --------------------------------------------------------------------------- | ----------------------------------------------- |
| 基础 Place/Portal 选择   | 47 个静态 Place，稳定 ID 契约                                               | 可作为早期目的地列表，但覆盖远非 159 栋官方建筑 |
| 基础 segment graph       | 35 个 routing place 中 30 个有 segment edge；另 5 个孤立，验证报告 6 个分量 | 不可宣称完整                                    |
| 十个代表 portal journeys | 测试能在 30-node segment subset 内连通                                      | 只能证明这些受控 pair，不推广到新 stop          |
| 固定 LandsD audit routes | 少量指定 OD 的三维响应快照                                                  | 可显示“该查询在该日返回什么”，不是路网          |
| pilot physical network   | 2,009 段但 16 分量、入口全未批准、范围有限                                  | release blocked                                 |
| draft place graph        | 87 node / 124 edge，数学连通                                                | 不能用于实际寻路或 ETA                          |
| 13 条 named corridor     | 真实线形与 provenance 完整，但未切路口且有 2 分量                           | 只作背景/候选主干                               |
| CUHK bus stop inventory  | 不存在                                                                      | 必须由交通研究建立                              |

安全的增量路径是：

1. 先让 CU Bus 做站到站和当天班次，不显示步行时间。
2. 每个 stop 单独完成官方名称/位置解析，并建立 `mapPlaceId` 或 candidate anchor；未核对时显示站名与来源，不假装落在地图节点上。
3. 只有当 stop endpoint、Place/入口 endpoint、连续 physical segments、方向/开放限制及权重都通过核对后，才发布 `StopAccessLink(status="verified")`。
4. 路由时只使用 segment-level `open-data` / `official-network` edge；A–E official route 继续是 overlay，MST/nearest-neighbour edge 和 art geometry 永不进入实际计算。现有 `weightedShortestPath` 已选择安全默认：缺少所选 metric 的边会被排除，除非调用者显式提供 fallback（[`src/lib/campus-map/graph.ts`](../../../src/lib/campus-map/graph.ts)）。
5. 没有可靠时间时，可以展示经核对的距离或“步行连接资料不足”；不要用直线距离或全局步速制造确定分钟数。

## 给后续 Wayfinder 决策的约束

- **可立即锁定：** campus-map 拥有 Place/空间事实；CU Bus 拥有运营 stop、route、trip、service day、当日 override 和 staff-only 标签；二者通过 optional `mapPlaceId` 与有 provenance 的 `StopAccessLink` 协作。
- **需要下一张 decision ticket：** 选择真正 canonical 的校园地点目录——基础 47 Place 的人工 slug 与 CUHK official location database 的 159 building/facility identity 如何合并、退役和迁移。
- **需要跟数据研究一起决定：** CUHK 近两年时刻表是否提供稳定站点代码/站点顺序；若没有，交通必须自建稳定 `stopId`，并保留每版原始站名 alias。
- **不可提前承诺：** 任意建筑到站路线、准确步行分钟数、无障碍路线、实时开放状态，以及用 reading-zone corridor 或 draft topology graph 推算路径。
- **安全接入面：** 先共享纯类型/只读 catalog，而不是让交通 import `CampusMapView`、生成 JSON 全包或 UI 状态；待 map 数据提交后再加由测试固定的 resolver（`PlaceId → SpatialPlaceRef`）和 alias registry。

## 审计证据索引

- 领域与生命周期：[`docs/campus-map/CONTEXT.md`](../../campus-map/CONTEXT.md)
- facts-before-art：[`docs/adr/0013-campus-map-facts-before-art.md`](../../adr/0013-campus-map-facts-before-art.md)
- Portal / physical network：[`docs/adr/0014-campus-map-portals-and-physical-network.md`](../../adr/0014-campus-map-portals-and-physical-network.md)
- 三层图模型：[`docs/adr/0015-campus-map-three-graph-layers.md`](../../adr/0015-campus-map-three-graph-layers.md)
- 来源与许可：[`assets/campus-map/SOURCES.md`](../../../assets/campus-map/SOURCES.md)
- 基础 schema / facts：[`src/lib/campus-map/types.ts`](../../../src/lib/campus-map/types.ts)、[`src/lib/campus-map/data.ts`](../../../src/lib/campus-map/data.ts)
- graph 行为与验证：[`src/lib/campus-map/graph.ts`](../../../src/lib/campus-map/graph.ts)、[`tests/lib/campus-map/graph.test.ts`](../../../tests/lib/campus-map/graph.test.ts)
- government pilot：[`src/lib/campus-map/pilot-types.ts`](../../../src/lib/campus-map/pilot-types.ts)、[`scripts/campus-map/build-pilot.ts`](../../../scripts/campus-map/build-pilot.ts)、[`tests/lib/campus-map/pilot.test.ts`](../../../tests/lib/campus-map/pilot.test.ts)
- reading zones / corridors：[`src/lib/campus-map/reading-zones.ts`](../../../src/lib/campus-map/reading-zones.ts)、[`scripts/campus-map/build-reading-zones.py`](../../../scripts/campus-map/build-reading-zones.py)、[`tests/lib/campus-map/reading-zones.test.ts`](../../../tests/lib/campus-map/reading-zones.test.ts)
