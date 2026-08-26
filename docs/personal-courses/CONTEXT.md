# 个人课程空间（Personal Course Workspace）

帮助已登录 User 把自己的 CUSIS 课程事实带入 CUpedia，并按真实学年、学期和班别建立选课计划。它不负责替用户在 CUSIS 加课、退课、交换班别或提交选课。

## Language

**个人课程记录（Personal Course Record）**:
某个 User 在一门课及真实学年学期中的个人状态事实，状态包括已修、在修、候补或位于 CUSIS Shopping Cart；记录来自用户主动发起的只读 CUSIS 导入。
_Avoid_: 选课人数、courseEnrollments、Build

**Course Plan**:
User 在 CUpedia 中编辑的实际选课方案，可包含真实学年、学期和班别。它不等于 CUSIS Shopping Cart，也不等于课程技能树的 Build。
_Avoid_: Shopping Cart、Build、构筑

**CUSIS Shopping Cart**:
CUSIS 中当前存在的待选课程集合；个人课程空间只读地导入它，不把 Course Plan 的修改写回其中。
_Avoid_: Course Plan、本地购物车

**CUSIS Import Snapshot**:
一次用户主动导入所得到的、带获取时间的个人课程与学业要求状态。它不包含密码、登录 cookie 或 PeopleSoft 页面状态。
_Avoid_: CUSIS session、自动同步

**Requirement Snapshot**:
CUSIS 在某次导入时向该 User 显示的个性化学业要求及满足状态；它可能缺失，也不等于 CUpedia 对毕业资格的正式判断。
_Avoid_: 毕业审计、主修骨架
