# 课程功能开发总结（Course Feature Summary）

本文件总结 CUpedia「课程测评」功能的实现，对应需求文档 `Course_Prompt.md`。

## 1. 功能概览

面向 CUHK 学生的课程测评模块，挂载在 `/courses` 路由下。任何人可浏览课程列表与详情；登录后可为课程**打分**（可多次，间隔 5 分钟）、**匿名**发表评论、撤回自己的评论、给评论点赞/取消点赞。

- **课程数据**：只读 mock JSON（暂无真实数据源），预留好接口便于将来接入后端。
- **评分 / 评论 / 点赞**：用户产生的数据，持久化到本地 JSON 文件（`mock/reviews.json` 中的 `ratings` / `reviews` 字段）。

## 2. 目录结构

```
src/app/(main)/courses/
├── page.tsx                      # 课程列表页（筛选 + 搜索 + 卡片网格）
├── [code]/page.tsx               # 课程详情页（信息 + 打分 + 综合推荐指数 + 评论区）
├── mock/
│   ├── courses.ts                # 课程 mock 数据 + 类型 + 工具函数
│   └── reviews.json              # 用户评分/评论/点赞的持久化文件（运行时写入）
└── course_function_summary.md    # 本文件

src/lib/
└── course-actions.ts             # 数据访问层（repository）+ server actions

src/components/courses/
├── course-filters.tsx            # 学院 / 学分 筛选（客户端，改 URL 参数）
├── course-search.tsx             # 课程代码/名称搜索框（客户端）
├── course-rating-panel.tsx       # 打分面板（滑块 + 快捷分 + 5 分钟冷却）
└── course-review-section.tsx     # 评论列表 + 发表 + 撤回 + 点赞（客户端）

src/components/layout/navbar.tsx   # 顶部导航新增「课程」入口
```

## 3. 数据模型

### 课程（mock，只读）— `mock/courses.ts`

```ts
type Course = {
  code: string;       // 四字母+四数字，如 "CSCI3150"
  subject: string;    // 学科前缀，如 "CSCI"
  title: string;      // 课程名称
  credits: number;    // 学分
  faculty: Faculty;   // ERG | SCI | ARTS | BA | Others
  rating: number;     // 推荐指数（mock，0–10，一位小数）
  description: string;
};
```

- 共约 **30 门**课程，覆盖五大学院桶：工程(ERG)、理学(SCI)、文学(ARTS)、商学(BA)、其他(Others)。
- 字段 (a) 课号、(b) 名称、(d) 学分为手工整理的真实 CUHK 课程；(c) 推荐指数为随机生成（0–10，一位小数），固定写入以保持渲染稳定。

### 评论 / 点赞（持久化）— `mock/reviews.json`

```ts
type StoredReview = {
  id: string;
  courseCode: string;
  userId: string;
  content: string;
  createdAt: string;
  likedBy: string[];
};
```

### 评分（持久化）— `mock/reviews.json` → `ratings` 数组

```ts
type StoredRating = {
  id: string;
  courseCode: string;
  userId: string;
  score: number;      // 0–10，一位小数
  createdAt: string;
};
```

- 同一用户可对同一课程**多次打分**，两次提交间隔至少 **5 分钟**（`RATING_COOLDOWN_MS`）。
- **综合推荐指数**：有用户评分时取所有评分的平均值；无用户评分时回退到 mock 基线分。

## 4. 接口设计（便于将来接入后端）

`src/lib/course-actions.ts` 是 UI 与数据源之间的**唯一边界**（repository 层 + server actions）。将来接入真实后端时，只需重写以下函数的实现，导出的类型即为契约，页面/组件无需改动：

| 函数 | 作用 |
| --- | --- |
| `getCourses(filter)` | 课程列表，支持学院 / 学分 / 关键字过滤，附带评论数 |
| `getCourse(code)` | 单门课程详情 |
| `getCourseReviews(code)` | 某课程的评论（含当前用户的点赞/归属状态） |
| `getCourseRatingState(code)` | 综合评分 + 当前用户冷却状态 |
| `submitCourseRating(code, score)` | 提交评分（需登录，5 分钟冷却） |
| `addReview(code, content)` | 发表评论（需登录） |
| `deleteReview(reviewId)` | 撤回评论（仅作者本人或管理员） |
| `toggleLike(reviewId)` | 点赞 / 取消点赞（需登录） |

## 5. 已实现需求映射

| 需求 | 实现 |
| --- | --- |
| 3.1 静态课程显示（课号/名称/推荐指数/学分） | 列表页卡片，参考 `refer_html/1(1).html` 设计风格 |
| 3.2(a) 学院过滤 ERG/SCI/ARTS/BA/Others | `CourseFilters` 左侧栏，点击切换 URL `?faculty=` |
| 3.2(b) 学分过滤 1/2/3，4 学分以上为其他 | `CourseFilters`，`?credits=1|2|3|other` |
| 3.2(c) 课程编号/名称搜索 | `CourseSearch`，代码匹配优先于标题匹配 |
| 3.3(a) 课程详细信息 | 详情页课程信息卡 + 综合推荐指数 |
| 3.3(b) 匿名评论 / 撤回自己评论 | 评论以「匿名用户」展示；服务端存 `userId` 用于本人撤回 |
| 3.3(c) 评论点赞 / 取消点赞 + 点赞数 | `toggleLike`，按用户 id 去重 |
| 打分（可多次，5 分钟间隔） | `CourseRatingPanel` + `submitCourseRating` |
| 3.4 本地登录后浏览/评论/点赞/打分 | 复用 better-auth；数据落本地 JSON 文件 |

## 6. 匿名与权限模型

- 评论前端**一律**显示为「匿名用户」，不暴露昵称/邮箱。
- 服务端保留 `userId`，仅用于：撤回本人评论、点赞去重、向当前登录者展示「撤回」按钮。
- 撤回权限：评论作者本人或 `role === "admin"`。
- 未登录用户：可浏览，但发表/点赞入口禁用并提示登录。

## 7. 技术约定（遵循现有代码风格）

- Next.js App Router，默认 Server Component，交互部分用 `"use client"`。
- Server actions 集中在 `src/lib/*-actions.ts`，沿用 `requireAuth` / `getOptionalUser`。
- 变更后通过 `revalidatePath` + `router.refresh()` 刷新数据。
- 样式使用 Tailwind + shadcn/ui，全站文案为中文。

## 8. 本地运行与验证

```bash
docker compose up -d db minio   # 启动数据库（登录依赖 better-auth）
pnpm dev                        # 访问 http://localhost:3000/courses
```

用任一 seed 账号（如 `user@test.com` / `password123`）登录后即可评论、点赞。

已通过：`pnpm tsc --noEmit`、`pnpm eslint`（课程相关文件，无错误）。

## 9. 已知限制 / 后续可接入真实后端

- 评论数据存于本地 JSON 文件，采用读-改-写、无并发锁，适合本地/演示；高并发或生产应换为数据库表（如 `course_reviews` / `course_comment_likes`）或真实 API——只需替换 `course-actions.ts` 的实现。
- 课程数据为 mock，将来可改为爬虫/教务 API；`Course` 类型即对接契约。
- 推荐指数目前为随机 mock 值，将来可由真实评分聚合计算。
