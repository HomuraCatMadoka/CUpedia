# Campus Map V2 代表设施资料

Status: Research snapshot  
Last verified: 2026-09-04

这份清单只用于验证 V2 数据结构能否容纳真实资料，不是生产全量种子，也不是爬虫规则。固定 payload
在 `src/lib/campus-map/representative-facility-manifest.ts`；管理员执行导入时，所有资料仍通过唯一的
canonical publisher 发布。

导入器用每个样例的第一条官方来源作为稳定身份，在完整 revision 历史中查找 Place：四个都不存在时
才一次创建；四个都存在时直接返回已有 Place；只存在一部分、来源指向多个 Place，或 Place 已停用时
停止。数据库锁避免两名管理员同时创建两套数据。它不建立高德映射，也不在执行时访问外部网页。

## 首批四个样例

| Place      | Place type        | Canonical 位置                         | 保存的实用资料                            | 暂不保存                       |
| ---------- | ----------------- | -------------------------------------- | ----------------------------------------- | ------------------------------ |
| BMS LT     | `classroom`       | BMS Building-only                      | RES 详情入口                              | 楼层、容量、座位类型、开放时间 |
| 大学游泳池 | `sports-facility` | 独立 WGS84 approximate point           | 通常时段、收费/八达通提示、最新安排与详情 | 实时营业、节假日临时停开       |
| 保健处门诊 | `health-service`  | University Health Centre Building-only | 通常时段、网上预约、电话、登记提示        | 楼层、实时预约余量             |
| 保健处牙科 | `health-service`  | University Health Centre Building-only | 预约电话、官方详情                        | 未被来源证实的门诊时段         |

门诊和牙科拆成两个 Place，因为它们的操作和时间证据不同。其他只有一种服务的地点直接使用一张
Place，不增加服务组、子类型或中间实体。课室的首要用途是“找到并导航到哪里”；容量和座位类型等
资料等到有完整、稳定的数据源和独立消费场景后再建模。

## 官方来源

- 课室：CUHK Registration and Examinations Section，
  <https://www.res.cuhk.edu.hk/teaching-timetable-classroom-booking/classroom-booking/list-of-communal-classrooms/>
- 游泳池资料：CUHK Office of Student Affairs，
  <https://www.osa.cuhk.edu.hk/campus-life/amenities/swimming-pool/>
- 游泳池最新安排：CUHK 游泳池公开 Google Calendar，
  <https://calendar.google.com/calendar/embed?ctz=Asia%2FHong_Kong&src=swimmingpoolcuhk%40gmail.com>
- 游泳池点位：CUHK 官方 Campus Map location database（版本 `20161006`），
  <https://www.cuhk.edu.hk/english/js/campus/cuhk_location_db.js?20161006>
- 门诊与牙科：CUHK University Medical Service Office，<https://www.umso.cuhk.edu.hk/>
- 门诊预约：CUHK University Medical Service Office Booking，<https://booking.umso.cuhk.edu.hk/booking/>

## 后续边界

以后做“检查官网更新”时，先抓取并显示字段差异，让管理员选择采用官网值或保留人工值，再通过同一
publisher 发布新 revision。当前不做 cron、实时查询、自动覆盖或高德 API 消耗。

高德 POI 与 Building/Place 的绑定继续由现有 provider-mapping registry 单独管理。本次不重复写入
#869 已建立的映射机制，也不把高德 ID 放进官方事实导入。

以下 UI 继续拆到独立 issues：公开地图开放新类型、地点卡展示通常时间/提示/官方操作、完整维护表单、
管理员预览与导入按钮，以及导航。
