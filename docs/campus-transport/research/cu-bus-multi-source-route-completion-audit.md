# CU Bus 多源补全与交叉验证审计

审计日期：2026-08-11（Asia/Hong_Kong）
范围：当前尚未接入的 `3 / 5 / 6A / 6B / 7 / 8 / N / H`；附带说明 `Up / Down`。
目标：判断各路线能否补齐 ①官方起点班次、②站序与条件变体、③站点坐标与贴路 shape、④中间站 offset。

## 结论

可以继续接入，但应分两层理解“补齐”：

- **官方运营骨架可以补齐**：八条目标路线都有当前 CUHK 官方起点班次和已审核站序；`8 / N / H` 必须保留条件变体，不能合成一条固定站序。
- **地图大部分可以补齐**：`3 / 5 / 6A / 6B / 7 / 8 教学日 / N / H` 都有连续 OSM ways；`6A`、`H` 要以官方站序修正 OSM 重复站，`N` 缺一个道路 `stop_position` 但不缺 platform/shape。唯一明显几何硬缺是 **8 非教学日最后 `Station Piazza -> Chung Chi Teaching Bldg.` 的独立 route shape**。
- **offset 只能补成“弱先验”，不能补成事实**：CU Bus App v1.18 和 Anson CUBus 对所有目标路线都有完整逐站秒数，但两者高度疑似同源；125 条可对齐边中 113 条（90.4%）相差不超过 2 秒，不能算两份独立验证。Bus Clock 仅能为 `3 / 5 / 8 / H` 提供路线标签的 GPS 观测；`6A / 6B / 7 / N` 没有路线特定站间样本。

推荐接入顺序：

1. **批次 B1：3、5**——官方骨架、OSM shape 完整，且 Bus Clock 各覆盖全部官方相邻段，可将社区 offset 降权后交叉检查。
2. **批次 B2：6A、6B、7**——骨架和地图可完成；offset 仅有同一条 community-prior lineage，必须显示“预计”并给更宽不确定性。`6A` 导入 OSM 时删除重复 United College occurrence。
3. **批次 C：8**——必须实现教学日/非教学日两个 pattern；教学日 shape 可接，非教学日末段先保留 provisional 或完成独立道路 routing 审核后再上线地图。
4. **批次 D：N、H**——必须按发车分钟选择 pattern；`N 00` 加 PGH1 双向，`H 00` 加 PGH1 双向及 Area 39。H 默认 pattern 有 Bus Clock 弱验证，N 没有可用站间 GPS 样本。
5. **暂缓：Up、Down**——没有 OSM route relation、没有 App/Anson/Bus Clock offset；Down 的当前官方网页与 PDF 对第二服务时段的服务日还互相冲突。

## 证据与独立性

本审计没有把 [handoff](./cu-bus-data-sources-handoff.md) 当作结论，而是重新查询以下原始文件：

| 层               | 原始证据                                                                                                                                                                                                                                                                                                                                                             | 本次读取结果                                                                                | 独立性边界                                                                                           |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| CUHK 当前官方    | [`merged.snapshot.json`](../data/cuhk-public-data/merged.snapshot.json) 中 2026-08-11 抓取的路线页与 [Shuttle.pdf](https://transport.cuhk.edu.hk/wp-content/uploads/documents/Shuttle.pdf)、[Meet-class.pdf](https://transport.cuhk.edu.hk/wp-content/uploads/documents/Meet-class.pdf)、[NH.pdf](https://transport.cuhk.edu.hk/wp-content/uploads/documents/NH.pdf) | 14 routes、18 reviewed patterns；本次八线共有 8 schedule bands、11 patterns                 | 起点班次与业务 pattern 的唯一权威层；PDF 文字顺序本身不是行驶顺序，采用 merged 中人工视觉审核结果    |
| 官方发车展开     | [`schedules/by-route`](../data/schedules/by-route/)                                                                                                                                                                                                                                                                                                                  | 3=30、5=42、6A=14、6B=6、7=31、8=34、N=19、H=46 个每日 origin 候选                          | 8 的 34 个班次必须再用教学日类型选 pattern；不是逐站时刻                                             |
| CU Bus App v1.18 | [`raw/cubus.db`](../data/third-party/cu-bus-app/raw/cubus.db)                                                                                                                                                                                                                                                                                                        | 目标路线 14 个变体、3,664 条 `arrival_schedule`、1,377 条全组合 `route_segment`             | 闭源 App 内嵌预计算；不是官方到站，也没有开放数据许可                                                |
| Anson CUBus      | [`Route.json`](../data/third-party/cubus-anson/Route.json)、[`gps.json`](../data/third-party/cubus-anson/gps.json)                                                                                                                                                                                                                                                   | 八线 11 个 pattern；目标 pattern 的 6–22 个站均有坐标和 hop 秒                              | 数据约 2024-10；与 App 秒数过度相似，按同一 community lineage 处理                                   |
| Flippy CU_v1.1   | [`announcement_CU_171.db`](../data/third-party/flippy/announcement_CU_171.db) / [SQL](../data/third-party/flippy/announcement_CU_171.sql)                                                                                                                                                                                                                            | 八线 12 个历史 pattern；各 pattern 的 6–22 个 stop occurrence 都有坐标                      | 2023 报站机库；没有班次/offset。可独立核站序和历史点位，不能覆盖当前官方规则                         |
| Bus Clock        | fixed commit [`575adc5`](https://github.com/CCheukKa/CUHK-bus-clock/tree/575adc5475fc115001c30d9b5d5373384791c1f6)；摘要在 merged                                                                                                                                                                                                                                    | 154 GPS 点、113 个站间样本；目标路线标签：3=14、5=8、8=16、H=18，N 只有一个点，6A/6B/7 为 0 | 最近站自动匹配，无 trip/vehicle/pattern 身份；最终 pair 汇总丢失 route/time，不能伪装成官方 StopTime |
| OpenStreetMap    | 下表列出的 `route=bus` relation / `full.json`                                                                                                                                                                                                                                                                                                                        | 除 8 非教学日外，目标 patterns 均有可用 ways                                                | ODbL 社区地理层，只证明候选点/道路几何，不证明 CUHK 服务规则                                         |

### App 与 Anson 不能作为两票

直接从 `cubus.db.route_segment` 和 `Route.json.stations.time` 重新对齐相邻站：

| pattern            | 可对齐边 | 中位绝对差 | ≤2 秒 | ≥30 秒异常 |
| ------------------ | -------: | ---------: | ----: | ---------: |
| 3                  |       12 |       0.8s |    10 |          2 |
| 5                  |        8 |       0.6s |     8 |          0 |
| 6A                 |        9 |       0.5s |     9 |          0 |
| 6B                 |        5 |       0.4s |     5 |          0 |
| 7                  |        7 |       0.7s |     7 |          0 |
| 8 / 8 non-teaching |       25 |   0.6–0.9s |    21 |          2 |
| H / H 00           |       30 |   0.8–0.9s |    27 |          1 |
| N / N 00           |       29 |   0.6–0.8s |    26 |          3 |

异常大差值基本来自站名归一后跨过中间站，例如 Route 3 的 `FKHB -> RESI34` 和 `RESI34 -> UADM`；其余大量秒数只差取整误差。无法从公开源码证明谁复制谁，但这种吻合不足以支持“独立测量得到同一结果”。工程上应将两者合并为一个低权重 `community_schedule_prior`，而不是把一致性加倍计权。

App 的 `operating_day` 也不能补官方日历真值：官方 Almanac 在 merged 中明确 2026-03-02 至 03-07 是 reading week，而 App 对这六天全部写 `is_teaching_day=1`。5/6A/6B/7 的当前官方规则是教学日服务、阅读周暂停，因此 App 2023–2030 日历只能作历史对照。

## 逐路线补全矩阵

“offset 覆盖”中的 App 行数是该 route/variant 的预展开到站记录；Bus Clock 是可由固定 processed GPS 重建的路线标签站间样本，不是班次数。

| 路线   | ①官方起点班次                                           | ②站序/变体交叉验证                                                                                                                             | ③坐标/shape                                                                                                                                                                                            | ④offset 证据                                                                                                                                       | 判定                                                                         |
| ------ | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| **3**  | 09:00–18:40，00/20/40；30 origin                        | 官方 15 站；App/Anson 15，Flippy 15。Flippy/旧社区把当前 WYS 写作 Residences 3&4，位置可对照但身份以官方为准                                   | OSM [`8023803`](https://www.openstreetmap.org/relation/8023803)：15/15 platform、15/15 stop position、连续 ways；官方 Campus Map 15/15 点候选                                                          | App 450 行；community lineage 覆盖全线。Bus Clock **14 样本/14 pairs/2 服务日**，对应 14/14 官方相邻段                                             | **B1，可接**；独立 GPS 很稀疏，仍标“预计”                                    |
| **5**  | 周一至五 09:18–17:26、周六至 13:26，18/22/26；42 origin | 官方/App/Anson 为 9 站。Flippy `5;CU` 只有 8 站，`5;S;CU` 才含终点 CWC；这是旧条件分支，不能覆盖当前官方 9 站 pattern                          | OSM [`21070657`](https://www.openstreetmap.org/relation/21070657)：9/9，shape 连续；Campus Map 9/9 候选                                                                                                | App 243+135=378 行；community 全线。Bus Clock **8 样本/8 pairs/1 服务日**，覆盖 8/8 相邻段                                                         | **B1，可接**；日历必须用官方 Almanac 排除 reading week                       |
| **6A** | 周一至五 09:10–17:10、周六至 13:10，10 分；14 origin    | 官方/App/Anson/Flippy 均为 10 站                                                                                                               | OSM [`21070927`](https://www.openstreetmap.org/relation/21070927) 错列 11 个 occurrence，连续重复 United College；ways 连续。按官方删重后 10/10 坐标可用                                               | App 90+50=140 行；community 全线；Bus Clock 路线样本 **0**                                                                                         | **B2，可接**；offset 只能低置信度，不能称“已实测”                            |
| **6B** | 周一至五 12:20–17:20，20 分；6 origin                   | 四源均为 6 站且顺序一致                                                                                                                        | OSM [`21070928`](https://www.openstreetmap.org/relation/21070928)：6/6，shape 连续                                                                                                                     | App 36 行；community 全线；Bus Clock 路线样本 **0**                                                                                                | **B2，可接**；同上                                                           |
| **7**  | 周一至五 08:18–17:50、周六至 13:18，18/50；31 origin    | 四源均为 8 站；Flippy 旧名 Residences 3&4 对应当前 WYS Downward                                                                                | OSM [`21070929`](https://www.openstreetmap.org/relation/21070929)：8/8，shape 连续                                                                                                                     | App 160+88=248 行；community 全线；Bus Clock 路线样本 **0**                                                                                        | **B2，可接**；同上                                                           |
| **8**  | 07:40–18:40，00/20/40；34 origin                        | 官方明确两个 pattern：教学日 16 站到 Univ. Station；非教学日 17 站，改到 Piazza+CCTB。App、Anson、Flippy 都各有 16/17 站变体                   | 教学日 OSM [`8022758`](https://www.openstreetmap.org/relation/8022758) 16/16、shape 完整；**没有非教学日独立 relation/末段 shape**，但两末站各有点坐标                                                 | App 544+578=1,122 行；community 两变体完整。Bus Clock **16 样本/14 pairs/2 服务日**；仅覆盖教学 pattern 15 段中的约 14 段，且没有可靠 pattern 身份 | **C，分 pattern 接**；非教学地图不得借教学日终点或复制 App Google directions |
| **N**  | 19:00–23:30，00/15/30/45；19 origin                     | 15/30/45 为 19 站；00 分为 21 occurrence，PGH1 去回各一次。Flippy 与官方含 New Asia Circle；App/Anson 用 `na_college_backhill`，身份以官方为准 | OSM [`21070358`](https://www.openstreetmap.org/relation/21070358) / [`21070359`](https://www.openstreetmap.org/relation/21070359)：19/21 platform、ways 连续；Shaw Hall 缺道路 stop_position，不应删站 | App 266+105=371 行；community 两变体完整。Bus Clock 原始 N 只有 **1 GPS 点、0 站间样本**                                                           | **D，可接**；offset 完全没有独立路线观测，置信度最低                         |
| **H**  | 08:20–23:20，00/20/40；46 origin                        | 20/40 为 19 站；00 分为 22 occurrence，PGH1 双向+Area39。Flippy 明确含 New Asia Circle；官方优先                                               | OSM [`21070478`](https://www.openstreetmap.org/relation/21070478) / [`21070477`](https://www.openstreetmap.org/relation/21070477) 多一个连续重复 WYS Downward；按官方删重后 ways 可用                  | App 589+330=919 行；community 两变体完整。Bus Clock **18 样本/18 pairs/2 服务日**，可弱验证默认 loop，但日志没有 `H_area_39` pattern 身份          | **D，可接**；00 分条件段不能声称已由 Bus Clock 验证                          |

## 坐标能否由第三方补洞

可以作候选，但不应替代 OSM/官方位置审核：

- App 的目标 `stops_json` 均内嵌经纬度；Anson 对上述 11 个 route pattern 的每一个站码都能在 `gps.json` 找到坐标；Flippy 上表 12 个 pattern 的 **183/183 route-stop occurrence** 都能 join 到带经纬度的 `StopList`。
- 三源之间的同名点并非总是同一个站台。既有原始比较中，University Station 最大展开约 233m、Admin 75m、New Asia 71m、CWC 60m、Shaw Hall 48m、WYS/Residences 3&4 45m。这通常是终点/上落客点/道路侧或旧命名混桶，不应平均坐标。
- 业务反馈必须绑定 `patternId + sequence + physicalStopPoint`；同一官方 stop ID 在不同 route occurrence 可对应不同 OSM platform。
- App 的 `directions_json` 是缓存的 Google Directions（标有 `©2026 Google`），不能拿来补 8 非教学日 shape 后再发布。

## 不可跨越的证据边界

1. **官方只提供 origin timetable，不提供中间站 StopTime。**所有逐站时间都继续显示“预计”。
2. **App + Anson 只算一个先验来源。**两者都没有公开的采集方法、样本数、trip identity 或误差分布。
3. **Bus Clock 不能跨路线改名为实测。**共享 physical pair 可用于分层模型收缩，但 `6A/6B/7/N` 仍是 0 个路线特定站间样本；最终 `station-times.json` 的 `routeScope` 也是 null。
4. **不以坐标决定站序。**站序与条件站只用 CUHK 官方 reviewed pattern；OSM/Flippy/App/Anson 只用于交叉核对和地理补充。
5. **不把多个站台静默平均。**≥40m 冲突或方向站必须人工选点，并保留各 source observation。
6. **不使用 App 教学日日历作真值。**当前官方 Almanac + reading week/大学假期优先。
7. **第三方许可未清。**App DB、Anson JSON、Flippy DB 都没有足以支持默认再分发的开放数据许可；生产最稳妥的做法是保存来源和审计结果，将数值维持 staging，取得许可后才内置。

## Up / Down 补充

- 官方各有 15 站 reviewed pattern；Campus Map 可提供 15/15 坐标候选，但没有 OSM route relation，也没有可复核贴路 shape。
- App、Anson、Flippy、Bus Clock 都没有这两条收费小巴的路线级逐站 offset。
- Up 起点班次可采用官方页面/PDF；Down 暂不可无条件上线：页面写第二时段 `08:45–21:15 星期日及公众假期`，而 [PSLB_2025.pdf](https://transport.cuhk.edu.hk/wp-content/uploads/documents/PSLB_2025.pdf) 写星期一至日及公众假期。同一官方机构内部冲突必须保留为 `source_conflict`。

## 推荐落地规则

每条新路线的数据应分层保存：

```text
OfficialSchedule     = CUHK origin bands + service rule
OfficialPattern      = reviewed stop occurrences + activation rule
Geodata              = OSM relation/platform/ways + attribution + review fixups
CommunityPrior       = one correlated App/Anson lineage, low weight
ObservedPrior        = Bus Clock route-labelled samples where available
UserObservation      = future anonymous route + stop occurrence + observed HKT time
```

模型初始化建议：有 Bus Clock 路线样本的 `3/5/8/H` 先用路线样本，经质量过滤后再向 community prior 收缩；没有路线样本的 `6A/6B/7/N` 以 community prior 为中心但扩大方差，并让用户反馈快速接管。不要为追求 100% 数字覆盖而写入固定 120.5 秒或跨路线 median，却不显示其来源和不确定性。

## 复核命令

```bash
# 官方每日 origin 数和 pattern 选择状态
jq '.summary' docs/campus-transport/data/schedules/by-route/{3,5,6a,6b,7,8,n,h}.json

# App 原始表计数
sqlite3 docs/campus-transport/data/third-party/cu-bus-app/raw/cubus.db \
  "select route_id,count(*) from arrival_schedule group by route_id;"

# App reading-week 冲突
sqlite3 docs/campus-transport/data/third-party/cu-bus-app/raw/cubus.db \
  "select * from operating_day where date between '2026-03-02' and '2026-03-07';"

# Flippy 原始站序与坐标
sqlite3 docs/campus-transport/data/third-party/flippy/announcement_CU_171.db \
  "select r.OpenDataRouteId,rs.StopSeq,s.AnnouncementShortEng,s.Latitude,s.Longitude
   from RouteList r join RouteStopList rs on rs.RouteCode=r.RouteCode
   join StopList s on s.OpenDataStopId=rs.MapStopId and s.OperatorId=rs.MapOperatorId
   order by r.RouteCode,rs.StopSeq;"
```
