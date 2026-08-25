<div align="center">

# CUpedia

**你的中大百科全书，也是由学生共同建设的校园生活平台**

[访问 CUpedia](https://cupedia.org) · [快速开始](#快速开始) · [文档](docs/README.md) · [English](#english)

[![CI](https://github.com/HomuraCatMadoka/CUpedia/actions/workflows/ci.yml/badge.svg)](https://github.com/HomuraCatMadoka/CUpedia/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

</div>

CUpedia 面向香港中文大学（CUHK）学生，汇集百科、课程与教授测评、食堂信息、书院推荐和校园交通等服务。公开内容可以匿名浏览；需要署名或保存的贡献功能使用合规的中大账号。

## 现在可以做什么

- **SG Wiki**：阅读和共建校园生存指南，使用富文本、页面互链、修订历史、搜索与安全回滚
- **课程与教授**：查找课程和教授，浏览社区评分、评论与回复
- **山城食记**：查看食堂、菜单和价格，参与菜品投票、评论与食堂榜单
- **分院帽与课程技能树**：探索书院选择和课程路径，不代替学校的正式选课或毕业审核
- **中大校巴**：查看官方路线、今日班次和测试中的预计到站信息
- **公告、通知与产品更新**：了解重要消息、与自己有关的互动，以及已经上线的产品变化

## 账号、编辑与公开内容

注册账号必须使用 `@cuhk.edu.hk`，或前缀为 `1155` 加六位数字的 `@link.cuhk.edu.hk` 邮箱。注册流程使用密码和邮件一次性验证码（OTP）。

公开 Wiki 页面及其图片可以匿名读取。普通账号能否编辑 Wiki 由站点的编辑策略决定；登录不会自动绕过该策略。新建 Wiki 页面先保存为仅创建者可见的私有页面草稿，发布后才进入公开页面树和搜索结果。

## 技术栈

项目使用 Next.js 16 App Router、TypeScript、React 19、Drizzle ORM、PostgreSQL、better-auth、Plate、MinIO、Tailwind CSS 4、Vitest、Playwright、Docker Compose 和 pnpm。

## 快速开始

本地开发以持续集成（CI）使用的 Node.js 20 和 pnpm 10 为基线，并需要 Docker Compose。

```bash
git clone https://github.com/HomuraCatMadoka/CUpedia.git
cd CUpedia
pnpm install
pnpm bootstrap
pnpm dev
```

`pnpm bootstrap` 会创建 `.env.local`、启动 PostgreSQL 和 MinIO、创建上传 bucket、应用迁移并加载开发数据。浏览器随后打开 `http://localhost:3000`。

可用 `admin@test.com` / `password123` 登录。其他测试账号、开发数据、环境变量、服务端口和重置方法见[本地开发指南](docs/development/setup.md)。

## 文档入口

- [文档总目录](docs/README.md)：开发、领域、决策、运维与研究材料的导航
- [贡献指南](CONTRIBUTING.md)：从 fork 到提交 Pull Request（PR）的完整流程
- [上下文地图](CONTEXT-MAP.md)：各业务领域的语言、边界与关系
- [Agent 指南](AGENTS.md)：编码代理每次任务都要遵守的规则
- [安全策略](SECURITY.md)：私密报告安全漏洞的方法

## English

CUpedia is a community-built campus platform for students at the Chinese University of Hong Kong. It combines a public Wiki with course and professor reviews, canteen information, college recommendations, campus bus information, announcements, notifications, and product updates.

Visit [cupedia.org](https://cupedia.org) to use the platform. For local development and pull requests, follow the English [contribution guide](CONTRIBUTING.md). The [documentation index](docs/README.md) maps the technical and domain references without duplicating changing commands here.

## 贡献与许可证

欢迎贡献。可以从 [`good first issue`](https://github.com/HomuraCatMadoka/CUpedia/labels/good%20first%20issue) 开始，并在编码前阅读[贡献指南](CONTRIBUTING.md)。项目采用 [MIT License](LICENSE)。
