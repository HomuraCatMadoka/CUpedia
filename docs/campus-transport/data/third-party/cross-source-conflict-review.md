# 校巴多源行程数据冲突审查

生成日：2026-08-11。基线：**官方** `cuhk-public-data/merged.snapshot.json`。

对比源：

- 官方 traffic office HTML/PDF merge（14 线，含 PSLB Up/Down）
- CU Bus App v1.18 `cubus.db`（19 变体 / 35 站）
- AnsonCheng03/CUBus `Route.json`（16，约 2024-10）
- Flippy CU_v1.1（22 线含 Info Day，无班次字段）

## 总览

| 维度                          |   冲突数 | 说明                      |
| ----------------------------- | -------: | ------------------------- |
| 起点班次 window/mins          |        2 | 第三方 vs 官方 band       |
| 站序（LCS/顺序/集合）         |       16 | 启发式站名归一后          |
| 坐标 ≥40m                     |        6 | App / Anson / Flippy 互比 |
| 邻站耗时 ≥30s（App vs Anson） | 9 条路线 | 两边都有可匹配邻边时      |

## 覆盖矩阵

| 线   | 官方 band/pattern | App 变体         | Anson | Flippy       |
| ---- | ----------------- | ---------------- | ----- | ------------ |
| 1A   | 1/1               | 1A               | 1A    | 1A;CU        |
| 1B   | 1/1               | 1B               | 1B    | 1B;CU        |
| 2    | 1/2               | 2, 2_sir_run_run | 2, 2# | 2;CU, 2;S;CU |
| 3    | 1/1               | 3                | 3     | 3;CU         |
| 4    | 1/1               | 4                | 4     | 4;CU         |
| 5    | 2/1               | 5, 5_sat         | 5     | 5;CU, 5;S;CU |
| 6A   | 2/1               | 6A, 6A_sat       | 6A    | 6A;CU        |
| 6B   | 1/1               | 6B               | 6B    | 6B;CU        |
| 7    | 2/1               | 7, 7_sat         | 7     | 7;CU         |
| 8    | 1/2               | 8, 8_non_teach   | 8, 8# | 8;CU, 8;S;CU |
| H    | 1/2               | H, H_area_39     | H, H# | H;CU, H;S;CU |
| N    | 1/2               | N, N_postgrad    | N, N# | N;CU, N;S;CU |
| UP   | 1/1               | —                | —     | —            |
| DOWN | 2/1               | —                | —     | —            |

**只在官方**：`Up` / `Down`（Meet-class / PSLB）。**只在 Flippy**：Info Day `A/B/C/D1/D2`。

## 1. 起点班次冲突（硬）

| 线  | 源       | 问题                                                                                            | 官方对照                                                                                                                      |
| --- | -------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 1A  | anson:1A | window anson 07:30-18:40 vs off 07:40-18:50; mins subset anson [20, 40] of off [10, 20, 40, 50] | `{"start": "07:40", "end": "18:50", "mins": [10, 20, 40, 50], "rule": "07:40-18:50 For Mon to Sat (Except Public Holidays)"}` |
| 1B  | anson:1B | window anson 08:00-18:00 vs off 08:00-18:30; mins subset anson [0] of off [0, 30]               | `{"start": "08:00", "end": "18:30", "mins": [0, 30], "rule": "08:00 - 18:30 For Mon to Sat only (Except Public Holidays)"}`   |

### 解读（班次）

- **硬冲突只有 Anson 1A / 1B**（2024-10 数据过时）：
  - 1A `07:30–18:40 [20,40]` vs 官方 `07:40–18:50 [10,20,40,50]`
  - 1B 结束 `18:00` / mins `[0]` vs 官方 `18:30` / `[0,30]`
- **App 全部主干 band 与官方一致**；H/N/2 的 mins 子集 = 变体拆分（`H_area_39`/`N_postgrad`/`2_sir_run_run`），不是 band 冲突。
- **5/6A/7 教学日**：官方 2 个 band（Mon–Fri / Sat），App 拆成 `*_sat`；Anson 只保留工作日 band。
- 其余 Anson 线（2–8/H/N）window/mins **与官方一致**。

## 2. 站序冲突

| 线  | 源                    | pattern              |   LCS | 问题摘要                                                 |
| --- | --------------------- | -------------------- | ----: | -------------------------------------------------------- |
| 3   | flippy:3;CU           | 3:default            | 0.867 | only_src=['res 3 4', 'res 3 4']; only_off=['wys', 'wys'] |
| 5   | flippy:5;CU           | 5:default            | 0.778 | only_src=['res 3 4']; only_off=['wys', 'cw chu college'] |
| 5   | flippy:5;S;CU         | 5:default            | 0.889 | only_src=['res 3 4']; only_off=['wys']                   |
| 7   | flippy:7;CU           | 7:default            | 0.875 | only_src=['res 3 4']; only_off=['wys']                   |
| 8   | flippy:8;CU           | 8:teaching-day       | 0.875 | only_src=['res 3 4', 'res 3 4']; only_off=['wys', 'wys'] |
| 8   | flippy:8;S;CU         | 8:non-teaching-day   | 0.882 | only_src=['res 3 4', 'res 3 4']; only_off=['wys', 'wys'] |
| H   | anson:H               | h:default            | 0.947 | only_off=['new asia circle']; order differs              |
| H   | anson:H#              | h:00-via-pgh1-area39 | 0.955 | only_off=['new asia circle']; order differs              |
| H   | cu-bus-app:H          | h:default            | 0.947 | only_off=['new asia circle']; order differs              |
| H   | cu-bus-app:H_area_39  | h:00-via-pgh1-area39 | 0.955 | only_off=['new asia circle']; order differs              |
| H   | flippy:H;CU           | h:default            | 0.895 | only_src=['res 3 4', 'res 3 4']; only_off=['wys', 'wys'] |
| N   | anson:N               | n:default            | 0.947 | only_off=['new asia circle']; order differs              |
| N   | anson:N#              | n:00-via-pgh1        | 0.952 | only_off=['new asia circle']; order differs              |
| N   | cu-bus-app:N          | n:default            | 0.947 | only_off=['new asia circle']; order differs              |
| N   | cu-bus-app:N_postgrad | n:00-via-pgh1        | 0.952 | only_off=['new asia circle']; order differs              |
| N   | flippy:N;CU           | n:default            | 0.895 | only_src=['res 3 4', 'res 3 4']; only_off=['wys', 'wys'] |

细节 JSON：`cross-source-conflict-review.json` → `stop_sequence.conflicts`。

### 解读（站序）

- **Flippy `res 3 4` vs 官方 `wys`**：同一带不同命名（3&4 宿舍 / 伍宜孙），不是真绕路。
- **H/N 官方有 `New Asia Circle`，App/Anson 用 `New Asia College (… Direction)`**：方向站建模差，LCS 仍 ≥0.94，顺序微差。
- App/Anson 主干线与官方 pattern 在归一后大体对齐；真正缺线是 **Up/Down（仅官方）** 与 **Info Day（仅 Flippy）**。

## 3. 坐标冲突（≥40 m）

| 归一站名                  | 最大偏差 m | 点位                                                                                                                                                                                 |
| ------------------------- | ---------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| university station        |      233.2 | app:22.41452,114.21020; app:22.41508,114.21043; anson:22.41452,114.21022; flippy:22.41356,114.20976; flippy:22.41450,114.21022; flippy:22.41546,114.21072; flippy:22.41393,114.20973 |
| university admin building |       75.0 | app:22.41881,114.20533; anson:22.41880,114.20534; flippy:22.41880,114.20534; flippy:22.41881,114.20461                                                                               |
| new asia college          |       70.6 | app:22.42134,114.20748; app:22.42109,114.20755; app:22.42155,114.20745; anson:22.42141,114.20748; flippy:22.42131,114.20749; flippy:22.42097,114.20773                               |
| cw chu college            |       60.1 | app:22.42564,114.20666; app:22.42561,114.20618; anson:22.42561,114.20618; flippy:22.42569,114.20608; flippy:22.42555,114.20625; flippy:22.42560,114.20644                            |
| sir run run shaw hall     |       47.8 | app:22.41985,114.20699; anson:22.41988,114.20691; flippy:22.41984,114.20737; flippy:22.41984,114.20694                                                                               |
| wys                       |       44.5 | app:22.42125,114.20351; app:22.42149,114.20345; anson:22.42109,114.20350                                                                                                             |

## 4. 邻站耗时 App vs Anson（≥30 s）

| 线  | App           | Anson | 偏差≥30s 边                                                                      |
| --- | ------------- | ----- | -------------------------------------------------------------------------------- |
| 2   | 2             | 2     | FKHB→UC app70/anson218.8 (Δ-148.8s); UC→UADM app242/anson92.6 (Δ149.4s)          |
| 2   | 2_sir_run_run | 2#    | FKHB→UC app70/anson218.8 (Δ-148.8s); UC→UADM app242/anson92.6 (Δ149.4s)          |
| 3   | 3             | 3     | FKHB→RESI34 app46/anson669.2 (Δ-623.2s); RESI34→UADM app724/anson102.4 (Δ621.6s) |
| 4   | 4             | 4     | CWCC→RESI15 app216/anson66.1 (Δ149.9s)                                           |
| 8   | 8             | 8     | AREA39→CCEN app1158/anson73.8 (Δ1084.2s)                                         |
| 8   | 8_non_teach   | 8#    | AREA39→CCEN app1158/anson73.8 (Δ1084.2s)                                         |
| H   | H_area_39     | H#    | UC→UADM app1026/anson103.5 (Δ922.5s)                                             |
| N   | N             | N     | UC→UADM app965/anson104.5 (Δ860.5s)                                              |
| N   | N_postgrad    | N#    | MTR→JCPH app130/anson48.0 (Δ82.0s); UC→UADM app965/anson105.7 (Δ859.3s)          |

### 解读（耗时）

- 大 Δ 多数是 **邻站匹配错位**（中间站跳过/方向站折叠）导致的假跳段，不是真实路况差 10 分钟。
- 例：8 线 `AREA39→CCEN` App 1158s ≈ 整段后半程累加，Anson 73.8s 是相邻 hop。
- 3 线 `FKHB→RESI34` Anson 669s 把中间多站压进一 hop，App 46s 是真邻边。
- **两边都不能当官方 Stop time**；只可作先验，且需 hop 对齐后再用。

## 5. 结论与采用规则

1. **计划起点发车**：只信官方 band；**App 全线对齐**；**Anson 仅 1A/1B 过时**，其余 band 可用作历史对照。
2. **站序**：App ≈ 官方 pattern；Flippy 2023 命名旧 + Info Day 独有；H/N 的 New Asia Circle 是官方特有建模。
3. **中间站到站时刻**：App/Anson 预计算，**不是**官方 Stop time；邻边秒数跨源不可静默合并。
4. **坐标**：同站多点（上下行/总站）≥40m 常见；人工选点，不可平均。
5. **PSLB Up/Down**：仅官方；**Info Day A/B/C/D1/D2**：仅 Flippy。

## 边界

- 站名归一是启发式，可能 residual alias 噪声。
- 未纳入 Bus Clock GPS 轨迹。
- 第三方研究副本无开放再分发许可。
