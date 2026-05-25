# CUpedia Development Guide

> **Note:** `CLAUDE.md` references `AGENTS.md`. They share the same content.

## Codebase Structure

Next.js 16 App Router wiki application for CUHK students ("你的中大百科全书").

```
CUpedia/
├── src/
│   ├── app/              # App Router pages & API routes
│   │   ├── (auth)/       # Login, nickname setup
│   │   ├── (main)/       # Homepage, wiki (read/edit/search/history)
│   │   ├── admin/        # User management, deleted pages
│   │   └── api/          # Auth, upload, wiki-assets
│   ├── components/       # React components
│   │   ├── layout/       # Navbar, sidebar, breadcrumb
│   │   ├── wiki/         # Editor, renderer, revision diff
│   │   ├── admin/        # User table, admin tabs
│   │   └── ui/           # shadcn primitives
│   ├── db/
│   │   ├── schema.ts     # Drizzle schema (users, wikiPages, wikiRevisions, etc.)
│   │   ├── index.ts      # DB connection
│   │   └── migrations/   # Generated SQL migrations
│   └── lib/              # Server actions & utilities
│       ├── auth.ts       # NextAuth config (Email provider, JWT, DrizzleAdapter)
│       ├── auth-guard.ts # requireAuth(), requireAdmin(), getOptionalUser()
│       ├── wiki-actions.ts   # CRUD, search, revision, soft-delete, rollback
│       ├── admin-actions.ts  # User listing, ban/unban
│       ├── markdown.ts       # remark/rehype pipeline
│       ├── minio.ts          # MinIO S3 storage
│       ├── email.ts          # Domain whitelist, normalization
│       ├── slug.ts           # CJK-aware slug generation
│       └── nickname.ts       # Grapheme-safe validation
├── tests/                # Vitest unit tests
├── scripts/              # Utility scripts (Notion import)
├── docker-compose.yml    # PostgreSQL + MinIO + Caddy
├── Dockerfile            # Multi-stage standalone build
└── Caddyfile             # Reverse proxy template
```

### Key Entry Points

- Wiki CRUD: `src/lib/wiki-actions.ts`
- Auth flow: `src/lib/auth.ts` → `auth-callbacks.ts` → `auth-guard.ts`
- DB schema: `src/db/schema.ts`
- Markdown: `src/lib/markdown.ts` (unified pipeline)
- Storage: `src/lib/minio.ts` (MinIO S3)

## Essential Commands

```bash
# Development
pnpm dev                    # Start Next.js dev server (port 3000)
pnpm build                  # Production build (standalone output)
pnpm start                  # Start production server

# Database
pnpm drizzle-kit generate   # Generate migration from schema changes
pnpm drizzle-kit migrate    # Apply pending migrations
pnpm drizzle-kit push       # Push schema directly (dev only)
pnpm drizzle-kit studio     # Visual DB browser

# Testing
pnpm test                   # Run Vitest
pnpm test -- <path>         # Run specific test file

# Code Quality
pnpm lint                   # ESLint check
pnpm lint --fix             # Auto-fix lint issues
```

## Local Development Setup

### Docker Services

```bash
# Start PostgreSQL + MinIO (required for dev)
docker compose up -d db minio

# Start full stack (includes app + Caddy)
docker compose --profile production up -d

# Reset database
docker compose down -v && docker compose up -d db minio
```

| Service       | Port | Credentials           |
| ------------- | ---- | --------------------- |
| PostgreSQL    | 5433 | postgres/postgres     |
| MinIO API     | 9000 | minioadmin/minioadmin |
| MinIO Console | 9001 | minioadmin/minioadmin |
| Next.js       | 3000 | —                     |

### Environment

Copy `.env.example` to `.env.local`. Required variables:

- `DATABASE_URL` — PostgreSQL connection string (port 5433)
- `AUTH_SECRET` — `openssl rand -base64 32`
- `AUTH_URL` — `http://localhost:3000`
- `BREVO_API_KEY` — Email delivery
- `MINIO_*` — Object storage config

## Database

ORM: Drizzle with PostgreSQL dialect. Schema in `src/db/schema.ts`.

### Core Tables

| Table                                        | Purpose                                                        |
| -------------------------------------------- | -------------------------------------------------------------- |
| `users`                                      | Email, nickname, role (user/admin), banned flag                |
| `wikiPages`                                  | Hierarchical pages (slug, title, content, parentId, deletedAt) |
| `wikiRevisions`                              | Full edit history per page                                     |
| `magicLinkRateLimits`                        | 60s cooldown per email                                         |
| `accounts`, `sessions`, `verificationTokens` | Auth.js adapter tables                                         |

### Schema Change Workflow

1. Edit `src/db/schema.ts`
2. Run `pnpm drizzle-kit generate` to create migration
3. Run `pnpm drizzle-kit migrate` to apply
4. Run `pnpm test` to verify
5. Commit both schema.ts and generated migration

For the full step-by-step workflow with verification, use the `$db-migration` skill.

## Authentication

- **Provider**: Email magic link (no passwords)
- **Strategy**: JWT via NextAuth
- **Allowed domains**: `@cuhk.edu.hk`, `@link.cuhk.edu.hk`
- **Rate limit**: 60s cooldown per email, DB-backed with row locks
- **Roles**: `user` (default), `admin`
- **First login**: Forces nickname setup before proceeding

### Access Control Pattern

```typescript
// In server actions / API routes:
const user = await requireAuth(); // Throws if not authenticated
const admin = await requireAdmin(); // Throws if not admin
const maybe = await getOptionalUser(); // Returns null if not authenticated
```

## Wiki System

### Key Behaviors

- **Hierarchical pages**: parentId builds tree structure for sidebar
- **Soft deletes**: `deletedAt` timestamp, restorable from admin panel
- **Optimistic locking**: Edit conflict detection via `updatedAt` comparison
- **Revision history**: Every edit creates a `wikiRevision` entry
- **Rollback**: Creates new revision from old content (non-destructive)
- **Search**: Fuse.js fuzzy search with weighted title (0.7) / content (0.3)
- **Slug generation**: CJK-aware, reserved prefixes: `edit`, `history`, `new`, `search`

### Markdown Pipeline

```
remark-parse → remark-gfm → remark-rehype → rehype-highlight → rehype-sanitize → rehype-stringify
```

Custom sanitization allows: `img` (src/alt/title), `a` (href/target/rel), `code` (className for highlights).

## Testing

Vitest with path alias `@/` → `./src/`. Tests in `tests/` directory.

```bash
pnpm test                          # All tests
pnpm test -- tests/slug.test.ts    # Specific file
```

When adding tests for lib functions, follow existing patterns in `tests/`.

## Code Style

- **Framework**: Tailwind CSS 4 + shadcn/ui (base-nova style, neutral palette)
- **Components**: Server Components by default, `"use client"` only when necessary
- **Server actions**: `"use server"` in `src/lib/*-actions.ts`
- **Formatting**: Follow existing ESLint + Prettier config
- **Naming**: Kebab-case files, camelCase functions, PascalCase components
- **Imports**: `@/` alias for `src/`, relative imports within same directory

## Development Anti-Patterns

- **Don't use `console.log` for auth debugging** — check `AUTH_SECRET` and `AUTH_URL` env vars first
- **Don't modify migration files** — they are generated; edit `schema.ts` instead
- **Don't skip conflict detection** — always compare `updatedAt` when updating wiki pages
- **Don't hardcode email domains** — use the whitelist in `email.ts`
- **Don't serve files directly from MinIO** — use the `/api/wiki-assets/` route for access control
- **Don't use `drizzle-kit push` in production** — use `generate` + `migrate`
- **Don't forget to start Docker services** — `docker compose up -d db minio` before `pnpm dev`

## Context-Efficient Workflows

- **DB schema questions**: Read `src/db/schema.ts` directly, don't scan migrations
- **Auth flow questions**: Start from `src/lib/auth.ts`, not the API route
- **Component questions**: grep for the component name, read the import chain
- **Test output**: Capture once to file, analyze without re-running

## Specialized Skills

Use skills for deep-dive workflows. Keep baseline rules in this file.

- `$create-pr` — Branch, commit, push, and PR creation workflow

## Task Decomposition and Verification

- Split work into individually verifiable steps. Verify each before proceeding.
- For DB changes: verify with `pnpm drizzle-kit generate` + `pnpm test`
- For UI changes: verify in browser at `localhost:3000`
- For auth changes: test the full login flow (magic link → nickname → redirect)
- For API changes: test with curl or browser
- When unclear how to verify, ask.

## Agent Output Contract

When completing a task, report exactly:

1. **Files changed** — every file added, modified, or deleted
2. **Commands run** — every lint, test, or build command and its result (pass/fail)
3. **Not verified** — anything you could not verify and why

No summaries of what the code does — the diff shows that. Example:

```
Files: src/lib/wiki-actions.ts, tests/wiki-actions.test.ts
Ran: pnpm lint (pass), pnpm test (pass)
Not verified: browser test for edit conflict UI (no browser available)
```

## Verification Profiles

### WIP — during development

Run only what is relevant to changed files:

```bash
pnpm eslint $(git diff --name-only --diff-filter=d HEAD -- '*.ts' '*.tsx')
pnpm test -- tests/<related-test>.test.ts
```

Do not claim the task is complete under WIP.

### Ready — before completion or PR

Full suite. Both must pass before claiming done or creating a PR:

```bash
pnpm lint
pnpm test
```

If either fails, fix first. Do not create a PR or claim completion with failing checks.

## PR Requirements

- Each GitHub issue MUST have its own independent PR. Do NOT combine multiple issues into one PR.
- PR description MUST contain one line starting with `Issue Number:` and reference related issue(s) using `close #<id>` or `ref #<id>`.
- When issues have dependencies, merge them in order: merge the blocker PR first, then create the next PR based on updated main.
- Avoid force-push when possible; prefer follow-up commits and squash merge.

## Commit Style

- Concise, descriptive messages focused on what changed and why
- Format: `type: description` (e.g., `feat: add revision rollback`, `fix: edit conflict detection`)
- Do NOT leave PRs in draft unless explicitly asked
