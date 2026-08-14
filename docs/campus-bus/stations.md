# 校巴站台四字代码表

## 用途

本表为校巴站台提供一套**简短稳定的四字代码**：以官方运营站台编号（`cuhk-wp-stop-*`，即物理站台）为单位，一站一码、跨路线一致，已人工审核定稿。

为什么要这份代码：站台 UI 目前用路线内序号（`stop.sequence`）标识站台，同一站台在不同路线上序号不同，序号不是站台的稳定身份。四字代码与站台编号一一对应，可替代序号用于站台列表、地图 marker 等展示（相关实现见 issue #625），也便于将来 CLI／API 等场景用简短代号引用站台。

## 数据来源

`docs/campus-transport/data/cold-start/route-*.staging.json` —— App 权威站台目录，站台编号为官方运营编号（`cuhk-wp-stop-*`）。共 **30** 个站台、**12** 条路线（1A、1B、2、3、4、5、6A、6B、7、8、H、N）。

> 说明：方向变体（上行／下行／火車站方向等）在 App 数据中合并为同一物理站台（同一 stopId），故表中一站一条。如需方向粒度的明细，参见 `docs/campus-transport/data/third-party/cu-bus-app/export/stops-overview.json`（35 条）。

## 命名规则

- 代码为 4 位大写（字母为主，个别站保留数字）。
- 一般取英文站名各词首字母拼接：词数 >4 截取前 4 词；词数 <4 时用常用缩写或显著字母补足（如 Admin → `ADMN`、Piazza → `PIAZ`、New Asia College → `NACX`）。
- 上行／下行成对站：站名前缀 + 方向尾缀。`U`／`D`（如 `WYSU`／`WYSD`、`CCEU`／`CCED`），部分站用 `UP`／`DN`（如 `UCUP`／`UCDN`）。
- 含数字站名保留数字：`A39U`／`A39D`（39 區）、`RS10`（十苑）、`RS15`（十五苑）、`PGH1`（研究生宿舍一座）。
- 下表代码已经过人工审核定稿。

## 站台清单

| 四字代码 | 站台编号            | 中文站名           | 英文站名                       | 途经路线                            |
| -------- | ------------------- | ------------------ | ------------------------------ | ----------------------------------- |
| **SRRS** | `cuhk-wp-stop-2544` | 邵逸夫堂           | Sir Run Run Shaw Hall          | 1A, 1B, 2, 5, H, N                  |
| **UGYM** | `cuhk-wp-stop-2546` | 大學體育中心       | Univ. Sports Centre            | 1A, 1B, 2, 3, 5, H, N               |
| **ADMN** | `cuhk-wp-stop-2548` | 大學行政樓         | Univ. Admin. Bldg.             | 1A, 1B, 2, 3, 4, 6A, 6B, 7, 8, H, N |
| **SHHO** | `cuhk-wp-stop-2550` | 善衡書院           | S.H. Ho College                | 1A, 1B, 2, 3, 4, 6A, 6B, 7, H, N    |
| **UMTR** | `cuhk-wp-stop-2552` | 大學站             | Univ. Station                  | 1A, 1B, 2, 4, 8, H, N               |
| **CCTB** | `cuhk-wp-stop-2810` | 崇基教學樓         | Chung Chi Teaching Bldg.       | 5, 6A, 6B, 7, 8                     |
| **PIAZ** | `cuhk-wp-stop-2812` | 大學站廣場         | Station Piazza                 | 2, 3, 6A, 6B, 7, 8                  |
| **FKHB** | `cuhk-wp-stop-2814` | 馮景禧樓           | Fung King Hey Bldg.            | 2, 3, 5                             |
| **UCUP** | `cuhk-wp-stop-2816` | 聯合書院（上行）   | United College (Upward)        | 2, 5                                |
| **UCDN** | `cuhk-wp-stop-2818` | 聯合書院（下行）   | United College (Downward)      | 2, 4, 6A, 6B, 7, 8, H, N            |
| **NACX** | `cuhk-wp-stop-2820` | 新亞書院           | New Asia College               | 2, 4, 5, 6A, 6B, 7, H, N            |
| **WYSD** | `cuhk-wp-stop-2826` | 伍宜孫書院（下行） | Wu Yee Sun College (Downward)  | 3, 4, 6A, 7, 8, H, N                |
| **CCHH** | `cuhk-wp-stop-2828` | 陳震夏宿舍         | Chan Chun Ha Hostel            | 3, 4, 6A, 8, H, N                   |
| **UCSR** | `cuhk-wp-stop-2830` | 聯合苑             | U.C. Staff Residence           | 3, 4, 6A, 8, H, N                   |
| **CWCD** | `cuhk-wp-stop-2832` | 敬文書院（下行）   | CW Chu College (Downward)      | 3, 4, 5, 6A, 8, H, N                |
| **YIAP** | `cuhk-wp-stop-2913` | 康本園             | Y.I.A.P.                       | 3, 4                                |
| **SCIC** | `cuhk-wp-stop-2916` | 科學館             | Science Centre                 | 3, 8                                |
| **WYSU** | `cuhk-wp-stop-2918` | 伍宜孫書院（上行） | Wu Yee Sun College (Upward)    | 3, 5, 8, H, N                       |
| **SHCU** | `cuhk-wp-stop-2920` | 逸夫書院（上行）   | Shaw College (Upward)          | 3, 5, 8, H, N                       |
| **RS15** | `cuhk-wp-stop-2924` | 十五苑             | Residence No. 15               | 3, 4, H, N                          |
| **SHCD** | `cuhk-wp-stop-2926` | 逸夫書院（下行）   | Shaw College (Downward)        | 3, 4, 7, 8, H, N                    |
| **CCEU** | `cuhk-wp-stop-2932` | 環迴東站（上行）   | Campus Circuit East (Upward)   | 4                                   |
| **CWCU** | `cuhk-wp-stop-2936` | 敬文書院（上行）   | CW Chu College (Upward)        | 4                                   |
| **A39U** | `cuhk-wp-stop-2939` | 39區（上行）       | Area 39 (Upward)               | 4, 8, H, N                          |
| **A39D** | `cuhk-wp-stop-2941` | 39區（下行）       | Area 39 (Downward)             | 8                                   |
| **NACR** | `cuhk-wp-stop-2943` | 新亞坊             | New Asia Circle                | 8, H, N                             |
| **CCED** | `cuhk-wp-stop-2947` | 環迴東站（下行）   | Campus Circuit East (Downward) | 8                                   |
| **CCNX** | `cuhk-wp-stop-2949` | 環迴北站           | Campus Circuit North           | 8                                   |
| **RS10** | `cuhk-wp-stop-2967` | 十苑               | Residence No. 10               | H                                   |
| **PGH1** | `cuhk-wp-stop-3172` | 研究生宿舍一座     | Postgraduate Hall 1            | 1B, H, N                            |

共 30 站。
