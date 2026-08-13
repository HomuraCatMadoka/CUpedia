# CUHK 校巴实时车辆位置推算（地图车辆 UI）Implementation Plan

**Status: 2026-08-13 已实现并验收** — 分支 `feat/campus-bus-vehicle-positions`（PR 关联 issue #601）

> **For Hermes:** 本计划用于按任务顺序实现。所有纯函数走 TDD。

**Goal:** 在校巴路线详情页的 MapLibre 地图上，沿现有紫色线路几何放置多辆"车"图标，位置由"发车时刻 + 逐站到站时间（p50Seconds）+ 梯形速度剖面"实时推算，车站停留约 30 秒，启动加速→匀速→进站减速→停止。

## 决策（已与用户确认）

1. **沿紫线走**：使用 `route.map.geometry`（OSM MultiLineString），**但不能直接 flatten**——见下方"验收发现的问题"
2. **梯形速度剖面**：固定加速度 A=0.8 m/s²，站间按 `T² ≥ 4L/A` 判断梯形/三角退化；不可行时退化为三角剖面
3. **多辆在途班次**：每条线显示所有"已发车未收班"的班次，每班一辆车

## 验收发现的问题（均已修复）

### 问题 1：OSM 几何无方向/顺序（用户验收时指出）

原始 MultiLineString 含**重复段**（OSM relation 把同一条路引用两次）且不保证方向与站序一致：

- 1A 的 23 段里 3 对完全重复（seg 8==16、5==20、4==21），flatten 后总长 4981m（真实环线仅 2994m）
- 站点投影错位：首站（大学站）命中折线**终点** 4981m 而非起点 → 车发车后不动；善衡(741m) 排在邵逸夫堂(1403m) 前面
- 全路线诊断：12 条里 11 条有重复段（h:37/97、n:35/93、8:24/69 最严重）

**修复**：`buildStopAnchoredPath`（route-geometry.ts）——把几何当无向图（顶点去重 + 线段去重），用 Dijkstra 按**站序**找相邻站间最短路径，方向由站序锚定，彻底摆脱原始段序。全 12 路线验证连通（无 NO PATH），1A 总环线 2994m（±3% 断言）。

### 问题 2：进站减速段倒着走（用户验收时发现）

`positionAlongSegment` 减速段公式错误：起点应为 `加速距离 + 巡航距离`（357.69m），旧公式给出 `2·加速距离 + 巡航距离`（365m，多了一个加速距离），然后随时间**递减**——减速段前半段车倒退，末尾才跳到终点。单元测试采样步长 5s 太粗未抓到，UI 1s 刷新肉眼可见。

**修复**：减速段改为从 `accelerateDistance + cruiseDistance` 出发、速度由 v 匀减到 0。新增 1s 细采样单调性回归测试（严格无倒退）。

### 问题 3：部分停靠班次停靠站错位（用户验收时发现）

route 2 的邵逸夫堂（seq=3）只有部分班次停靠（`partialService: true`）：`2:default`（:15/:30 发车）跳过它，`2:via-shaw-hall`（:00/:45 发车）停靠。旧实现用 `route.stops` 全站序列做几何锚定和停靠判断，而时间轴来自 pattern 投影（实际停靠序列）——两序列索引错位，default 班次实际停冯景禧楼（4 号）却被标记为邵逸夫堂（3 号），后续全错位。

**修复**：`bus-positions.ts` 几何缓存与停靠判断全部改为按 **pattern 实际停靠序列**（projections 的 stopOccurrenceId），不再用 `route.stops` 全站序列。新增回归测试：`tests/lib/bus-positions-partial.test.ts`（default 班停冯景禧楼、via-shaw-hall 班停邵逸夫堂）。

## 数据流

```
匿名反馈观测 ──> p50Seconds(累计到站秒数) + departureAt(发车epoch) ──> 时间轴
                                                                        │
route.map.geometry ──> 无向图去重 ──> Dijkstra 按站序 ──> 分段路径(s)
                                                                        │
              梯形剖面(加速/匀速/减速) 在 [leave_k, arrival_{k+1}] 上插值 ──> 经纬度
```

## 任务（已完成 ✓）

### 阶段 1：几何模块 `src/lib/campus-transport/route-geometry.ts` ✓
- [x] T1 `flattenRouteGeometry`：MultiLineString/LineString → 点列，去相邻重复点（保留，用于简单场景）
- [x] T2 `computeCumulativeArcLength`：haversine 逐顶点累计弧长（米）
- [x] T3 `interpolateAlongPolyline` + `nearestPointOnPolyline`：沿线插值 + 站点投影
- [x] T3b `buildStopAnchoredPath` + `interpolateAlongSegmentPath`：**无向图 + Dijkstra 站序锚定重建**（修复问题 1 的核心）
- 测试：`tests/lib/route-geometry.test.ts`（13 tests）+ `tests/lib/route-geometry-path.test.ts`（5 tests，含 1A 真实环线长度断言）

### 阶段 2：运动学模块 `src/lib/campus-transport/bus-kinematics.ts` ✓
- [x] T4 `solveTrapezoidProfile(L, T, A)`：巡航速度 v = A/2·(T−√(T²−4L/A))；判别式 <0 退化三角剖面
- [x] T5 `positionAlongSegment(τ, profile)`：分段（加速/匀速/减速）位置函数；**减速段起点 = 加速+巡航**（修复问题 2）
- [x] T6 `busTripTimeline(departureAt, p50, dwell)`：arrivals/leaves 时间轴，末站不加 dwell
- 测试：`tests/lib/bus-kinematics.test.ts`（12 tests，含实测锚点 365m/111s→3.42m/s + 减速段单调性回归）

### 阶段 3：组合层 `src/lib/campus-transport/bus-positions.ts` ✓
- [x] T7 `computeBusPositions(route, now, dwell)`：遍历 `scheduledDeparturesForDate`（已 export），过滤未发车/已收班，逐班次推算
- 使用 `buildStopAnchoredPath` 分段路径插值（`along` 为从首站起累计里程）
- 常量：`BUS_ACCELERATION_METERS_PER_SECOND_SQUARED=0.8`、`BUS_DWELL_MILLISECONDS=30_000`
- 测试：`tests/lib/bus-positions.test.ts`（7 tests，mock 多辆 + 真实 1A fixture + **方向回归**：10:10 发车后沿里程 331m→964m 递增、离首站越来越远）

### 阶段 4：UI 接入 ✓
- [x] T8 `campus-route-map.tsx`：新增 `busPositions` prop；load 后加 `campus-bus-vehicles` GeoJSON source + **巴士图标 layer**（lucide `bus` 侧视图，校徽黄 `#d4a538` + 白描边，离屏 canvas 像素注册，绕开 MapLibre loadImage 对 SVG data URL 的不稳定支持）；useEffect setData 更新；cleanup 移除 source/layer
- [x] T9 `campus-route-view.tsx`：now 刷新 1s（reduced-motion 30s）；`useMemo` 计算 busPositions 传地图；文案加「（地圖車輛為推算）」
- [x] T10（并行子代理）`dockingArrival` 停靠状态：`getCampusBusStopBoard` 返回正停靠本站的班次，ArrivalBoard 显示「下一班現正停靠本站」
- [x] T11 视觉升级（用户验收后确认）：车辆改**巴士图标**（原深色圆点 → 黄图标），车辆进站时对应站名数字底色变黄（`data-docking` marker，与巴士图标同色系配对）

### 阶段 5：收尾 ✓
- [x] tsc --noEmit pass
- [x] lint 0 errors
- [x] 相关单测 53/53 pass（含 route 2 车队回归测试：08:15 时 08:00+08:15 两班并存）；全量失败为 pre-existing（React.act 组件测试，非本 PR 引入）
- [x] 浏览器验收：巴士图标渲染确认（黄色侧视图巴士 + 白描边，vision 确认）；进站站名数字变黄；route 2 多车（08:15 两辆并存）由单测+浏览器验证

## 验证命令

```bash
pnpm vitest run tests/lib/route-geometry.test.ts tests/lib/route-geometry-path.test.ts tests/lib/bus-kinematics.test.ts tests/lib/bus-positions.test.ts
pnpm tsc --noEmit
pnpm lint
```

## 已知限制

- 车辆图标为 lucide `bus` 侧视图（canvas 像素注册），后续可换更精细的 SVG 图标或俯视巴士
- 1A 真实数据下同时最多 1 辆在路（发车间隔 10min vs 行程 9.7min）；route 2（间隔 15min < 行程）可同时 2 辆，已用回归测试+浏览器确认
- route-2 分叉几何：Dijkstra 站序锚定已实测连通，站点里程锚定正常
- 减速段终点有 ~3cm 浮点误差（边界容差断言，物理无意义）

## 后续可选（不在本计划内）

- 车辆图标换 bus SVG（当前 circle 色块）
- 到站时间剩余显示（上车后倒计时）
- 全路线几何方向回归测试固化（当前只对 1A 断言）
