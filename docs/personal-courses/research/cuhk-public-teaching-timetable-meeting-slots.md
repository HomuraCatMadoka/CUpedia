# CUHK 公开 Teaching Timetable 的 Meeting Slot 来源

Status: Research snapshot
Last verified: 2026-08-27
Wayfinder ticket: [确定公开课表 Meeting Slot 的官方来源](https://github.com/HomuraCatMadoka/CUpedia/issues/772)

## 结论

CUpedia 应把 CUHK Registration and Examinations Section（RES）提供的
[Teaching Timetable Public Access](https://rgsntl.rgs.cuhk.edu.hk/rws_prd_applx2/Public/tt_dsp_timetable.aspx)
作为当前学期「开课班别 + 上课时段」的官方来源。RES 的
[Teaching Timetable 入口页](https://www.res.cuhk.edu.hk/undergraduate-students/teaching-timetable/)
明确把这个地址列为 `Public Access`，因此读取公开课表不需要 CUSIS 登录状态。

2026 年 8 月 27 日用一个没有 MyCUHK/CUSIS cookie 的新 HTTP 会话实测
`Undergraduate / 2026-27 Term 1 / CSCI`：搜索结果同时提供星期、开始/结束时间、
地点、section、class number、教师、quota 和 vacancy。它不是 JSON API，而是带
4 字符验证码和 ASP.NET `__VIEWSTATE` 的 HTML 表单；CUpedia 已有代码能完成这段
查询流程，但目前丢弃了时间和地点字段。

因此第一版不应在用户打开筛选器或排课表时临时连接 CUSIS。应扩充现有离线
`scrape_timetable.py`，定期把公开课表整理进 CUpedia。CUSIS 临时会话只负责读取
某个用户的历史课程、当前课程和 Shopping Cart；课程搜索、筛选、冲堂检查和排课
都使用 CUpedia 自己保存的公开课表快照。

## 来源身份

| 角色       | 官方来源                                                                                                                                                                                                                                                    | 用途                                                                               |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| 发现入口   | [RES Teaching Timetable](https://www.res.cuhk.edu.hk/undergraduate-students/teaching-timetable/)                                                                                                                                                            | CUHK 对外声明 `Public Access`，并链接数据页及缩写说明。                            |
| 权威数据页 | [Enquire Teaching Timetable](https://rgsntl.rgs.cuhk.edu.hk/rws_prd_applx2/Public/tt_dsp_timetable.aspx)                                                                                                                                                    | 按 academic career、term、subject 或 offering department 返回开课与 meeting 数据。 |
| 更新说明   | [Information on Teaching Timetable 2026-27](https://www.res.cuhk.edu.hk/announcement/information-on-teaching-timetable-2026-27/)                                                                                                                            | 说明本学年课表何时上传、课表与选课数据的更新阶段。                                 |
| 字段语义   | [CUSIS enrollment FAQ](https://www.cuhk.edu.hk/cusis/faqs-enrollment.html)                                                                                                                                                                                  | 官方解释 course code、class section、class number 及 quota/vacancy 的使用方式。    |
| 页面说明   | [Enquire Teaching Timetable user guide](https://www.cuhk.edu.hk/cusis/howto/enquire-timetable.pdf)                                                                                                                                                          | 展示结果列、续行 meeting、class detail 和 reserved quota 入口。                    |
| 地点字典   | [Buildings/Halls](https://www.res.cuhk.edu.hk/undergraduate-students/teaching-timetable/buildings-halls/) 与 [List of Communal Classrooms](https://www.res.cuhk.edu.hk/teaching-timetable-classroom-booking/classroom-booking/list-of-communal-classrooms/) | 把 `ELB`、`LSK` 等楼宇前缀和部分完整 room code 转成人类可读地点。                  |
| 特殊地点值 | [CUHK Graduate School Teaching Timetable](https://www.gs.cuhk.edu.hk/download/Timetable_2526T2.pdf)                                                                                                                                                         | 官方说明把 `TBA` 定义为待安排、`NRR` 定义为无需课室。                              |
| 组件字典   | [Type of Teaching](https://www.res.cuhk.edu.hk/undergraduate-students/teaching-timetable/type-of-teaching/)                                                                                                                                                 | 解释 `LEC`、`TUT`、`LAB`、`PRJ` 等 Course Component。                              |
| 语言字典   | [Language of Instruction](https://www.res.cuhk.edu.hk/undergraduate-students/teaching-timetable/language-of-instruction/)                                                                                                                                   | 解释 `E`、`C&E`、`C#E` 等语言代码。                                                |

课程目录与课表不是同一份来源。现有 ADR 0005 采用的
[AQS 公开课程目录](../../adr/0005-course-tree-data-provenance.md)
负责课号、标题、学分、简介和修读要求；Teaching Timetable 负责某个 term 实际开的
class、section、教师、容量和 meeting。两边用规范化后的 `courseCode` 连接。

## 字段覆盖和语义

公开结果表的完整表头是：

```text
Class Code | Class Nbr | Course Title | Units | Teaching Staff |
Quota(s) | Vacancy | Course Component | Section Code | Language |
Period | Room | Meeting Date | Add Consent | Drop Consent |
Course Offering Dept
```

本票要求的字段均可直接取得：

| 需要的数据               | 来源列           | 2026-27 Term 1 实例                           | 应如何理解                                                                                                               |
| ------------------------ | ---------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 星期、开始时间、结束时间 | `Period`         | `Mo 03:30PM - 04:15PM`                        | 香港本地的星期与钟点；也可能是 `TBA`。不要只存一条自由文本，应解析后同时保留原文。                                       |
| 地点                     | `Room`           | `ELB_LT3`、`LSK_LT2`                          | 官方 room code；`NRR` 表示不需要课室，`TBA` 表示待定。地点字典只能补充名称，不能替换原始代码。                           |
| section                  | `Section Code`   | `A`、`AT01`                                   | 它属于一个 Course Component；同一个 Class Nbr 可以同时有 `LEC/A` 和 `TUT/AT01`。                                         |
| class number             | `Class Nbr`      | `5742`                                        | 官方 FAQ 明确说它只标识某个 term 内的一次具体开班，并可能在另一个 term 被重新用于别的课程。它不能单独成为永久 ID。       |
| 教师                     | `Teaching Staff` | `Dr. LAW Yat Chiu`                            | 是显示文字，可有多人、`Staff` 或待定值；不是稳定人员身份。应沿用现有 canonical instructor 对照，而不是按名字创建新身份。 |
| quota                    | `Quota(s)`       | `150`                                         | 平面表显示总体数字；下划线/链接表示另有 reserved quota 分组。总体 quota 不代表所有用户都可使用全部名额。                 |
| vacancy                  | `Vacancy`        | `33`                                          | 剩余名额快照，不等于某个用户有资格选入。RPG 结果表没有此列，因此字段必须可空。                                           |
| 实际上课日期             | `Meeting Date`   | `7/9, 14/9, ...` 或 `07/09/2026 - 30/11/2026` | 虽然不在问题清单中，却是正确冲堂检查不可缺的字段；相同星期和时间可能只在部分周上课。                                     |

[官方 CUSIS FAQ](https://www.cuhk.edu.hk/cusis/faqs-enrollment.html)
还说明：`Subject + Catalog Number` 组成 course code；Class Section 是同一课程下提供不同
时间或教师选择的开班；Class Number 是该 term 内具体 class 的数字编号。CUpedia 应据此
分开「课程身份」与「本期开班身份」。

## 结果表不是“一行一个 class”

这是解析时最重要的事实。2026 年 8 月 27 日的 CSCI 样本有 70 个 Class Nbr，却有
171 个 HTML 数据行，其中 101 行没有重复 Class Nbr，而是继承上面的 class/component
信息：

```text
CSCI1120A / 5742 / LEC / A    / Mo 03:30PM - 04:15PM / ELB_LT3 / 一组日期
                               / Mo 03:30PM - 04:15PM / ELB_LT3 / 另一组日期
                               / We 01:30PM - 03:15PM / LSK_LT2 / 一组日期
                    / TUT / AT01 / Mo 02:30PM - 03:15PM / ELB_LT3 / 一组日期
                               / Mo 02:30PM - 03:15PM / ELB_LT3 / 另一组日期
```

这表示：

1. 一个 Class Nbr 可以包含多个组件，例如 lecture 和 tutorial。
2. 一个组件可以有多个 weekly period。
3. 同一个 period 可以因放假或不同教学周，被拆成多条 `Meeting Date` 续行。
4. 空白单元格是“沿用上一层值”，不是“没有值”。只有遇到新的非空上层字段才更新上下文。

所以不能把每个 `<tr>` 写成独立 course offering，也不能只取第一条 `Period`。解析器应先
还原层级，再输出 `CourseOffering -> Component -> MeetingSlot[]`。

## 推荐身份模型

以下是来源身份，不是本票要求立即落库的最终 schema：

```text
Course（共享课程目录）
  identity: normalized courseCode，例如 CSCI1120

CourseOffering（某 term 可选的一组 class）
  source identity: academicCareer + sourceTermId + classNbr
  attributes: termLabel, classCode, courseCode, title, units,
              quota, vacancy, addConsent, dropConsent, offeringDept

OfferingComponent（该 class 的一个教学组件）
  source identity: offering + componentCode + sectionCode
  attributes: languageCode, instructor display names

MeetingSlot（该组件的一段实际上课安排）
  snapshot identity: component + source row ordinal
  attributes: dayOfWeek?, startLocalTime?, endLocalTime?, roomCode?,
              meetingDates?, rawPeriod, rawRoom, rawMeetingDate
```

`sourceTermId` 是网页 option 的原始 value（本次观察中 2026-27 Term 1 为 `2420`），应按
不透明字符串保存，并同时保存人类可读的 term label；不要从 academic year 自行猜 value。
Class Nbr 会跨 term 重用，所以它只能在 `academicCareer + sourceTermId` 下唯一。Meeting
行没有公开的稳定 ID，ordinal 只在同一次快照内有意义。

当个人 CUSIS 快照带有 term 和 Class Nbr 时，优先用这两个值连接公开 CourseOffering；
如果只能取得 course/class code，允许降级匹配，但必须标记为不确定，不能静默选中一个
section。

## 新鲜度

[RES 的 2026-27 公告](https://www.res.cuhk.edu.hk/announcement/information-on-teaching-timetable-2026-27/)
说明：

- 2026-27 全日制本科课表在 2026 年 7 月 6 日已经上传；
- 2026-27 Term 1 课表在 8 月 11 日前每周二、周五定期更新；
- add/drop consent、reserved quota 等选课信息到 8 月初才进入系统；
- 选课期间可在同一功能查看剩余 quota；选课开始后的课表改动还会由开课单位通知已选学生。

公开结果页没有逐行 `updatedAt`，HTTP 响应也没有可用的 `Last-Modified`，因此 CUpedia
只能保证“我们在何时读取到这个值”，不能声称“CUHK 在何时最后修改了它”。每次采集都要
保存 CUpedia 自己的 `capturedAt`；界面尤其要在 vacancy 旁显示这个时间。

课表和 vacancy 的变化速度也不同：星期/时间/地点通常低频变化，而 vacancy 在选课期可能
很快变化。第一版应把 vacancy 当提示性快照，不能显示成实时保证，也不能用
`vacancy > 0` 代替 CUSIS 的 eligibility/validate 结果。

## 已知缺口

- **未发现有文档的 JSON/REST API**：本次能确认的公开契约是 ASP.NET HTML 表单、验证码和
  表格。不能据此证明后台绝无其他 endpoint，但 CUpedia 不应依赖一个未发布的接口。页面
  结构可改变，解析器必须做表头校验并在 schema 漂移时失败告警。
- **RPG 没有 Vacancy 列**：2026-27 Term 1 的 RPG 实测如此，仓库现有说明也记录了同一
  现象；`vacancy` 必须是 `number | null`，不能填 0。
- **没有历史 term 浏览**：2026-08-27 落地页只列出 2026-27 Medicine Academic Year、
  Term 1、Term 2 和 Summer Session。公开课表适合当前/将来 term，不是学生历史来源。
- **Medicine 是特殊 calendar**：它用整学年选项，不应硬塞进普通 `Term 1/2/Summer`。
- **待定值是真实状态**：`TBA`、`NRR`、`Staff` 和空值必须保留；CSCI 样本中 46 个项目
  meeting 是 `Period=TBA, Room=NRR`。
- **Meeting Date 有两种常见形状**：无年份日期清单和带年份日期范围。冲堂逻辑应先解析
  可识别形状，同时保留 raw text；解析失败时显示安排但不做确定性冲堂结论。
- **Room enrichment 不完整**：Buildings/Halls 能解释楼宇前缀，Communal Classrooms 只
  覆盖公共课室；院系自有地点仍应显示原始 code。
- **Reserved quota 不在平面数字里**：有分组时需要点击 quota link 才能看详情。第一版若
  不抓这层，应明确只显示 overall quota/vacancy。
- **没有“某学生能否选入”的公共答案**：先修、programme、reserved quota、时间冲突和
  consent 等个性化规则仍需 CUSIS validate；公开 vacancy 不能替代它。

## 对现有仓库的具体改动方向

仓库已经完成了大约一半的工作：

- [`tools/scraper/scrape_timetable.py`](../../../tools/scraper/scrape_timetable.py)
  已指向同一个官方 URL，能处理四个 academic career、ASP.NET postback、验证码、subject
  遍历和断点续跑。
- 它当前只解析 Class Code、Class Nbr、Teaching Staff、Quota、Vacancy、Component 和
  Section；结果表已经有的 Language、Period、Room、Meeting Date 被忽略。
- [`course_enrollments`](../../../src/db/schema.ts) 已保存 term、class code/number、component、
  section、quota、vacancy、instructors 和 `capturedAt`，但没有 academic career、source
  term ID、meeting dates 或 meeting slots。
- [`tools/scraper/README.md`](../../../tools/scraper/README.md) 记录了现有 live-site 验证和
  RPG vacancy 为空的规则。
- 现有断点续跑会在每完成一个 subject 后重写一个顶层 `capturedAt`。一次全量运行可能持续
  很久，所以这个时间并不代表所有 subject 同时读取；扩充课表时必须改成 subject/batch
  级 freshness，或只在完整批次成功后发布一个一致快照。

后续实现票建议按下面顺序切分：

1. **扩充纯解析器和 fixture**：按表头找 `Language/Period/Room/Meeting Date`，实现续行继承，
   输出 offering/component/meeting 层级；用脱敏 HTML fixture 覆盖多 period、多日期段、
   `TBA/NRR` 和缺 Vacancy 列。
2. **确定公开课表 schema**：保留 `sourceTermId`、`academicCareer` 和 raw 字段；MeetingSlot
   用子表或版本化 JSON 均可，但必须支持一组件多条 meeting，不能在 offering 上放单个
   `weekday/start/end`。
3. **做原子快照替换**：按 `career + term + subject` 成功解析后整体替换旧数据；失败不能留下
   半新半旧结果。每批记录 `capturedAt` 和来源 URL。
4. **把 volatile 数据标出来**：课表页显示最近采集时间；vacancy 只作参考。先按官方课表
   发布节奏定期采集，内测中再测量一次全量运行成本，之后才决定选课期是否增加刷新频率。
5. **让个人课程空间只做连接**：个人历史/当前课程/Cart 以 `term + classNbr` 连接公开 offering；
   搜课、筛选、课表布局和冲堂分析不依赖临时 CUSIS session。

## 最终建议

Wayfinder 后续可以把“Meeting Slot 从哪里来”视为已决定：

> 采用 RES Teaching Timetable Public Access 作为当前学期开课及 meeting 的官方来源，扩充
> CUpedia 已有离线 scraper 并保存带 `capturedAt` 的公开快照。以
> `academicCareer + sourceTermId + classNbr` 标识一次开班，以 component/section 分组多个
> MeetingSlot；保留日期和原始文本。vacancy 是可空、带时间戳的参考值，不是实时可选保证。

这一决定同时把 CUSIS session 的边界收窄：它只提供个人数据，不负责公共课程筛选和排课。
