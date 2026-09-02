# CUHK 2026-09 校巴正式服务更新：第一方证据核对

> 核对时间：2026-09-02（香港时间）。范围仅为 issue #854 所需的常规服务版本；不包含临时停运、改道、迁站等 #618 范围，也不扩展到 #855。

## 结论

CUHK Transport Office 的正式通告明确写明本次安排 **Effective from September 1, 2026**。这才是 `2026-09-01` 业务生效日的直接证据；WordPress 的 `date` / `modified`、HTTP `Last-Modified` 和抓取时间都不是业务生效日。[正式通告网页](https://transport.cuhk.edu.hk/newsdetails/latest-arrangements-for-school-bus-service/)只把正文作为图片发布；[英文通告原图](https://transport.cuhk.edu.hk/wp-content/uploads/news/Service_Information/TSP_ISI_2026_17_%E6%A0%A1%E5%B7%B4%E6%9C%8D%E5%8B%99%E6%9C%80%E6%96%B0%E5%AE%89%E6%8E%92_Eng-scaled.jpg)在标题下直接写出该生效日。

这次更新也证明来源技术身份不能充当 Route 身份：[route REST 集合](https://transport.cuhk.edu.hk/wp-json/wp/v2/route?per_page=100)仍用 post `2554`、slug `1a`、URL `/route/1a/` 发布当前 Route 1，并用 post `2567`、slug `1b`、URL `/route/1b/` 发布全新的 Route 2S。通告同时把 1A→1 定义为 **Renaming**、把 1B 定义为 **Service Cancelled**、把 2S 定义为 **New Route**。因此：

- Route 1 可以继承 1A 的服务 lineage，但历史 Route code 仍应显示 1A；
- Route 1B 在 2026-09-01 退役；
- Route 2S 是独立 Route，不能因为 CUHK 复用了 `1b` post/slug/URL 就继承 1B 的 Route 身份、旧链接、反馈或 Arrival observations；
- WordPress post ID、slug、来源 URL、页面当前显示编号，以及 CUpedia 内部稳定 Route ID 必须分别保存。

## 取得的内容版本

以下 SHA-256 均针对本次 HTTP 内容解码后的响应 body。抓取使用新的无条件 GET，没有用仓库缓存。HTTP `Date` 为 2026-09-02 04:26:22–04:28:17 UTC（香港时间 12:26:22–12:28:17）。原始 bytes 和 headers 只保存在系统临时目录，核对完成后删除。

| 第一方来源                                                                                                                                                                                    |   bytes | SHA-256                                                            |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------: | ------------------------------------------------------------------ |
| [route REST 集合](https://transport.cuhk.edu.hk/wp-json/wp/v2/route?per_page=100)                                                                                                             |  20,204 | `22ca7f9c491f362c84dd32b76fa7aabd5b83a77a6d32487a4ad1c7d11d09cddb` |
| [newsdetails REST 集合](https://transport.cuhk.edu.hk/wp-json/wp/v2/newsdetails?per_page=100)                                                                                                 | 144,611 | `1dab64be80d04b3d065a39bdba251f9dd77f8c4d15fc0beb0792e09a882e771f` |
| [通告 REST post 8321](https://transport.cuhk.edu.hk/wp-json/wp/v2/newsdetails/8321)                                                                                                           |   1,397 | `cb66f16af0f81373d289f4cc36f621114957a28dc3d8372287454289569f6392` |
| [通告网页](https://transport.cuhk.edu.hk/newsdetails/latest-arrangements-for-school-bus-service/)                                                                                             |  40,220 | `4a533cb13435e02630e6615321fba8795ef3e3d359be642f9aa9c83bcc9c2f15` |
| [通告原图](https://transport.cuhk.edu.hk/wp-content/uploads/news/Service_Information/TSP_ISI_2026_17_%E6%A0%A1%E5%B7%B4%E6%9C%8D%E5%8B%99%E6%9C%80%E6%96%B0%E5%AE%89%E6%8E%92_Eng-scaled.jpg) | 431,478 | `9b753783870978a6dcbd837dafd36724c178b4b4c54bd43f66164b665062a949` |
| [Shuttle.pdf](https://transport.cuhk.edu.hk/wp-content/uploads/documents/Shuttle.pdf)                                                                                                         | 276,158 | `4807f0939ab150e37fd3b715737f132bc0c970809b68635e418fa2cbecf51d91` |
| [Meet-Class.pdf](https://transport.cuhk.edu.hk/wp-content/uploads/documents/Meet-Class.pdf)                                                                                                   | 257,248 | `f7affad6cccd9c39584cc96e8848310163f2c968ee44e1d9b19a8969a66e6a49` |
| [NH.pdf](https://transport.cuhk.edu.hk/wp-content/uploads/documents/NH.pdf)                                                                                                                   | 265,349 | `54fa9186d0c3bbb903aceb069e2a846ed1b6fa2d1408107f4c32901d3d4d4c3d` |
| [当前 `/route/1a/` 页面](https://transport.cuhk.edu.hk/route/1a/)                                                                                                                             |  50,126 | `16bef5ab491b006e92e70e6529b6169532a75f8bd90cf6c03f3c67aae025454f` |
| [当前 `/route/1b/` 页面](https://transport.cuhk.edu.hk/route/1b/)                                                                                                                             |  52,105 | `91aa4223a88b87c149ab7a8471b05bc0c63b85de32d022590da206183c7cf668` |
| [Route 2 页面](https://transport.cuhk.edu.hk/route/2/)                                                                                                                                        |  51,601 | `eb96627132762986717956be1fcc6a090b170bca92d0d4fd415fdf5785b61d85` |
| [Route 7 页面](https://transport.cuhk.edu.hk/route/7/)                                                                                                                                        |  49,184 | `6bc1608c406cc08cda3a529652ae8d3f703f267346118e1523f6dca090aef2e7` |
| [Route 8 页面](https://transport.cuhk.edu.hk/route/8/)                                                                                                                                        |  55,762 | `4f0628921f5db30f4187cbf0e25887dfc82aa689901a3ae534da2216fa6ba396` |
| [Route H 页面](https://transport.cuhk.edu.hk/route/h/)                                                                                                                                        |  55,187 | `24bd3b58fdbfa369e60816f6fd74c74f9ba7b090d69eaa6a93c5e22c692d1f28` |

PDF 传输元数据也已记录：`Shuttle.pdf` 的 HTTP `Last-Modified` 是 2026-08-21 00:46:02 UTC、ETag 是 `"436be-65983f5f199ae"`；`Meet-Class.pdf` 是 2026-08-21 00:45:53 UTC、`"3ece0-65983f569899c"`；`NH.pdf` 是 2026-08-21 00:45:58 UTC、`"40c85-65983f5b30239"`。这些值只用于发现 bytes 是否可能改变，不能决定服务版本的生效日。三份 PDF 的内部 Title 分别是 `Shuttle (wef 1 Sep 2026)`、`Meet-Class (wef 1 Sep 2026)` 与 `NH (wef 1 Sep 2026)`，与通告的明确生效日一致。

## 来源技术身份与乘客 Route code

| REST post | slug / 固定来源 URL                                            | 当前 REST title / 页面标题 | 当前乘客 Route code | REST body SHA-256                                                  | 身份判断                                                         |
| --------: | -------------------------------------------------------------- | -------------------------- | ------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------- |
|    `2554` | `1a` / [`/route/1a/`](https://transport.cuhk.edu.hk/route/1a/) | `1 Main Campus`            | `1`                 | `202e5bbdcbe8d813e5e5de5a621d79a6a724bcd9e30da159830dbc74366c06c1` | 复用的来源记录；通告证明是 1A→1 rename，不是把历史 code 改写成 1 |
|    `2567` | `1b` / [`/route/1b/`](https://transport.cuhk.edu.hk/route/1b/) | `2S NA/UC (S)`             | `2S`                | `6b9f751d794e463bc0170f7a269d77e6fd95ac9851fc3ae2fd66a538e00d3fbc` | 复用的来源记录；通告证明 1B 已取消、2S 是 new route              |
|    `2865` | `2` / [`/route/2/`](https://transport.cuhk.edu.hk/route/2/)    | `2 NA / UC`                | `2`                 | `a60c9413072e386c372fc9987988ad05aaf3b83156f5d77afaee31657b83745b` | 来源身份与显示 code 当前相同，仍不可把 slug 当内部 ID            |
|    `2893` | `7` / [`/route/7/`](https://transport.cuhk.edu.hk/route/7/)    | `7 Downward (Shaw)`        | `7`                 | `13a082f6021d8a8f3db75db87fe7f0fd0d6278f43f44df0f3eb4e62e76bf30b1` | 同上                                                             |
|    `2880` | `8` / [`/route/8/`](https://transport.cuhk.edu.hk/route/8/)    | `8 Western Campus`         | `8`                 | `9f71b91fab44dd5dc490d263f1de9894cd0dae0d897731e52b447d04da056f3e` | 同上                                                             |
|    `2885` | `h` / [`/route/h/`](https://transport.cuhk.edu.hk/route/h/)    | `H Holidays Service`       | `H`                 | `7593ed4bd05ff4f2bb774d8d4059e044cdf79f50653b8f82503de401018fd1cc` | 同上                                                             |

[当前 route REST 集合](https://transport.cuhk.edu.hk/wp-json/wp/v2/route?per_page=100)共有 14 个来源记录：常规/转堂/夜间/假日 Route 当前显示为 `1, 2, 2S, 3, 4, 5, 6A, 6B, 7, 8, N, H`，另外两项 `Up, Down` 属于收费穿梭小巴。集合里没有 slug `1` 或 `2s`；当前显示编号的变化发生在旧 `1a` / `1b` 记录中。

## 2026-09-01 起的正式服务事实

以下变更均由[英文正式通告原图](https://transport.cuhk.edu.hk/wp-content/uploads/news/Service_Information/TSP_ISI_2026_17_%E6%A0%A1%E5%B7%B4%E6%9C%8D%E5%8B%99%E6%9C%80%E6%96%B0%E5%AE%89%E6%8E%92_Eng-scaled.jpg)直接声明，并与当前路线页及 PDF 交叉核对。

### Route 1、1B 与 2S

- `1A` renamed as `1`，服务时间 `07:40–18:55`，每小时 `10, 25, 40, 55` 分开出。[当前 Route 1 页面仍位于 `/route/1a/`](https://transport.cuhk.edu.hk/route/1a/)，显示相同时间与分钟；[Shuttle.pdf](https://transport.cuhk.edu.hk/wp-content/uploads/documents/Shuttle.pdf)也一致。
- `1B` 的声明是 `Route Cancellation — Service Cancelled`，不是改名为 2S。
- `2S` 的声明是 `New Route`，服务时间 `08:00–18:30`，每小时 `00, 30` 分开出。通告给出的完整有序站序是：`Station Piazza → Postgraduate Hall 1 → Univ. Sports Centre → Sir Run Run Shaw Hall → Fung King Hey Bldg. → United College (Upward) → New Asia College → United College (Downward) → Univ. Admin. Bldg. → S.H. Ho College → Postgraduate Hall 1 → Univ. Station`。
- [当前 `/route/1b/` 页面](https://transport.cuhk.edu.hk/route/1b/)显示 2S 的时段、分钟和站名，但 `.route-stop-text` 的 DOM 出现顺序从 `United College (Upward)` 开始，并不等于通告写明的完整行车站序。这是视觉页面站序只能进入人工复核、不能由 DOM 自动发布的具体例子。

官方资料没有给 2S 的逐站到达时刻或 ETA offset。任何 cold-start offset 都只能是 CUpedia 的、有来源且明确标为预计/低置信度的 Arrival projection 先验，不能写成官方 Stop time。

### Route 2

通告明确说每小时 `00`、`30` 分班次取消，原有 `15`、`45` 分班次保持。当前 [Route 2 页面](https://transport.cuhk.edu.hk/route/2/)与 [Shuttle.pdf](https://transport.cuhk.edu.hk/wp-content/uploads/documents/Shuttle.pdf)都只显示 `15, 45`；同时声明 `31–00` 分发车会停 Sir Run Run Shaw Hall，因此 `45` 分 Trip 继续使用包含该站的 Route pattern。

### Route 7

通告、[当前 Route 7 页面](https://transport.cuhk.edu.hk/route/7/)及 [Meet-Class.pdf](https://transport.cuhk.edu.hk/wp-content/uploads/documents/Meet-Class.pdf)一致显示每小时 `00, 18` 分开出：星期一至五 `08:18–17:18`，星期六 `08:18–13:18`，且只在教学日服务。通告只把这项标为 frequency adjustment，没有声明 Route change；当前页面继续列出 `United College (Downward) → New Asia College → Wu Yee Sun College (Downward) → Univ. Admin. Bldg. → S.H. Ho College → Station Piazza`。

### Route 8

通告把这项标为 Route change：从 `Y.I.A.P.` 起点出发，先停 `Campus Circuit East (Upward)` 与 `CW Chu College (Upward)`，再接回原路线；服务时间 `07:35–18:35`，每小时 `15, 35, 55` 分开出。[当前 Route 8 页面](https://transport.cuhk.edu.hk/route/8/)和 [Shuttle.pdf](https://transport.cuhk.edu.hk/wp-content/uploads/documents/Shuttle.pdf)显示相同时间、分钟和新增前段。

当前路线页和 PDF 仍明确区分 Route pattern：非教学日停 `Station Piazza`、`Chung Chi Teaching Bldg.`，并且不停 `Univ. Station`；教学日则停 `Univ. Station`。官方资料没有逐站时刻，所以新增前段的 cold-start offset 同样只能作为明确标为预计/低置信度的 CUpedia 推算。

### Route H

通告明确声明 Route H `no longer stop at Residence No. 10`。[当前 Route H 页面](https://transport.cuhk.edu.hk/route/h/)和 [NH.pdf](https://transport.cuhk.edu.hk/wp-content/uploads/documents/NH.pdf)的现行站序都不再出现 Residence No. 10，但仍保留 `00` 分班次加停 `Postgraduate Hall 1` 与 `Area 39 (Upward)` 的条件规则。取消一个 Stop 不能被解释为删掉前后两站之间整段道路的行车时间先验。

## Cold-start 推导与地图边界

官方资料只支持 Route 2S、Route 8 的站序和班次，不支持逐站到达秒数。运行时使用的预计时间因此由 [`official-2026-09-derived-priors.json`](../data/cold-start/official-2026-09-derived-priors.json) 登记推导方法，而不是直接写入一串无法复算的累计秒数：

- Route 2S 把旧 Route 1B 与 Route 2 中相邻站的 `p50` 差值逐段拼接，再从 0 累加；每段都登记来源 Route、pattern 和起止 stop occurrence。
- Route 8 的新增前段复用旧 Route 4 从 `Y.I.A.P.` 到 `Area 39 (Upward)` 的累计先验；原 Route 8 的每个累计值统一加上该连接点的 `247` 秒。
- 两条 Route 的所有推导 projection 都保持 `staging_only`、`weak_prior`，不声称有官方逐站时间或实测样本。
- 地图先把相关旧 OSM relation 作为候选路网，再按正式站序逐站寻路并输出新 geometry；乘客地图不会绘出未被新 Route 使用的整条旧线路。

## 对来源漂移检查的事实边界

这批第一方来源显示，后续检查至少要分别比较：

1. REST post ID、slug、link 与 title/displayed Route code；
2. 路线页的服务时间、每小时分钟、备注和页面显示编号；
3. 官网维护的 PDF 链接标签、标签当前指向的 URL、完整 bytes hash、内部 Title、可见时刻表和路线图；
4. newsdetails 索引中相关正式通告，以及通告附件自己的 bytes hash；
5. 当前提取结果与已批准 Route / Route pattern 的结构差异。

出现以下情况必须产出待人工复核 diff，不能自动改写乘客结果：来源记录改 title 但沿用旧 post/slug/URL；网页 DOM 与通告/PDF 的视觉站序不一致；官网 PDF 链接换 URL 或文件 hash 改变；路线页、通告与 PDF 对显示编号、站序或班次相互冲突。HTTP `modified` / `Last-Modified` 只能触发检查，不能创建业务生效区间；公告图片 OCR 也只能是复核草稿。
