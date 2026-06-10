# CUpedia Development Guide

> **Note:** `CLAUDE.md` references `AGENTS.md`. They share the same content.

## Codebase Structure

Next.js 16 App Router wiki application for CUHK students ("你的中大百科全书").

```
.
├── src/
│   ├── app/              # App Router pages & API routes
│   │   ├── (auth)/       # Login, register, nickname setup
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
│       ├── auth.ts       # better-auth config (email+password, OTP, Drizzle adapter)
│       ├── auth-guard.ts # requireAuth/requireAdmin/requireEditor/getOptionalUser
│       ├── wiki-actions.ts   # CRUD, revision, soft-delete, rollback
│       ├── admin-actions.ts  # User listing, ban/unban
│       ├── search.ts         # Fuse.js fuzzy search
│       ├── plate-utils.ts    # Plate JSON ↔ markdown (headless editor)
│       ├── minio.ts          # MinIO S3 storage
│       ├── email.ts          # Domain whitelist, normalization
│       ├── slug.ts           # CJK-aware slug generation
│       └── nickname.ts       # Grapheme-safe validation
├── tests/                # Vitest unit tests
├── scripts/              # bootstrap (setup.ts), seed, Notion import
├── docker-compose.yml    # PostgreSQL + MinIO + Caddy
├── Dockerfile            # Multi-stage standalone build
└── Caddyfile             # Reverse proxy template
```

### Key Entry Points

- Wiki CRUD: `src/lib/wiki-actions.ts`
- Auth flow: `src/lib/auth.ts` (better-auth) → `auth-guard.ts`
- DB schema: `src/db/schema.ts`
- Content format: `src/lib/plate-utils.ts` (Plate JSON, with markdown conversion)
- Storage: `src/lib/minio.ts` (MinIO S3)

## Essential Commands

```bash
# One-command setup (env + docker + bucket + migrate + seed)
pnpm bootstrap              # idempotent; safe to re-run

# Development
pnpm dev                    # Start Next.js dev server (port 3000)
pnpm build                  # Production build (standalone output)
pnpm start                  # Start production server

# Database
pnpm drizzle-kit generate   # Generate migration from schema changes
pnpm drizzle-kit migrate    # Apply pending migrations (canonical, local + CI)
pnpm drizzle-kit studio     # Visual DB browser
pnpm seed                   # (Re)load idempotent dev fixtures

# Testing
pnpm test                   # Run Vitest
pnpm test -- <path>         # Run specific test file

# Code Quality
pnpm lint                   # ESLint check
pnpm lint --fix             # Auto-fix lint issues
```

## Local Development Setup

### Quick Start

```bash
git clone <repo> && cd CUpedia
pnpm install
pnpm bootstrap                    # one command, idempotent
pnpm dev                          # http://localhost:3000
```

`pnpm bootstrap` (`scripts/setup.ts`) runs the whole local setup end-to-end:

1. Creates `.env.local` from `.env.example` if missing (defaults work out of the box)
2. Starts the `db` + `minio` containers and waits for their healthchecks
3. Creates the `cuclaw-uploads` MinIO bucket (via the `createbuckets` service)
4. Applies the schema with `pnpm drizzle-kit migrate` (not `push` — see below)
5. Loads dev fixtures with `pnpm seed`

Re-running it is safe — every step is idempotent.

Seed accounts (all with password `password123`):

| Email                | Role  | Notes         |
| -------------------- | ----- | ------------- |
| admin@test.com       | admin | —             |
| user@test.com        | user  | —             |
| banned@test.com      | user  | banned        |
| contributor@test.com | user  | second author |

Seed data also covers the main feature surfaces: a rich-content page
(math/table/code/callout/TOC), a page with 3 revisions by different editors
(history/diff/rollback), a soft-deleted page (admin restore panel), a depth-3
page hierarchy, and the `wiki_edit_role` site setting.

### Docker Services

```bash
# Start PostgreSQL + MinIO (required for dev)
docker compose up -d db minio

# Start full stack (includes app + Caddy)
docker compose --profile production up -d

# Reset everything (drops volumes), then re-bootstrap
docker compose down -v && pnpm bootstrap
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
- `AUTH_SECRET` — any string (dev default provided in `.env.example`)
- `AUTH_URL` — `http://localhost:3000`
- `MINIO_*` — Object storage config (defaults work with local MinIO)
- `BREVO_API_KEY` / `EMAIL_FROM` — only needed to send real OTP emails (register a
  new account). Seed accounts log in with a password and skip OTP entirely.

## Database

ORM: Drizzle with PostgreSQL dialect. Schema in `src/db/schema.ts`.

### Core Tables

| Table                                   | Purpose                                                        |
| --------------------------------------- | -------------------------------------------------------------- |
| `users`                                 | Email, nickname, role (user/admin), banned flag                |
| `wikiPages`                             | Hierarchical pages (slug, title, content, parentId, deletedAt) |
| `wikiRevisions`                         | Full edit history per page                                     |
| `siteSettings`                          | Key/value app config (e.g. `wiki_edit_role`)                   |
| `accounts`, `sessions`, `verifications` | better-auth adapter tables                                     |

### Schema Change Workflow

1. Edit `src/db/schema.ts`
2. Run `pnpm drizzle-kit generate` to create migration
3. Run `pnpm drizzle-kit migrate` to apply
4. Run `pnpm test` to verify
5. Commit both schema.ts and generated migration

For the full step-by-step workflow with verification, use the `$db-migration` skill.

### Apply with `migrate`, not `push`

Local setup uses `drizzle-kit migrate`, never `push`. The migration chain
contains hand-written SQL that is **not** derivable from `schema.ts`:

- `0003` — `CREATE EXTENSION pg_trgm` plus trigram GIN indexes
- `0007` — Better Auth table repair (transforms the legacy NextAuth tables)

`push` only diffs `schema.ts` against the DB, so it would silently skip those
statements and produce a database that diverges from CI and production. `migrate`
replays the journal in order and reproduces the exact schema.

## Authentication

- **Library**: [better-auth](https://better-auth.com) with the Drizzle adapter (`src/lib/auth.ts`)
- **Provider**: email + password (`minPasswordLength: 8`); email verification and
  sign-in OTP via the `emailOTP` plugin (6-digit code, 5-min expiry, sent through Brevo)
- **Allowed domains**: `@cuhk.edu.hk`, `@link.cuhk.edu.hk` (enforced in `email.ts`)
- **IDs**: UUID (`advanced.database.generateId: "uuid"`)
- **Roles**: `user` (default), `admin`; `banned` flag — both as better-auth additional fields
- **First login**: Forces nickname setup before proceeding

> Seed accounts log in with email + password `password123` — no OTP needed,
> since they are created with `emailVerified: true`.

### Access Control Pattern

```typescript
// In server actions / API routes (src/lib/auth-guard.ts):
const user = await requireAuth(); // Throws if not authenticated
const admin = await requireAdmin(); // Throws if not admin
const editor = await requireEditor(); // Throws unless allowed to edit
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

### Content Format

Wiki content is stored as **Plate JSON** (the editor's document model), not
markdown or HTML. `src/lib/plate-utils.ts` is the single boundary:

- `parseContent(content)` — JSON string → Plate value (degrades non-JSON to a plain paragraph)
- `extractText(content)` — flatten to plain text (search/excerpts)
- `fromMarkdown(markdown)` — markdown → Plate JSON (headless Plate editor; used by seed/import)
- `toMarkdown(content)` — Plate JSON → markdown (used by the history/diff path)

`fromMarkdown`/`toMarkdown` run a headless Plate editor with the same plugin
set as the UI (math, tables, code, callout, TOC, links, lists). Block
equations, callouts, and the TOC have no markdown syntax, so they cannot be
produced by `fromMarkdown` — they exist only as hand-authored Plate nodes.

## Testing

Vitest with path alias `@/` → `./src/`. Tests in `tests/` directory.

```bash
pnpm test                          # All tests
pnpm test -- tests/slug.test.ts    # Specific file
```

When adding tests for lib functions, follow existing patterns in `tests/`.

### End-to-End (Playwright)

```bash
pnpm exec playwright install chromium   # one-time: fetch the browser
pnpm test:e2e                           # run the e2e suite
```

`e2e/provision.ts` (run from the Playwright webServer command, before the server
boots) provisions an **isolated** database so the suite never touches your dev
data. It defaults to `<dev-db>_e2e` (e.g. `cuclaw_e2e`), creating it with the
zhparser config on first run, then migrating, wiping it to a clean slate, and
seeding. Set `E2E_DATABASE_URL` to give a parallel worktree its own db. The dev
`db` container must be running (`docker compose up -d db`).

### Test naming

Name e2e specs by the **feature/behavior** they exercise, never by the issue
that introduced them. `issue-<N>.spec.ts` is banned — a name like
`issue-92.spec.ts` tells a future reader nothing, and the one-issue-per-spec
model drifts (the same behavior ends up duplicated across two issue files).

- **Feature-named, flat directory**: `wiki-read.spec.ts`, `wiki-search.spec.ts`,
  `sidebar.spec.ts`, `homepage.spec.ts`.
- **Prefix as a namespace** to group an area's specs: `wiki-*`, `auth-*`.
- **Dot-suffix for variants** once a single feature's file grows:
  `wiki-edit.autosave.spec.ts`, `wiki-edit.conflict.spec.ts`.
- **Issue traceability lives inside the test**, not the filename: keep `#<N>` in
  the `test.describe` title or a `ref #<N>` file-header comment.

This is orthogonal to the "one PR per issue" rule (see PR Requirements) — PRs
still map to issues; only the spec _filename_ is feature-based. Unit tests in
`tests/` already follow this. See ADR 0007.

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
- **Don't serve files directly from MinIO** — use the `/api/wiki-assets/` route (path validation + immutable cache headers; assets are public, #139)
- **Don't use `drizzle-kit push`** — local and CI both apply schema with `migrate`; the migration chain has SQL (`pg_trgm`, auth repair) that `push` would skip
- **Don't forget to start Docker services** — `docker compose up -d db minio` before `pnpm dev`
- **Don't delete worktree before push succeeds** — commits in an unpushed worktree are unrecoverable

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
- For auth changes: test the full login flow (register/login → nickname → redirect)
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

Full suite. All must pass before claiming done or creating a PR:

```bash
pnpm lint
pnpm test
pnpm tsc --noEmit
```

If any fails, fix first. Do not create a PR or claim completion with failing checks.

## Worktree Workflow

When using git worktrees for parallel development:

1. **Create**: `git worktree add wt/<name> -b <branch> main`
2. **Bootstrap**: `cd wt/<name> && pnpm install`
3. **Code & verify**: use WIP profile while iterating, Ready profile before commit
4. **Push**: confirm push succeeds before any cleanup
5. **Merge**: `gh pr merge --squash --delete-branch`
6. **Cleanup**: `git worktree remove wt/<name>` only after merge is confirmed

If push fails: diagnose and retry — do not delete the worktree or branch. Commits in an unpushed worktree are unrecoverable once the worktree is removed.

## Task → Validation Matrix

| Change scope                        | Minimum validation                                                     |
| ----------------------------------- | ---------------------------------------------------------------------- |
| `src/lib/**` pure functions         | Targeted unit test (`pnpm test -- tests/lib/<name>.test.ts`)           |
| `src/components/**` or `src/app/**` | lint + test + manual browser check at localhost:3000                   |
| `src/db/schema.ts`                  | `pnpm drizzle-kit generate` + `pnpm drizzle-kit migrate` + `pnpm test` |
| `package.json` deps changed         | `pnpm install` + full lint + test + `pnpm build`                       |
| CSS / Tailwind only                 | Manual browser check                                                   |

If browser verification is not possible, report it explicitly in the Agent Output Contract under "Not verified".

## PR Requirements

- Each GitHub issue MUST have its own independent PR. Do NOT combine multiple issues into one PR.
- PR description MUST contain one line starting with `Issue Number:` and reference related issue(s) using `close #<id>` or `ref #<id>`.
- When issues have dependencies, merge them in order: merge the blocker PR first, then create the next PR based on updated main.
- Avoid force-push when possible; prefer follow-up commits and squash merge.

## Commit Style

- Concise, descriptive messages focused on what changed and why
- Format: `type: description` (e.g., `feat: add revision rollback`, `fix: edit conflict detection`)
- Do NOT leave PRs in draft unless explicitly asked
