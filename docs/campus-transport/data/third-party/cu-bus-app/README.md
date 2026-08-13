# CU Bus App（com.carsonwah.cubus）研究提取

抓取日：2026-08-11。来源：用户提供的 APKPure XAPK（v1.18 / versionCode 18）。

**研究副本 only。** 无开放数据许可；不默认再分发 APK / DB 二进制。

## 结论

| 问题                 | 答案                                                                                                                   |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| 有没有内嵌时刻表？   | **有**。`assets/cubus.db`（SQLite）                                                                                    |
| 有没有公开实时 API？ | **没有可用的**。`https://cu-bus-app.firebaseio.com` 返回 401；字符串里主要是 Firebase Analytics/Crashlytics + 校历外链 |
| ETA 怎么算？         | 本地查 `arrival_schedule` + `operating_day` 日类型过滤（教学日 / 六日 / 假期等）                                       |
| 能否当官方真值？     | **不能**。是社区 app 预计算的站到站时刻与站间秒数；计划发车仍以交通处 HTML/PDF 为准                                    |

对照官方 2026-08-11 merge：`1A` 已对齐 `07:40–18:50 every 10,20,40,50`（比 AnsonCheng03/CUBus 更新）。

## 包信息

见 `provenance.json`。

- package: `com.carsonwah.cubus`
- name: CU Bus
- version: **1.18** (18)
- 内嵌 DB schema 版本（SharedPreferences `CURRENT_DB_VERSION`）: **7**
- 运行时：DBFlow 把 `assets/cubus.db` 拷到 app 私有库；版本落后则 `deleteDatabase("cubus.db")` 再拷

## 表结构（`raw/cubus.db`）

|                 表 | 行数 | 含义                                                     |
| -----------------: | ---: | -------------------------------------------------------- |
|            `route` |   19 | 路线/变体（含 sat / non_teach / area39 / postgrad 拆分） |
|             `stop` |   35 | 站码 + 中英名 + lat/long                                 |
| `arrival_schedule` | 5069 | **预展开**到站时刻（含秒）                               |
|    `route_segment` | 1606 | 站→站期望秒数（含非相邻跳段）                            |
|    `operating_day` | 2588 | 日类型日历（2023-06-01 … 2030-07-01）                    |
|             `area` |   16 | 区域聚合（含 included stop ids）                         |
|     `area_to_area` | 2269 | 区域换乘/路段索引                                        |

### `route` 关键字段

- `operating_day_type`: `MON_TO_SAT` / `MON_TO_FRI_TEACHING_ONLY` / `SAT_TEACHING_ONLY` / `MON_TO_SAT_TEACHING_ONLY` / `MON_TO_SAT_NON_TEACHING` / `SUN_AND_PUBLIC_HOLIDAY`
- `open_time` / `close_time` / `departure_mins_json`：与官方 band 同构的起点规则
- `stops_json`：有序站列表（嵌套 name/lat/long）
- `directions_json`：Google Directions 路径缓存（`©2026 Google`）

### 路线 ID（19）

`1A` `1B` `2` `2_sir_run_run` `3` `4` `5` `5_sat` `6A` `6A_sat` `6B` `7` `7_sat` `8` `8_non_teach` `H` `H_area_39` `N` `N_postgrad`

### `arrival_schedule` 性质

- 不是官方公布的中间站时刻，是 **origin band 展开 + 站间秒数累加** 的客户端先验
- 例：1A `uni_station` 07:40:00 → sports 07:41:51 → sir_run_run 07:43:41 → admin 07:45:26 → shho 07:47:51 → terminal 07:49:41
- 查询逻辑见反编译 `e0/e.java`：按 `operating_day` 过滤 route type，再按当前时间窗扫 `arrival_time`

## 导出文件

| 路径                                | 内容                                    |
| ----------------------------------- | --------------------------------------- |
| `raw/cubus.db`                      | 原始内嵌库                              |
| `raw/xapk-manifest.json`            | XAPK 清单                               |
| `export/summary.json`               | 表计数 + 日历范围                       |
| `export/routes-overview.json`       | 含 directions 的完整 route 行           |
| `export/routes-compact.json`        | 路线摘要（无 Google 路径 blob）         |
| `export/stops-*.json`               | 35 站                                   |
| `export/arrival_schedule.json`      | 5069 条全量                             |
| `export/arrival-by-route-stop.json` | 按 route×stop 聚合（first/last/sample） |
| `export/route_segment.json` 等      | 全表 dump                               |
| `provenance.json`                   | sha256 / 版本 / 边界                    |

## 反编译观察（jadx）

- UI 包：`com.carsonwah.cubus.ui.*`（路线详情、到站列表、近站、area-to-area）
- DB 引导：`c0/b.java` → DBFlow `cubus.db`，`CURRENT_DB_VERSION=7`
- 到站查询：`e0/e.java` `querySchedulesFromNow`
- 外链：教务处 Almanac、作者 GitHub/站点、Google Forms 反馈
- **未发现** `transport.cuhk.edu.hk` 爬虫或实时车位 API 字符串

## 使用边界

1. **计划发车真值**仍以 `../cuhk-public-data` + `../schedules` 官方 merge 为准。
2. 本库适合：站码/坐标候选、变体拆分、社区站间秒数先验、教学日日历对照。
3. 不要把 `arrival_schedule` 写成官方 Stop time。
4. Firebase RTDB 未开放；不要假设有远程时刻同步。
