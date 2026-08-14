# 校园交通（Campus Transport）

面向 CUHK 学生、匿名公开读取的校巴出行信息上下文。当前范围只包括 CUHK 官方发布的校园交通服务；本文件只记录领域语言和边界，不规定实现。

## Language

### 运营网络

**校巴服务（Campus shuttle service）**：
由 CUHK 官方资料发布的校园交通服务，是本上下文当前覆盖的交通方式。范围以来源中的官方归属为准，不因某条公共巴士驶入校园便把它归为校巴。
_Avoid_：CU bus（含义不清时）、校园周边交通、把所有经过 CUHK 的车辆统称为校巴。

**站点（Stop）**：
官方运营资料中可被一条线路有序停靠的乘降点。方向、服务类型或站台不同的同名站点可以是不同 Stop；Stop 可以关联地图 Place，但两者不是同一身份。
_Avoid_：地点、建筑、仅凭同名合并上行与下行站。

**乘车地点（Boarding place）**：
面向乘客、把空间上属于同一候车位置的一个或多个 Stop 可逆分组后的浏览单位。它用于附近结果和跨线路聚合，但不取代各 Stop 的方向、站台或运营身份。
_Avoid_：永久合并站点、仅按同名合并、把地图 Place 直接当作乘车地点。

**线路（Route）**：
乘客能够识别的服务名称，例如 1A、8 或 H。Route 表达服务身份，不直接拥有唯一站序；同一 Route 可以有多个 Route pattern。
_Avoid_：把一次发车或一套站序称为线路、用页面 URL 充当永久身份。

**线路模式（Route pattern）**：
一条 Route 在特定条件下采用的有序 Stop 序列。教学日、非教学日、方向或特定发车分钟导致停站不同，都形成不同的 Route pattern。
_Avoid_：路线图、把条件停站塞进 Route 的备注、由网页 DOM 顺序猜测站序。

**车次（Trip）**：
在一个 Service day 按某个 Route pattern 运行的一次具体行程。只有起点、模式和适用日期都已确认的计划发车才能成为 Trip。
_Avoid_：路线、尚未确认起点或站序的发车候选。

**停站时刻（Stop time）**：
官方资料明确给出的某个 Trip 在某个 Stop 的计划时刻。来源没有逐站时刻时就不存在 Stop time，不能以固定偏移补造。
_Avoid_：预计到站、实时到站、把未知值写成零或默认两分钟。

### 服务日与变化

**今日服务（Today's service）**：
按香港时区当前自然日，把服务规则、官方日历、公众假期和已确认临时变更编译后的线路、车次与提示。末班后仍属于当天，不把明日班次伪装成“今天”。
_Avoid_：滚动 24 小时、把全年规则直接交给用户判断、把当前网页投射到其他日期。

**服务日（Service day）**：
以香港时区日期为身份的一天，以及该日从来源证据编译出的运行条件。Service day 不是一个可脱离来源版本永久保存的 `isTeachingDay` 布尔值。
_Avoid_：自然日历日（未包含运营规则时）、用一个布尔值代表教学期、阅读周、大学假期和公众假期。

**计划发车（Scheduled departure）**：
官方时刻资料声明的起点发车时间。若起点或 Route pattern 尚未确认，它只能作为待复核候选，不能升级为 Trip。
_Avoid_：实时到站、预计到站、把路线级分钟规则直接称为完整车次。

**临时服务变更（Temporary service change）**：
官方发布、在明确时间内覆盖常规服务的停运、改道、迁站或特别班次。开放式“直至工程完成”必须持续复核，不能因没有结束时间而永久生效。
_Avoid_：公告文章、把过期海报长期套用、只按发布日期决定有效期。

**服务提示（Service alert）**：
面向乘客、已确认适用范围和有效期的运营信息。图片 OCR 结果只是复核草稿，不是 Service alert。
_Avoid_：新闻文章、OCR 文本、未经确认的路线状态猜测。

**运行状态观测（Service status observation）**：
在某次抓取时观察到的 Normal、Delay、Suspension 或 Non-service-hours 状态。没有独立更新时间和有效期时，它只能说明抓取当刻，不能重放成历史事件。
_Avoid_：服务提示、永久线路状态、实时车辆位置。

### 预测与证据

**到站预测（Arrival projection）**：
根据计划发车与一版预测模型推算的中途到站时间。用户可以只看到“预计 6:02”这样的点时间，但系统仍须保留其计算时间、证据量和内部误差；它不能覆盖所依据的官方计划，也不是实时数据。
_Avoid_：实时到站、官方时刻、无依据的固定偏移、把预测写回 Stop time。

**冷启动偏移（Cold-start offset）**：
在尚无足够 Arrival events 时，由公开数据和可重放 fallback 算法得到的“起点计划发车至某 Stop”的初始累计时间。它必须保留来源与置信度，只用于产生 Arrival projection，并会随着反馈模型成熟而降低影响。
_Avoid_：官方逐站时刻、真实运行时间、永久固定的每站两分钟。

**到站反馈（Arrival feedback）**：
乘客从某线路某站点的预测卡片确认或修正“哪条 Route 在何时到达哪个 Stop”的一次提交。当前时间和 GPS 附近站点只用于预填，提交结果是 Arrival observation。
_Avoid_：修改时刻表、填写抽象延迟分钟、连续位置上传。

**到站观测（Arrival observation）**：
对“某条 Route 在某时到达某个 Stop”的一次带来源测量或陈述；Arrival feedback、受控人工标记和轨迹推断都可以产生观测，但来源强度不同。它不会直接改变计划或预测，也不等于一次独立物理到站。
_Avoid_：用户预测、官方时刻、把每个 GPS 点或重复点击当作一次到站。

**到站事件（Arrival event）**：
某条 Route pattern 在某个 Stop 的一次物理到站，由一个或多个 Arrival observations 重建；只有唯一匹配成功时才归属具体 Trip。多个乘客同时提交或轨迹与人工标记同时观察到同一辆车，仍然只对应一个 Arrival event。
_Avoid_：原始提交、按钮点击数、未经匹配的 GPS 点。

**预测模型版本（Prediction model revision）**：
从一组已验证 Arrival events 形成、用于产生 Arrival projection 的可重放统计版本。新观测只有经过事件重建和算法形成新版本后才影响预测；它永不改写官方计划。
_Avoid_：实时反馈值、官方时刻表、让单条观测直接成为新 ETA。

**车辆观测（Vehicle observation）**：
外部数据源在明确观测时间提供的车辆位置或状态。没有获授权的车辆数据源时，本上下文不存在 Vehicle observation。
_Avoid_：到站预测、路线页状态、从用户位置反推车辆位置。

**来源内容（Source content）**：
官方网页、PDF、JSON 或公告图片的不可变 bytes，以完整内容 hash 唯一定位。相同 bytes 可以被多次抓取或用不同解析器处理，但仍是同一个内容版本。
_Avoid_：只有 URL 的来源记录、把抓取时间或 parser version 塞进内容身份。

**抓取观测（Fetch observation）**：
在明确时刻从一个来源地址取得某个 Source content 的记录。即使 bytes 没变，每次抓取也是新的观测；HTTP 修改时间只能作为传输元数据。
_Avoid_：把 HTTP 修改时间当业务生效时间、因内容相同而抹掉后续抓取事实。

**抽取运行（Extraction run）**：
一个有版本的 parser 或人工流程对 Source content 的一次处理。重新解析同一内容会产生新的运行，但不会伪造新的内容或抓取。
_Avoid_：把 parser version 当内容身份、覆盖旧抽取结果。

**证据定位（Evidence locator）**：
从 Source content 指向某项领域事实原始位置及 Extraction run 的可审计引用。自动抽取、OCR 草稿和人工确认必须保留不同复核状态。
_Avoid_：无 hash 的字段来源、把整个页面链接当作精确字段证据。

### 乘车资格

**乘车资格（Rider eligibility）**：
官方资料为一项服务声明的乘客范围，例如学生及职员、职员专用或公开收费。它随 Route / Trip 进入今日结果；当前不推导访客限制。
_Avoid_：用户身份、登录权限、因主要用户是学生而隐藏职员专车。

## Read access（读边界）

校巴信息以 CUHK 学生的出行决策为主要用途，匿名公开读取，不要求 User 登录。

当前不建模访客乘车限制。职员专车可以显示名称、资格标签和官方登录入口，但不得抓取或猜测受保护的路线与班次。

## Relationship to other contexts

校园交通拥有 Stop、Route、Route pattern、Service day、Trip、Stop time、Service alert、Vehicle observation、乘车资格及其来源内容、抓取观测和抽取运行。

校园地图拥有 Place 及其坐标和物理连通事实。校园交通可以拥有官方交通源明确提供的 Stop 上车点坐标，并通过独立、可复核的 Stop–Place 关联引用稳定 Place ID；Stop 坐标不能覆盖 Place 坐标，也不能因接近便自动建立关联。校园交通不能创建、重用或反向修改 Place，校园地图也不能从同名站点推导线路、站序或班次。
