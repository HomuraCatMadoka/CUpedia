<div align="center">

# CUpedia

**你的中大百科全书** · A community wiki for CUHK students

[![CI](https://github.com/HomuraCatMadoka/CUpedia/actions/workflows/ci.yml/badge.svg)](https://github.com/HomuraCatMadoka/CUpedia/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

[中文](#中文) · [English](#english)

</div>

---

## 中文

CUpedia 是面向香港中文大学（CUHK）学生的社区维基。任何人都能浏览；用中大邮箱
（`@cuhk.edu.hk` / `@link.cuhk.edu.hk`）登录后即可协作编辑。

### 功能

- **层级化页面**：`parentId` 构成页面树，驱动侧边栏导航
- **修订历史**：每次编辑生成一条修订，支持可视化 diff 与非破坏性回滚
- **软删除**：`deletedAt` 标记，可从管理后台恢复
- **编辑冲突检测**：基于 `updatedAt` 的乐观锁，冲突时回退到三方合并 / 手动解决
- **搜索**：Fuse.js 模糊搜索（标题 0.7 / 正文 0.3）+ PostgreSQL 中文全文索引
- **富内容**：数学公式（LaTeX）、表格、代码、callout、目录、`[[互链]]` 与反向链接、行内批注
- **编辑器体验**：自动保存、离开未保存提醒、`Cmd+S`
- **认证**：中大邮箱白名单，密码 + 邮件 OTP（经 Brevo）
- **权限**：`user` / `admin` 角色与封禁标记，含用户管理、已删除页面恢复的管理后台
- **附件**：MinIO S3 存储，经 `/api/wiki-assets/` 受控访问

### 技术栈

Next.js 16（App Router）· TypeScript · Drizzle ORM + PostgreSQL · better-auth ·
Plate 编辑器（内容存为 Plate JSON）· MinIO · Tailwind CSS 4 + shadcn/ui ·
Fuse.js · Vitest + Playwright · Docker Compose · pnpm

### 快速开始

前置：Docker、Node 与 pnpm。

```bash
git clone https://github.com/HomuraCatMadoka/CUpedia.git
cd CUpedia
pnpm install
pnpm bootstrap   # 一键：写 .env.local + 起 docker + 建 bucket + 迁移 + seed（幂等，可重复跑）
pnpm dev         # http://localhost:3000
```

种子账号（密码均为 `password123`）：`admin@test.com`（管理员）、`user@test.com`、
`contributor@test.com`、`banned@test.com`（已封禁）。

### 文档

- [AGENTS.md](AGENTS.md) — 开发指南（目录结构、命令、数据库、认证、约定）
- [CONTRIBUTING.md](CONTRIBUTING.md) — 贡献指南
- [SECURITY.md](SECURITY.md) — 安全漏洞上报

### 贡献

欢迎贡献！请先读 [CONTRIBUTING.md](CONTRIBUTING.md)。新人可从
[`good first issue`](https://github.com/HomuraCatMadoka/CUpedia/labels/good%20first%20issue)
标签入手。

### 许可证

[MIT](LICENSE)

---

## English

CUpedia is a community wiki for students at the Chinese University of Hong Kong
(CUHK). Anyone can read it; signing in with a CUHK email
(`@cuhk.edu.hk` / `@link.cuhk.edu.hk`) unlocks collaborative editing.

### Features

- **Hierarchical pages** — `parentId` builds the page tree that drives the sidebar
- **Revision history** — every edit creates a revision, with visual diff and non-destructive rollback
- **Soft deletes** — `deletedAt` flag, restorable from the admin panel
- **Edit-conflict detection** — `updatedAt`-based optimistic lock, falling back to three-way merge / manual resolution
- **Search** — Fuse.js fuzzy search (title 0.7 / content 0.3) plus PostgreSQL Chinese full-text indexing
- **Rich content** — math (LaTeX), tables, code, callouts, table of contents, `[[wiki interlinks]]` with backlinks, inline annotations
- **Editor UX** — autosave, unsaved-changes guard, `Cmd+S`
- **Auth** — CUHK email whitelist, password + email OTP (via Brevo)
- **Roles** — `user` / `admin` roles and a banned flag, with an admin panel for user management and deleted-page recovery
- **Assets** — MinIO S3 storage served through the access-controlled `/api/wiki-assets/` route

### Tech Stack

Next.js 16 (App Router) · TypeScript · Drizzle ORM + PostgreSQL · better-auth ·
Plate editor (content stored as Plate JSON) · MinIO · Tailwind CSS 4 + shadcn/ui ·
Fuse.js · Vitest + Playwright · Docker Compose · pnpm

### Quick Start

Prerequisites: Docker, Node, and pnpm.

```bash
git clone https://github.com/HomuraCatMadoka/CUpedia.git
cd CUpedia
pnpm install
pnpm bootstrap   # one command: writes .env.local, starts docker, creates the bucket, migrates, seeds (idempotent)
pnpm dev         # http://localhost:3000
```

Seed accounts (all with password `password123`): `admin@test.com` (admin),
`user@test.com`, `contributor@test.com`, `banned@test.com` (banned).

### Documentation

- [AGENTS.md](AGENTS.md) — development guide (structure, commands, database, auth, conventions)
- [CONTRIBUTING.md](CONTRIBUTING.md) — contribution guide
- [SECURITY.md](SECURITY.md) — reporting security vulnerabilities

### Contributing

Contributions are welcome! Start with [CONTRIBUTING.md](CONTRIBUTING.md). New
contributors can look for the
[`good first issue`](https://github.com/HomuraCatMadoka/CUpedia/labels/good%20first%20issue)
label.

### License

[MIT](LICENSE)
