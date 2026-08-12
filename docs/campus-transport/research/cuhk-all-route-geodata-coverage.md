# CUHK 全路线地理数据覆盖与冲突审计

审计日期：2026-08-10（Asia/Hong_Kong）

## 范围与判定基准

本报告审计 Route 2 之外的当前 CUHK 路线：`1A, 1B, 3, 4, 5, 6A, 6B, 7, 8, N, H, Up, Down`，并把官方实际条件变体单独比较。

当前站序和条件规则以 CUHK 第一方资料为准：

- [Shuttle.pdf](https://transport.cuhk.edu.hk/wp-content/uploads/documents/Shuttle.pdf)：1A、1B、3、4、8；
- [Meet-class.pdf](https://transport.cuhk.edu.hk/wp-content/uploads/documents/Meet-class.pdf)：5、6A、6B、7；
- [NH.pdf](https://transport.cuhk.edu.hk/wp-content/uploads/documents/NH.pdf)：N、H；
- [PSLB_2025.pdf](https://transport.cuhk.edu.hk/wp-content/uploads/documents/PSLB_2025.pdf)：收费小巴 Up、Down；
- 当前官方单路线页：[`1A`](https://transport.cuhk.edu.hk/tc/route/1a/)、[`1B`](https://transport.cuhk.edu.hk/tc/route/1b/)、[`3`](https://transport.cuhk.edu.hk/tc/route/3/)、[`4`](https://transport.cuhk.edu.hk/tc/route/4/)、[`5`](https://transport.cuhk.edu.hk/tc/route/5/)、[`6A`](https://transport.cuhk.edu.hk/tc/route/6a/)、[`6B`](https://transport.cuhk.edu.hk/tc/route/6b/)、[`7`](https://transport.cuhk.edu.hk/tc/route/7/)、[`8`](https://transport.cuhk.edu.hk/tc/route/8/)、[`N`](https://transport.cuhk.edu.hk/tc/route/n/)、[`H`](https://transport.cuhk.edu.hk/tc/route/h/)、[`Up`](https://transport.cuhk.edu.hk/tc/route/up/)、[`Down`](https://transport.cuhk.edu.hk/tc/route/down/)。

OSM 只用于核查地理点、道路侧和 shape，不用于覆盖 CUHK 的服务规则。本轮逐个读取 relation 的 [OSM API `full.json`](https://wiki.openstreetmap.org/wiki/API_v0.6#Full:_GET_/api/0.6/%5Bway%7Crelation%5D/#id/full)，统计 relation member，并验证相邻 way occurrence 是否共享端点。

## 结论

OSM 已有 15 个 CUHK 免费校巴/转堂校巴 relation，包括 Route 2 的两个变体。Route 2 之外：

- **可直接采用站序和贴路 shape**：1A、1B、3、4、5、6B、7、8 教学日；
- **道路 shape 连续，但 relation 站点成员要先修正**：6A、H、H\*；
- **站序正确、shape 连续，但 `stop_position` 不完整**：N、N\*；
- **当前条件变体缺失**：8 非教学日；
- **完全没有找到 CUHK 校内收费小巴 relation**：Up、Down。

所有 13 个已抓取 relation 的道路 way 序列均连续：相邻 way 的端点断裂数都是 0。因此已存在 relation 的主要问题不是“道路画不出来”，而是少数 stop occurrence 重复、缺 `stop_position` 或缺条件分支。

CUHK 官方 Campus Map 可以为各条路线提供站点坐标候选，但旧 route/segment graph 不能普遍代表当前路线。只有 1A、1B 能用旧 segments 无歧义重建当前完整 shape；其余路线存在新站点不在 segment graph、旧站名变更、方向共点或当前变体缺失。

## 总表

`P/S` 表示 relation 内 platform occurrence / stop_position occurrence；`ways` 表示 way occurrence / unique way。坐标覆盖按当前官方 stop occurrence 计算，不把 OSM 多出的错误 occurrence 算进分母。

| 路线/变体                   | 当前官方站数 | OSM relation                                                  |       P/S |  ways | 官方站序                                                                        | OSM 成员坐标覆盖                                       | CUHK Campus Map 坐标候选                                     | 是否可生成贴路 shape                                  |
| --------------------------- | -----------: | ------------------------------------------------------------- | --------: | ----: | ------------------------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------ | ----------------------------------------------------- |
| 1A                          |            6 | [`8022756`](https://www.openstreetmap.org/relation/8022756)   |       6/6 | 23/20 | 完全一致                                                                        | 6/6                                                    | 6/6                                                          | 是，OSM 与官方旧 segments 都完整                      |
| 1B，经 PGH1 双向            |            8 | [`8022757`](https://www.openstreetmap.org/relation/8022757)   |       8/8 | 39/25 | 完全一致                                                                        | 8/8                                                    | 8/8                                                          | 是，OSM 与官方旧 segments 都完整                      |
| 3                           |           15 | [`8023803`](https://www.openstreetmap.org/relation/8023803)   |     15/15 | 62/45 | 完全一致                                                                        | 15/15                                                  | 15/15 候选；部分方向站需解释                                 | 是，优先 OSM；官方旧 graph 不足以直接证明当前 shape   |
| 4                           |           15 | [`8027087`](https://www.openstreetmap.org/relation/8027087)   |     15/15 | 60/49 | 完全一致                                                                        | 15/15                                                  | 15/15 候选；Area 39 等方向共点                               | 是，优先 OSM                                          |
| 5                           |            9 | [`21070657`](https://www.openstreetmap.org/relation/21070657) |       9/9 | 34/31 | 完全一致                                                                        | 9/9                                                    | 9/9 候选                                                     | 是，优先 OSM                                          |
| 6A                          |           10 | [`21070927`](https://www.openstreetmap.org/relation/21070927) | **11/11** | 36/35 | **多一个连续重复的 United College (Downward)**                                  | 10/10，另有 1 个错误重复                               | 10/10 候选                                                   | ways 连续，但不能原样采用 stop sequence               |
| 6B                          |            6 | [`21070928`](https://www.openstreetmap.org/relation/21070928) |       6/6 | 24/24 | 完全一致                                                                        | 6/6                                                    | 6/6 候选                                                     | 是，优先 OSM                                          |
| 7                           |            8 | [`21070929`](https://www.openstreetmap.org/relation/21070929) |       8/8 | 32/31 | 完全一致                                                                        | 8/8                                                    | 8/8 候选                                                     | 是，优先 OSM                                          |
| 8 教学日                    |           16 | [`8022758`](https://www.openstreetmap.org/relation/8022758)   |     16/16 | 69/45 | 完全一致                                                                        | 16/16                                                  | 16/16 候选                                                   | 是，OSM shape 完整                                    |
| 8 非教学日                  |           17 | **没有独立 relation**                                         |         — |     — | OSM 缺 `Station Piazza -> Chung Chi Teaching Bldg.` 末段，并错误表达为 `SH off` | relation 成员只覆盖共同前 15/17；两缺站在 OSM 另有节点 | 17/17 候选                                                   | 否，不能把教学日 shape 直接当非教学日 shape           |
| N 基础班次                  |           19 | [`21070358`](https://www.openstreetmap.org/relation/21070358) | **19/18** | 77/54 | platform 顺序一致                                                               | 19/19                                                  | 19/19 候选                                                   | ways 完整；Sir Run Run Shaw Hall 缺道路 stop_position |
| N 00 分，经 PGH1 双向       |           21 | [`21070359`](https://www.openstreetmap.org/relation/21070359) | **21/20** | 93/59 | platform 顺序及条件一致                                                         | 21/21                                                  | 21/21 候选                                                   | ways 完整；同样缺 Shaw Hall stop_position             |
| H 基础班次                  |           19 | [`21070478`](https://www.openstreetmap.org/relation/21070478) | **20/20** | 74/52 | **多一个连续重复的 Wu Yee Sun College (Downward)**                              | 19/19，另有 1 个错误重复                               | 19/19 候选                                                   | ways 连续，但不能原样采用 stop sequence               |
| H 00 分，经 PGH1 与 Area 39 |           22 | [`21070477`](https://www.openstreetmap.org/relation/21070477) | **23/23** | 97/62 | 条件站正确，但同样多一个 WYS Downward                                           | 22/22，另有 1 个错误重复                               | 22/22 候选                                                   | ways 连续，但不能原样采用 stop sequence               |
| Up 收费小巴                 |           15 | **未找到**                                                    |         — |     — | 无 OSM relation 可比                                                            | 0/15 relation-associated                               | type-2 直接 13/15；借用 type-1 United/New Asia 后 15/15 候选 | 否，官方地图也没有当前 Up route graph                 |
| Down 收费小巴               |           15 | **未找到**                                                    |         — |     — | 无 OSM relation 可比                                                            | 0/15 relation-associated                               | type-2 直接 13/15；借用 type-1 United/New Asia 后 15/15 候选 | 否，官方地图也没有当前 Down route graph               |

## 逐路线核查

### 1A

官方序列为：

```text
Univ. Station -> Sports Centre -> Shaw Hall -> Admin -> S.H. Ho -> Univ. Station
```

OSM 六个 platform、六个 stop_position 和道路顺序完全匹配。CUHK Campus Map 也存在可无歧义拼接的旧 segments：

```text
1 (1->2), 2 (2->4), 11 (4->10), 45 (10->51), 46 (51->1)
```

结论：站点和 shape 均可采用；保留 OSM ODbL 来源层，同时可用官方旧 shape 做几何交叉检查。

### 1B

OSM 正确把 PGH1 放在去程和回程各一次，八个 occurrence 与官方一致。官方 Campus Map 也有完整有向链：

```text
29 (1->22), 30 (22->2), 2 (2->4), 11 (4->10),
45 (10->51), 47 (51->22), 42 (22->1)
```

1B 所有班次本来就是 00/30 分，因此当前不需要另建“不经 PGH1”的 1B pattern。

### 3

15 个 OSM platform 与当前官方站序一致；上行/下行的 WYS、Shaw occurrence 使用不同 OSM platform，可保留道路侧别。终点是 OSM node `5414326180` 的 University MTR Station Piazza，而 Route 2 起点使用 node `2036051433`。两者不应仅因同名就先合并为同一站牌坐标。

CUHK Campus Map 可以为 15 个 occurrence 找到位置候选，但 WYS 对应旧 `Residence Nos. 3 & 4` 一带，且当前 Y.I.A.P./CWC 等新 ID 不在旧 segment endpoint 集合；不能把旧 route graph 直接称为当前 Route 3 shape。

### 4

15 个 platform、15 个 stop_position 与官方顺序一致，包括 Circuit East、Area 39、CWC 两次及后续回程。OSM ways 连续，可生成贴路 shape。

Campus Map 有对应的 Circuit East/CWC/Area 39 新坐标，但这些新站点 ID 没进入旧 `shuttle_bus_seg` graph，故它只提供 point candidates，不提供完整当前 shape。

### 5

九站顺序与官方一致，OSM 起点 CCTB、终点 CWC 以及中间道路完整。`opening_hours` 写出周一至五和周六的不同时段，并用 `SH off` 表达 school holidays；CUHK 的“教学日”仍须由官方 academic calendar 决定，不能只依赖 OSM 的区域 school-holiday 语义。

### 6A

官方只有一个 United College (Downward)。OSM relation 却连续写了两次同一个 platform node `1716519514`，并连续写了两次同一个 stop_position `5413654365`：

```text
... New Asia -> United Down -> United Down -> Admin ...
```

道路 way 链仍连续，但 relation 的停站序列不正确。导入时必须以官方十站 pattern 为准，删除重复 occurrence；不能把 11 个 OSM 成员全部生成业务 StopTime。

### 6B

六站、六个 stop_position 和连续 ways 都与官方一致。可直接采用 OSM shape 和 platform candidates。

### 7

八站与官方一致，首站 Shaw Downward 使用 `platform_entry_only`，末站 CCTB 使用 `platform_exit_only`。OSM shape 可直接使用。

### 8

OSM relation 精确覆盖教学日 16 站，终点为 Univ. Station。但当前官方规则明确：非教学日加停 Station Piazza 与 Chung Chi Teaching Bldg.，且不停 Univ. Station。

OSM 不仅没有这个 17 站变体，`opening_hours` 还写成：

```text
Mo-Sa 07:40-18:40; Su,SH,PH off
```

把 `SH off` 解释为 school holidays 停驶会与 CUHK 官方“非教学日改道继续服务”冲突。业务服务日必须跟官方资料；OSM relation 只能作为教学日 shape。非教学日的最后两站在 OSM 各自存在，但缺少 8 号线 relation membership 和经审核的末段 ways。

### N / N\*

N 基础 pattern 19 个 platform 与官方一致，并正常包含 Area 39；N* 为 21 个，正确在去回程各加入一次 PGH1。OSM 对 N* 的 note 也写明 00 分加停 PGH1。

两个 relation 都缺 Sir Run Run Shaw Hall 对应的道路 `stop_position`：platform node `1716519535` 后直接进入下一个 platform。由于 way 链完整，这不妨碍画 shape，但不满足完整的 PTv2 platform/stop pairing。ETA 与反馈应仍绑定 Shaw Hall platform occurrence，不能因为缺 stop_position 而删除该站。

### H / H\*

H 基础 pattern 应为 19 站；H* 在 00 分加 PGH1 双向和 Area 39 后应为 22 站。OSM 对条件站的理解正确：H 基础不含 Area 39，H* 才含。

但两个 relation 都在 Shaw College (Downward) 之后连续写了两次同一个 WYS Downward platform node `1716519421` 和其 stop_position。必须按官方 pattern 删除一个重复 occurrence。ways 连续，可作为 geometry，但 relation stop member 不可直接生成 StopTime。

### Up / Down 收费小巴

对 CUHK 校园 bbox 查询所有 `type=route` 且 `route=bus|minibus` 的 relation，没有找到当前收费小巴 Up 或 Down；搜索到的 CUHK relation 只覆盖免费校巴/转堂校巴。

Campus Map 的 23 个 type-2 point records 可以直接提供 Up/Down 各 13/15 个位置候选；当前序列中的 United College 和 New Asia College 需要借用 type-1 的方向点，才能达到 15/15 候选覆盖。这个跨类型连接不能自动接受。

Campus Map 没有当前 Up/Down 的 route relation 或 1-15 有向 graph。官方 PSLB PDF 能人工确认站序和示意路径，但不含机器可用道路 geometry。因此当前不能声称 Up/Down 已有公开、完整、贴路 shape。

University Health Centre 是工作日特定时段条件站：

- Up：周一至五 08:30–17:30，公众/大学假期除外；
- Down：周一至五 08:45–17:45，公众/大学假期除外。

它不需要分裂成两条永久路线百科，但需要两个 pattern/service-rule 计算结果：当天符合时插入 Health Centre，否则跳过。坐标本身不能决定这个条件。

## 跨路线的数据建模注意点

### 同一个官方 stop ID 可能对应多个 OSM platform

至少有这些实际情况：

- Station Piazza：Route 2 起点 node `2036051433`；Route 3/6/7 终点附近使用 node `5414326180`；
- United College (Downward)：N/H/8 在环线不同 occurrence 使用两个相距很近但不同的 OSM platform；
- University Administration Building：大多数路线和 Route 8 使用不同 platform node。

因此应分开：

```text
OfficialStopIdentity (CUHK WP stop id)
PhysicalStopPoint (OSM/CUHK coordinate and road side)
RoutePatternStop (pattern id + sequence + stop point)
```

不能让一个 WordPress stop ID 强迫所有 route occurrence 共用同一坐标。

### OSM 元数据不能作唯一发现条件

部分 relation 写 `operator=CUHK`，部分写完整双语大学名，部分变体 relation 没有 `operator`。发现路线时不能只过滤 `operator=CUHK`；应使用已审核 relation ID、名称规则和官方路线集合共同约束。

OSM 的 `opening_hours` 没有完整表达每小时分钟，且教学日/非教学日语义可能与 CUHK academic calendar 不同。时间表必须来自 CUHK 官方页面，OSM 只提供地理证据。

## 可复现查询

列出 CUHK 校园范围内所有 bus/minibus relation：

```overpass
[out:json][timeout:60];
relation
  ["type"="route"]
  ["route"~"bus|minibus"]
  (22.408,114.195,22.430,114.225);
out tags meta;
```

抓某条 relation 的成员和道路：

```bash
curl -L 'https://api.openstreetmap.org/api/0.6/relation/8022756/full.json'
curl -L 'https://api.openstreetmap.org/api/0.6/relation/21070927/full.json'
curl -L 'https://api.openstreetmap.org/api/0.6/relation/21070478/full.json'
```

抓 CUHK 官方 Campus Map：

```bash
curl -I -L 'https://www.cuhk.edu.hk/english/js/campus/cuhk_location_db.js?20161006'
curl -L 'https://www.cuhk.edu.hk/english/js/campus/cuhk_location_db.js?20161006' -o cuhk_location_db.js
shasum -a 256 cuhk_location_db.js
```

本轮官方资产摘要：51 个站点坐标、46 个旧有向 segment；只有 20/28 个 type-1 校巴点出现在旧 segment endpoint 集合。新加入坐标表的 Station Piazza、Y.I.A.P.、Area 39、CWC、Circuit East、Circuit North 等没有同步成为旧 graph endpoint，这是多数当前路线不能仅靠官方旧 graph 生成完整 shape 的直接原因。

## 建议的采用等级

### 可进入第一版

- OSM shapes：1A、1B、3、4、5、6B、7、8 教学日；
- 6A：沿用 OSM ways，但 stop sequence 必须取官方十站 pattern；
- N/N\*：沿用 OSM ways/platform，标记 Shaw Hall `stop_position_missing`；
- H/H\*：沿用 OSM ways，但删除 relation 中重复 WYS Downward occurrence；
- 所有 OSM 数据保留 relation/node/way version、timestamp 和 ODbL attribution。

### 暂时只能 provisional

- 8 非教学日的 Station Piazza -> CCTB 末段；
- Up/Down 全路线 shape；
- CUHK Campus Map 中依靠旧名、跨 type 或同一坐标复用得到的方向站。

### 不可采用

- 6A 的 11 站 OSM sequence；
- H/H\* 的 20/23 站 OSM sequence；
- 用 Route 8 的 `SH off` 决定 CUHK 非教学日停驶；
- 把 Up/Down 当作已经存在 OSM relation；
- 把站点坐标直接连成路线；
- 把 OSM schedule tags 当官方时刻表。

## 许可与仍未验证

OSM 数据采用 ODbL 1.0，使用时需标注 OpenStreetMap contributors；对外分发修改或融合后的 OSM-derived database 可能触发 share-alike。建议 OSM source layer 与自有业务数据库分层保存。[OSM 官方版权说明](https://www.openstreetmap.org/copyright)、[OSMF Licence FAQ](https://osmfoundation.org/wiki/Licence/Licence_and_Legal_FAQ)。

CUHK 官方网页和地图资产没有开放数据许可。可用于内部事实核对和保存必要证据，但批量再发布前应确认授权。[CUHK 免责声明](https://www.cuhk.edu.hk/english/disclaimer.html)。

仍未验证：

- OSM road ways 与实际校巴当日临时改道的一致性；
- Route 8 非教学日最后两站之间的精确道路 shape；
- Up/Down 的完整贴路 shape 和每个方向站牌的实地道路侧；
- CUHK Campus Map 每个旧坐标的逐点实测日期；
- OSM relation 中缺失/重复成员是否已向 OSM 社区提交修正。
