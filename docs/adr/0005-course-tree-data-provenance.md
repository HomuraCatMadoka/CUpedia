# 课程技能树的数据来源

数据分两侧：

- **课程细节**（课号、标题、学分、简介、开课学期 `terms`、`requirements`）—— 具体来源**不锁定**，由数据源 issue #157 选定并作为 ground of truth（候选含第三方开放数据集与自爬官方目录；须 license/授权清晰且覆盖当前学期）。最初设想的 `cutopia-labs/cuhk-course-data` 因 **无 LICENSE 且陈旧（最后更新 2025-08）** 被降为"待确认授权"候选。
- **主修要求骨架**（类目 + 每类应修学分 + 成员课号）—— 爬 AQS 本科生 handbook 的叶子页 `view_document.aspx?id=NNNN&seq=1`。

## Considered Options（课程细节侧，留给 #157 定夺）

- **第三方开放数据集**：最快，但需逐个确认 license 与新鲜度。
- **自爬官方目录**：授权/新鲜度自主，但有 CAPTCHA 门控，需 OCR（如 ddddocr）、~259 科目数小时。
- **手工策展**：准但覆盖窄。

## Consequences

- 课程细节来源以 #157 为准，本 ADR 不绑定任何第三方项目。
- handbook 导航是 JS 渲染、无静态索引，叶子 id 需枚举（区间遍历后分类）；要求按入学年份分版本。
- `requirements` 是**混装自由文本**（先修 / 排斥 / 豁免备注），消费前须分句归类，先修句再解析成课号布尔逻辑。
- 主修骨架（handbook 年份）与课程细节（当前学期）可能**版本错位**——缺失/改名课号的处理在 #157 定义。
- 节点以**课号**为稳定锚点，便于将来"课程测评系统"挂接。

## 决议（#157）：自爬官方目录，第三方数据仅作校验参照

课程细节侧**自爬官方 AQS 公开本科课程目录**（`rgsntl.rgs.cuhk.edu.hk/aqs_prd_applx/Public/tt_dsp_crse_catalog.aspx`）。第三方数据集仅在开发期作**对照 oracle**，不再分发、不引入其代码。本节是 #161/#162 的执行依据。

### 候选裁定

| 源                              | License      | 新鲜度（最后更新） | 裁定                                                        |
| ------------------------------- | ------------ | ------------------ | ----------------------------------------------------------- |
| `cutopia-labs/cuhk-course-data` | 无 LICENSE   | 2025-08（陈旧）    | 弃：无授权 + 未覆盖当前学期                                 |
| `mikezzb/cuhk-course-scraper`   | 无 LICENSE   | 2024-04（陈旧）    | 弃：无授权 + 陈旧                                           |
| 第三方开放课程数据集            | AGPL-3.0     | 活跃、覆盖当前学期 | 仅作校验参照：AGPL 网络 copyleft 会传染全站，**不取其代码** |
| **自爬官方目录**                | 官方事实数据 | 自主、当前学期     | **采纳**                                                    |

### 合法性

官方目录的课号 / 标题 / 学分 / 简介 / 先修属**事实信息**（非独创表达），我方抓取并标注出处（CUHK Registration & Examinations Section / AQS）。不分发任何 AGPL 数据、不引入任何 AGPL 代码；第三方数据集的 `data/<SUBJECT>.json` 仅作本地 diff 校验参照，不入库、不发布。

### 抓取配方（#161 课程摄取 / #162 骨架抓取执行）

- **规模**：~259 科目；**详情页是课程身份的权威来源**——列表页可能带 `(1370)` 占位括号与 `** available as of …` 备注，详情页干净。
- **页面流**：科目列表页 → 课程详情页（取 `code/title/units/description/requirements/grading`）。技能树**只需详情页**，无需 outcome / section / enrollment 页（那是排课表场景）。
- **门控**：详情访问受 4 字符图形验证码（`BuildCaptcha.aspx?…&len=4`）门控，用 ddddocr 识别，clean-room 自写。
- **字段映射**：`code/title/units/description` 直取；`requirements` = 详情页混装自由文本（先修 / 排斥 / 备注，解析归 PRD #156 模块 #1）；`terms` = 开课季节。落库目标表 `courses`（PRD #156 schema），实际摄取在 #161。
- **校验参照**：抓取结果与第三方数据集的 `<SUBJECT>.json` diff——科目课号集合对齐、关键字段非空，发现缺漏即复查。

### 新鲜度

官方目录即当前学期 ground truth；以第三方活跃数据交叉确认覆盖当前学期。

### 版本对齐（原评审 #5）：缺失 / 改名课号

handbook 主修骨架（某入学年份）的类目成员课号，可能在当前课程表中**缺失或改名**（实例 `DSME→DOTE`）。处理（与 ADR 0006 探索器定位、PRD 故事 19/31 一致，**绝不静默隐藏**）：

1. **别名映射优先**：维护人工别名映射（旧课号 → 新课号；落表形式在 #161/#162 期敲定，含 `DSME→DOTE`），抓取 / 解析时先重映射。
2. **未命中则占位 + 黄色告警**：别名映射解析不到的成员课号，渲染为**占位节点 + 黄色告警**（"课号 XXXX 在当前课程表中缺失，可能已改名 / 停开"），不阻断探索。
3. **绝不静默隐藏**：探索器宁可显式提示脏数据，也不让类目悄悄少一门。

### 实现落点（#157 + #161 + #162 一并交付）

三片（定源 / 爬课程 / 爬骨架）本是同一条数据竖切，合并为一个 PR 落地：

- **抓取（隔离）**：`tools/scraper/`——独立 venv、不入 pnpm/CI/runtime。`scrape_courses.py`（科目枚举 + ddddocr 过验证码 + 详情页）→ `scripts/data/courses.json`；`scrape_handbook.py`（两步取叶：`document.aspx` 置 cookie → `view_document.aspx?…&seq=1`，已实测）→ `scripts/data/handbook/*.html`。harvest 产物 gitignore，不提交。
- **纯解析**：`src/lib/normalizeCourse.ts`（本科过滤 / units 转数 / 课号归一 / 列表页噪声剥离）、`src/lib/parseHandbookLeaf.ts`（Word 导出叶子页 → 类目 required/one-of/basket + 应修学分 + 选 N + 成员课号，含裸课号简写展开）。均按真实 fixture 单测。
- **摄取（幂等）**：`pnpm ingest:courses`（→ `courses`，按 code upsert）、`pnpm ingest:skeleton`（→ `majors`/`majorCategories`/`categoryCourses`，成员先过 `courseAliases` 重映射，缺失标 `missing=true`）。
- **校验**：`pnpm oracle:check`（dev-only，比对第三方数据集课号集合，不入库）。
- **范围边界**：先修布尔解析（#164）、等价组（#165）、build 求值（#166/#167）不在本切；`courses.prerequisite/exclusions` 仅留占位列。
