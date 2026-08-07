# CUpedia CLI & SKILL.md — Implementation Plan (v2)

> **For Hermes:** Use `subagent-driven-development` skill. Dispatch per batch; two-stage review (spec-compliance → code-quality) after each.

**Goal:** Package all CUpedia.org features into a zero-dependency Python CLI with auto-update, full auth module, and agent-universal SKILL.md.

**Date:** 2026-08-07 | **Status:** Plan (not started) | **Est. total:** ~10h

---

## 0. Architecture (from reconnaissance)

```
AI Agent (any) → cupedia CLI (Python, stdlib-only)
                    │  HTTPS + Bearer token
                    ▼
            /api/cli/*  (NEW Next.js Route Handlers — we build these)
                    │
                    ▼
            CUpedia DB / Services (existing)
```

**Discovered:** Only 2 REST endpoints exist (`/api/search`, `/api/canteens`). Everything else is Server Actions / RSC. **We build the API layer.**

---

## Phase 0 — Pre-Flight (gate, no subagents)

> **Can't start code until complete.** All tasks sequential, one actor.

| # | Task | What | Verify |
|---|------|------|--------|
| 0.1 | **Get repo access** | Clone CUpedia repo; confirm App Router layout | `ls src/app/api/` |
| 0.2 | **Inspect DB layer** | Find Prisma/Drizzle schema or CMS config | `ls prisma/schema.prisma` or `drizzle/` or CMS API keys |
| 0.3 | **Inspect existing auth** | NextAuth config, session strategy, password hashing | `grep -r 'NextAuth\|authOptions\|getServerSession' src/` |
| 0.4 | **Find college-picker logic** | Locate scoring algorithm + data source | `grep -r 'college-picker\|collegePicker\|分院帽' src/` |
| 0.5 | **Create feature branch** | `git checkout -b feature/cli-api && git push -u origin feature/cli-api` | remote has branch |
| 0.6 | **Negotiate `/api/cli/*` route group** | Confirm with maintainers, add `src/app/api/cli/` dir | maintainers approve |

### Subagent strategy: NONE. Single-threaded pre-flight. Blocking on 0.3–0.6 before any code.

---

## Phase 1 — Backend API Routes

### Subagent batch 1A: Infrastructure (serial, single agent)

> Foundation layer. No parallelization — all subsequent batches depend on these.

| # | Task | File(s) | Code/Commands | Verify |
|---|------|---------|---------------|--------|
| 1A.1 | Write CLI Zod schemas | `src/lib/validations/cli.ts` | All request/response types: `LoginSchema`, `SearchSchema`, `CanteenListSchema`, `CourseListSchema`, `CollegePickSchema`, `VoteSchema`, `ReviewSchema`, `MessageSchema`, `WikiSchema` (see references/API-schemas.md below) | `npx tsc --noEmit` |
| 1A.2 | Write JWT utilities | `src/lib/auth/jwt.ts` | `signAccessToken(user)`, `signRefreshToken(user)`, `verifyToken(token)`, `JWT_SECRET` from `process.env.CLI_JWT_SECRET` | Unit: `npx jest src/lib/auth/jwt.test.ts` |
| 1A.3 | Write rate limiter | `src/lib/rate-limit.ts` | In-memory `Map<ip, {count, resetAt}>`; `checkRateLimit(ip, maxRequests, windowMs)` → `{ allowed, remaining, resetAt }` | Unit test |
| 1A.4 | Write CLI API middleware | `src/middleware.ts` (add to existing) | Auth header extraction → attach `req.user`; rate-limit per path; audit log on POST/PUT/DELETE | `curl -H "Authorization: Bearer fake" /api/cli/auth/me` → 401 |
| 1A.5 | Add `CLI_JWT_SECRET` env | `.env.example` + Vercel dashboard | `CLI_JWT_SECRET=<random-64-char>` | `openssl rand -hex 32` → paste |
| 1A.6 | Commit infrastructure | `git add src/lib/validations/cli.ts src/lib/auth/jwt.ts src/lib/rate-limit.ts src/middleware.ts .env.example` | `git commit -m "feat(cli): add JWT auth, Zod schemas, rate limiter"` | `git push` |

### Subagent batch 1B: Auth Routes (leaf subagent)

> Independent of 1C/1D/1E. Runs after 1A.

| # | Task | File(s) | Verify |
|---|------|---------|--------|
| 1B.1 | `POST /api/cli/auth/login` | `src/app/api/cli/auth/login/route.ts` | `curl -X POST -d '{"email":"...","password":"..."}' .../api/cli/auth/login` → `{ access_token, refresh_token, user }` |
| 1B.2 | `POST /api/cli/auth/refresh` | `src/app/api/cli/auth/refresh/route.ts` | `curl -X POST -d '{"refresh_token":"..."}' .../refresh` → new access |
| 1B.3 | `POST /api/cli/auth/logout` | `src/app/api/cli/auth/logout/route.ts` | `curl -X POST -H "Authorization: Bearer ..." .../logout` → 200 |
| 1B.4 | `GET /api/cli/auth/me` | `src/app/api/cli/auth/me/route.ts` | `curl -H "Authorization: Bearer ..." .../me` → user object |
| 1B.5 | Auth integration tests | `tests/api/cli/auth.test.ts` | `npx jest tests/api/cli/auth.test.ts` |
| 1B.6 | Commit | `git add src/app/api/cli/auth/ tests/api/cli/auth.test.ts` | `git commit -m "feat(cli): auth routes (login/refresh/logout/me)" && git push` |

### Subagent batch 1C: Search + Wiki Routes (leaf subagent)

> Independent of 1B/1D/1E. Runs after 1A.

| # | Task | File(s) | Verify |
|---|------|---------|--------|
| 1C.1 | `GET /api/cli/search` | `src/app/api/cli/search/route.ts` | `curl ".../api/cli/search?q=math&type=course"` → `{ results, total }` |
| 1C.2 | `GET /api/cli/wiki/[slug]` | `src/app/api/cli/wiki/[slug]/route.ts` | `curl ".../api/cli/wiki/讨新亚檄文"` → `{ slug, title, content }` |
| 1C.3 | Tests | `tests/api/cli/search.test.ts`, `tests/api/cli/wiki.test.ts` | `npx jest tests/api/cli/search.test.ts` |
| 1C.4 | Commit | `git add src/app/api/cli/search/ src/app/api/cli/wiki/ tests/api/cli/` | `git commit -m "feat(cli): search and wiki routes" && git push` |

### Subagent batch 1D: Canteen Routes (leaf subagent)

> Independent of 1B/1C/1E. Runs after 1A.

| # | Task | File(s) | Verify |
|---|------|---------|--------|
| 1D.1 | `GET /api/cli/canteens` | `src/app/api/cli/canteens/route.ts` | `curl .../api/cli/canteens` → `{ canteens: [...] }` |
| 1D.2 | `GET /api/cli/canteens/[id]` | `src/app/api/cli/canteens/[id]/route.ts` | `curl .../api/cli/canteens/<uuid>` → detail + menu by meal period |
| 1D.3 | `GET /api/cli/canteens/[id]/dishes` | `src/app/api/cli/canteens/[id]/dishes/route.ts` | `?meal=午餐&category=饭类` → filtered |
| 1D.4 | `GET /api/cli/canteens/shit-rank` | `src/app/api/cli/canteens/shit-rank/route.ts` | `?period=today` → ranking |
| 1D.5 | `POST /api/cli/canteens/[id]/vote` | `src/app/api/cli/canteens/[id]/vote/route.ts` | Auth required; `{ dishId, vote: "up" }` |
| 1D.6 | `POST /api/cli/canteens/[id]/shit-vote` | `src/app/api/cli/canteens/[id]/shit-vote/route.ts` | Auth required; `{ canteenId }` |
| 1D.7 | `GET/POST /api/cli/canteens/[id]/messages` | `src/app/api/cli/canteens/[id]/messages/route.ts` | GET = list, POST = send (auth) |
| 1D.8 | Tests | `tests/api/cli/canteens.test.ts` | `npx jest tests/api/cli/canteens.test.ts` |
| 1D.9 | Commit | `git add src/app/api/cli/canteens/ tests/api/cli/canteens.test.ts` | `git commit -m "feat(cli): canteen routes (list/detail/dishes/vote/shit-rank/messages)" && git push` |

### Subagent batch 1E: Course + Professor Routes (leaf subagent)

> Independent of 1B/1C/1D. Runs after 1A.

| # | Task | File(s) | Verify |
|---|------|---------|--------|
| 1E.1 | `GET /api/cli/courses` | `src/app/api/cli/courses/route.ts` | `?page=1&limit=48&subject=UGFN&sort=popular&q=math` |
| 1E.2 | `GET /api/cli/courses/[code]` | `src/app/api/cli/courses/[code]/route.ts` | Detail: name, credits, description, avg score, review count, stats |
| 1E.3 | `GET /api/cli/courses/[code]/reviews` | `src/app/api/cli/courses/[code]/reviews/route.ts` | `?professor=Dr.+NG&limit=10&offset=0` |
| 1E.4 | `POST /api/cli/courses/[code]/review` | `src/app/api/cli/courses/[code]/review/route.ts` | Auth; `{ rating: 1-5, content, professorId }` |
| 1E.5 | `GET /api/cli/professors` | `src/app/api/cli/professors/route.ts` | `?course=UGFN1000` |
| 1E.6 | `GET /api/cli/professors/[id]` | `src/app/api/cli/professors/[id]/route.ts` | Detail + courses taught |
| 1E.7 | `GET /api/cli/courses/my-reviews` | `src/app/api/cli/courses/my-reviews/route.ts` | Auth; current user's reviews |
| 1E.8 | `GET /api/cli/courses/my-achievements` | `src/app/api/cli/courses/my-achievements/route.ts` | Auth; badges |
| 1E.9 | Tests | `tests/api/cli/courses.test.ts` | `npx jest tests/api/cli/courses.test.ts` |
| 1E.10 | Commit | `git add src/app/api/cli/courses/ src/app/api/cli/professors/ tests/` | `git commit -m "feat(cli): course + professor routes" && git push` |

### Subagent batch 1F: College Picker Routes (leaf subagent)

> Independent of 1B/1C/1D/1E. Runs after 1A, but needs 0.4 result (algorithm).

| # | Task | File(s) | Verify |
|---|------|---------|--------|
| 1F.1 | `GET /api/cli/college-picker/config` | `src/app/api/cli/college-picker/config/route.ts` | Returns available majors, factors (通勤/保宿/住宿环境), avoid factors |
| 1F.2 | `POST /api/cli/college-picker/recommend` | `src/app/api/cli/college-picker/recommend/route.ts` | Body → scoring → ranked 9 colleges with reasons |
| 1F.3 | Tests | `tests/api/cli/college-picker.test.ts` | Verify known major/choices → expected ranking order |
| 1F.4 | Commit | `git add src/app/api/cli/college-picker/ tests/` | `git commit -m "feat(cli): college picker routes" && git push` |

### Phase 1 Subagent Dispatch Plan

```
Phase 0 (serial, gate)
    │
Phase 1A (serial, infrastructure)
    │
    ├── Subagent B: Auth (1B.1–1B.6)      ← dispatch NOW
    ├── Subagent C: Search+Wiki (1C.1–1C.4) ← dispatch NOW  (parallel with B)
    ├── Subagent D: Canteen (1D.1–1D.9)    ← dispatch NOW  (parallel with B)
    ├── Subagent E: Courses (1E.1–1E.10)   ← dispatch NOW  (parallel with B)
    └── Subagent F: College-Picker (1F.1–1F.4) ← dispatch NOW (parallel with B)
    
    ALL must complete → review → Phase 2
```

**Max concurrency: 3 subagents** (per user config). Dispatch B+C+D first; when one finishes, dispatch E; when another finishes, dispatch F.

---

## Phase 2 — CLI Core (Python, stdlib-only)

### Phase 2A: Project Scaffold + `install.sh` (serial, single agent)

| # | Task | File(s) | Verify |
|---|------|---------|--------|
| 2A.1 | Create project skeleton | `cupedia`, `cupedia_cli/__init__.py`, `cupedia_cli/__main__.py`, `cupedia_cli/commands/__init__.py` | `python3 cupedia --help` shows stub |
| 2A.2 | Write `.gitignore` | `.gitignore` | `git status` clean except scaffold |
| 2A.3 | Write `install.sh` | `install.sh` | Follow `cli-install-update-scripts` skill: 3 modes (install/update/uninstall), `--prefix`/`--user`, `.install-meta`, `find_python` with fallback paths, macOS bash 3.2 safe (`${VAR}` before CJK), shebang rewrite |
| 2A.4 | `bash -n install.sh` | Syntax check | `bash -n install.sh` exit 0 |
| 2A.5 | Install to temp prefix | `bash install.sh --prefix /tmp/cupedia-test` | `.install-meta` written, `cupedia` symlink exists |
| 2A.6 | `--update` detects temp location | `bash install.sh --prefix /tmp/cupedia-test --update` | Reinstalls to same prefix |
| 2A.7 | `--update` without install dies | `rm -rf /tmp/cupedia-test && bash install.sh --update` | Exit 1, guidance printed |
| 2A.8 | `--uninstall` clean | `bash install.sh --prefix /tmp/cupedia-test --uninstall` | Symlink + dir gone, prefix dir remains |
| 2A.9 | Commit scaffold | `git add cupedia cupedia_cli/ install.sh .gitignore` | `git commit -m "feat: project scaffold + install.sh" && git push` |

### Phase 2B: Core Library Layer (serial — each task depends on previous)

| # | Task | File(s) | Code outline | Verify |
|---|------|---------|-------------|--------|
| 2B.1 | `config.py` | `cupedia_cli/config.py` | `CONFIG_DIR = Path.home() / '.cupedia'`; `Config` dataclass with `api_base`, `output`, `color`, `auto_update`; `load_config()` / `save_config()`; defaults; create dir if missing | `python3 -c "from cupedia_cli.config import load_config; print(load_config().api_base)"` |
| 2B.2 | `output.py` | `cupedia_cli/output.py` | `print_table(headers, rows)`, `print_json(data)`, `format_result(data, output_mode)`, `color_support()`, `AGENT_MODE = not sys.stdin.isatty() or os.environ.get('CUPEDIA_AGENT')` | `python3 -c "from cupedia_cli.output import print_table; print_table(['A','B'], [['1','2']])"` |
| 2B.3 | `api.py` | `cupedia_cli/api.py` | `ApiClient` class: `__init__(base_url, token=None)`, `get(path, params)`, `post(path, data)`, error handling (401 → auto-refresh; 429 → retry-after; 5xx → retry 2x), `timeout=30` | `python3 -c "from cupedia_cli.api import ApiClient; c=ApiClient('https://cupedia.org/api/cli'); r=c.get('/canteens'); print(len(r['canteens']))"` |
| 2B.4 | `auth.py` | `cupedia_cli/auth.py` | `AUTH_FILE = CONFIG_DIR / 'auth.json'` (0600); `load_auth()`, `save_auth(access, refresh, user)`, `clear_auth()`, `login_flow(email, password, api_client)`, `refresh_flow(api_client)` | `python3 -c "from cupedia_cli.auth import load_auth; print(load_auth())"` |
| 2B.5 | `update.py` | `cupedia_cli/update.py` | `AUTO_UPDATE` env parse (unset/anything=on; `0/false/no/off/n/disabled`=off); first-run-of-day marker at `~/.cache/cupedia/last-auto-update`; `check_and_update()`: detect layout from `__file__` (installed vs repo), delegate to install.sh or `git pull --ff-only`; all stdout→stderr; `check_and_update` returns `True/False` (whether updated) | `python3 cupedia version` → no update loop |
| 2B.6 | `utils.py` | `cupedia_cli/utils.py` | `die(msg, code=1)`, `warn(msg)`, `confirm(msg)` (TTY-guarded), `pick(options, prompt)` | `python3 -c "from cupedia_cli.utils import die; die('test', 2)"` → exit 2 |
| 2B.7 | Commit core layer | `git add cupedia_cli/config.py cupedia_cli/output.py cupedia_cli/api.py cupedia_cli/auth.py cupedia_cli/update.py cupedia_cli/utils.py` | `git commit -m "feat: core library layer (config/output/api/auth/update/utils)" && git push` |

### Phase 2C: CLI Dispatch (serial, depends on 2B)

| # | Task | File(s) | Verify |
|---|------|---------|--------|
| 2C.1 | Write `cli.py` (argparse dispatch) | `cupedia_cli/cli.py` | Subparsers: `search`, `canteen`, `course`, `college-pick`, `wiki`, `auth`, `config`, `update`. Global flags: `--json`, `--color`, `--no-update`, `--version`. Import and dispatch to command modules. | `python3 cupedia --help` shows all commands |
| 2C.2 | Wire `__main__.py` | `cupedia_cli/__main__.py` | `from cupedia_cli.cli import main; main()` | `python3 -m cupedia_cli --help` |
| 2C.3 | Wire `cupedia` entry script | `cupedia` | Shebang, `from cupedia_cli.cli import main; main()`, `AUTO_UPDATE` guard before dispatch | `python3 cupedia --version` |
| 2C.4 | Commit dispatch | `git add cupedia_cli/cli.py cupedia_cli/__main__.py cupedia` | `git commit -m "feat: CLI dispatch + arg parsing" && git push` |

### Phase 2D: Command Modules (parallel subagents)

> All commands depend on 2B+2C (core + dispatch). Commands are independent of each other.

#### Subagent D1: Search + Wiki Commands

| # | Task | File(s) | Verify |
|---|------|---------|--------|
| 2D1.1 | `search` command | `cupedia_cli/commands/search.py` | `def search(args, api, config):` — call `api.get('/search', params)`, format output | `python3 cupedia search "math" --json` |
| 2D1.2 | `wiki` command | `cupedia_cli/commands/wiki.py` | `def wiki(args, api, config):` — call `api.get('/wiki/<slug>')`, print content | `python3 cupedia wiki 讨新亚檄文` |
| 2D1.3 | Commit | `git add cupedia_cli/commands/search.py cupedia_cli/commands/wiki.py` | `git commit -m "feat: search + wiki commands" && git push` |

#### Subagent D2: Canteen Commands

| # | Task | File(s) | Verify |
|---|------|---------|--------|
| 2D2.1 | `canteen list` | `cupedia_cli/commands/canteen.py` | Table of 15 canteens (name, location) | `python3 cupedia canteen list` |
| 2D2.2 | `canteen show <id>` | Same file | Detail + menu tabs (breakfast/lunch/dinner × categories) | `python3 cupedia canteen show uc-can --meal 午餐` |
| 2D2.3 | `canteen search <dish>` | Same file | Cross-canteen dish search | `python3 cupedia canteen search "咖喱"` |
| 2D2.4 | `canteen shit-rank` | Same file | 💩 ranking table | `python3 cupedia canteen shit-rank` |
| 2D2.5 | `canteen vote` (auth) | Same file | POST vote; requires auth | `CUPEDIA_TOKEN=x cupedia canteen vote uc-can "三餸飯" up` |
| 2D2.6 | `canteen shit-vote` (auth) | Same file | POST shit-vote | `CUPEDIA_TOKEN=x cupedia canteen shit-vote shho-can` |
| 2D2.7 | `canteen messages` | Same file | GET list / POST --send (auth) | `cupedia canteen messages uc-can` |
| 2D2.8 | Commit | `git add cupedia_cli/commands/canteen.py` | `git commit -m "feat: canteen commands (list/show/search/vote/shit-rank/messages)" && git push` |

#### Subagent D3: Course Commands

| # | Task | File(s) | Verify |
|---|------|---------|--------|
| 2D3.1 | `course list` | `cupedia_cli/commands/course.py` | Paginated table: code, name, credits, score, review count | `python3 cupedia course list --subject CSCI` |
| 2D3.2 | `course show <code>` | Same file | Detail: name, credits, terms, description, score, stats | `python3 cupedia course show UGFN1000 --json` |
| 2D3.3 | `course reviews <code>` | Same file | Filterable by professor, paginated | `python3 cupedia course reviews UGFN1000 --professor "Dr. NG"` |
| 2D3.4 | `course review <code>` (auth) | Same file | POST review; `--rating 1-5 --content "..."` | `CUPEDIA_TOKEN=x cupedia course review UGFN1000 --rating 4 --content "good"` |
| 2D3.5 | `course professors <code>` | Same file | List professors for course | `python3 cupedia course professors UGFN1000` |
| 2D3.6 | `course my-reviews` (auth) | Same file | User's reviews | `CUPEDIA_TOKEN=x cupedia course my-reviews` |
| 2D3.7 | `course achievements` (auth) | Same file | Badges | `CUPEDIA_TOKEN=x cupedia course achievements` |
| 2D3.8 | Commit | `git add cupedia_cli/commands/course.py` | `git commit -m "feat: course commands (list/show/reviews/review/professors/my)" && git push` |

#### Subagent D4: College Picker + Auth CLI + Config CLI

| # | Task | File(s) | Verify |
|---|------|---------|--------|
| 2D4.1 | `college-pick` command | `cupedia_cli/commands/college_picker.py` | Interactive wizard (TTY) or non-interactive (`--major --small-college --factors --avoid`); POST to `/college-picker/recommend`; display ranked table | `python3 cupedia college-pick --major 工科 --small-college C --avoid 宗教元素 --json` |
| 2D4.2 | `auth login` command | `cupedia_cli/commands/auth_cmd.py` | TTY: prompt email + `getpass` password; `--email` + `CUPEDIA_PASSWORD` env for non-TTY; `--token` for JWT direct; store to `auth.json` | `python3 cupedia auth login` (TTY) |
| 2D4.3 | `auth logout/whoami/status` | Same file | logout→clear; whoami→GET /me; status→check token validity | `python3 cupedia auth whoami` |
| 2D4.4 | `config show/set/reset` | `cupedia_cli/commands/config_cmd.py` | `show` prints table; `set key value` writes; `reset` → defaults | `python3 cupedia config set color always` |
| 2D4.5 | Commit | `git add cupedia_cli/commands/college_picker.py cupedia_cli/commands/auth_cmd.py cupedia_cli/commands/config_cmd.py` | `git commit -m "feat: college-picker, auth CLI, config CLI commands" && git push` |

### Phase 2 Subagent Dispatch Plan

```
Phase 2A (scaffold + install.sh) → serial
Phase 2B (core library layer) → serial
Phase 2C (CLI dispatch) → serial
    │
    ├── Subagent D1: Search+Wiki   ← dispatch NOW
    ├── Subagent D2: Canteen       ← dispatch NOW (parallel)
    ├── Subagent D3: Courses       ← dispatch NOW (parallel)
    └── Subagent D4: College+Auth+Config ← after one finishes
    
    ALL must complete → review → Phase 3
```

---

## Phase 3 — Documentation + SKILL.md (parallel subagents)

### Subagent 3A: SKILL.md

| # | Task | File(s) | Verify |
|---|------|---------|--------|
| 3A.1 | Write SKILL.md frontmatter | `SKILL.md` | `name: cupedia`, `description: ≤60 chars`, trigger words first, period-terminated |
| 3A.2 | Write Quick Start section | Same file | Install, auth, first command examples for agent |
| 3A.3 | Write full command reference | Same file | Every command + flags + examples; `--json` noted on each |
| 3A.4 | Write Auth section | Same file | `CUPEDIA_TOKEN` env, `cupedia auth login`, token storage path |
| 3A.5 | Write Common Errors table | Same file | 6-8 entries: 401, connection refused, not found, rate limited, etc. |
| 3A.6 | Write Agent Examples section | Same file | 5-8 copy-pasteable bash one-liners with `--json` + `jq` |
| 3A.7 | Commit | `git add SKILL.md` | `git commit -m "docs: SKILL.md for agent integration" && git push` |

### Subagent 3B: README + AGENTS.md

| # | Task | File(s) | Verify |
|---|------|---------|--------|
| 3B.1 | Write README.md (EN) | `README.md` | Project overview, install, quick-start, command tree, auth, agent use, directory structure |
| 3B.2 | Write README.zh-CN.md | `README.zh-CN.md` | Full ZH translation; mutual link at top: `[English](README.md)` / `[简体中文](README.zh-CN.md)` |
| 3B.3 | Write AGENTS.md | `AGENTS.md` | Constraints: PR-only workflow, no `git add .`, conventional commits, commit→push, zero fabrication, shared repo rules |
| 3B.4 | Symlink CLAUDE.md | `CLAUDE.md` | `ln -sf AGENTS.md CLAUDE.md` |
| 3B.5 | Write LICENSE | `LICENSE` | MIT, year 2026 |
| 3B.6 | Commit | `git add README.md README.zh-CN.md AGENTS.md CLAUDE.md LICENSE` | `git commit -m "docs: README (EN+ZH), AGENTS.md, LICENSE" && git push` |

---

## Phase 4 — Integration Testing & Polish (serial, single agent)

| # | Task | Commands | Verify |
|---|------|----------|--------|
| 4.1 | Full install cycle | `bash install.sh --user`, `which cupedia`, `cupedia --version` | Symlink exists, version prints |
| 4.2 | `--update` flow | `cupedia update`, `bash install.sh --update` | Both workflows succeed |
| 4.3 | Auto-update smoke test | `CUPEDIA_AGENT=true cupedia search "test"` with stale marker | Update runs, output is clean JSON |
| 4.4 | Agent-mode test (all read cmds) | `CUPEDIA_AGENT=true cupedia canteen list --json \| python3 -m json.tool` | Valid JSON, no stderr noise |
| 4.5 | Auth flow | `cupedia auth login` → `cupedia auth whoami` → `cupedia auth logout` | Full cycle |
| 4.6 | College picker non-interactive | `cupedia college-pick --major 工科 --small-college C --factors 上课通勤,, --json` | Valid JSON, 9 colleges ranked |
| 4.7 | Error handling | `cupedia course show NOSUCHCODE` | Clean error message, exit 1 |
| 4.8 | `--help` on every subcommand | `for cmd in search canteen course college-pick wiki auth config update; do cupedia $cmd --help; done` | All print help, exit 0 |
| 4.9 | Commit fixes | `git add ...` (any fixes from 4.1–4.8) | `git commit -m "fix: integration test fixes" && git push` |

---

## Phase 5 — Publish (serial, single agent)

| # | Task | Commands | Verify |
|---|------|----------|--------|
| 5.1 | Create GitHub repo | `gh repo create mrtsels/cupedia-cli --public --description "CUpedia CLI: CUHK course, canteen, and college recommendation from terminal"` | `gh repo view --json url` |
| 5.2 | Push to public repo | `git remote add public git@github.com:mrtsels/cupedia-cli.git; git push public main` | Repo visible |
| 5.3 | Clone to Hermes skill dir | `git clone https://github.com/mrtsels/cupedia-cli.git ~/.agents/skills/coding/cupedia` | `skill_view(name='cupedia')` works |
| 5.4 | Open PR on shared CUpedia repo | `gh pr create --base main --head feature/cli-api --title "feat: CLI API routes (/api/cli/*)" --body "Implements #X. See cupedia-cli for the CLI tool."` | PR visible, linked to issue |
| 5.5 | Verify end-to-end | `CUPEDIA_TOKEN=x cupedia search "nature" --json` against production API | Valid results |

---

## Subagent Execution Rules

1. **Isolation**: Each subagent gets full context (file paths, expected API shapes, skill references in `references/`)
2. **Review**: Two-stage per batch: (a) spec compliance — does output match plan? (b) code quality — edge cases, error handling, TTY safety
3. **Parallel limit**: Max 3 concurrent subagents (user config). Dispatch B/C/D first; E/F queue.
4. **Parent verification**: After subagent reports "done", parent must `curl`/`python3` verify before marking complete. Never trust self-reports.
5. **Commit discipline**: Subagent commits per task group, pushes to `feature/cli-api` branch. Parent does not commit on behalf of subagent.

---

## Total Task Count

| Phase | Tasks | Subagents | Parallel? |
|-------|-------|-----------|-----------|
| 0 Pre-flight | 6 | 0 (gate) | No |
| 1A Infrastructure | 6 | 0 | No |
| 1B Auth routes | 6 | 1 leaf | Yes (with C/D) |
| 1C Search+Wiki | 4 | 1 leaf | Yes (with B/D) |
| 1D Canteen routes | 9 | 1 leaf | Yes (with B/C) |
| 1E Course routes | 10 | 1 leaf | Yes (after B/C/D) |
| 1F College picker | 4 | 1 leaf | Yes (after B/C/D) |
| 2A Scaffold | 9 | 0 | No |
| 2B Core lib | 7 | 0 | No |
| 2C Dispatch | 4 | 0 | No |
| 2D1 Search+Wiki cmds | 3 | 1 leaf | Yes (with D2/D3) |
| 2D2 Canteen cmds | 8 | 1 leaf | Yes (with D1/D3) |
| 2D3 Course cmds | 8 | 1 leaf | Yes (with D1/D2) |
| 2D4 College+Auth+Config | 5 | 1 leaf | Yes (after D1/D2/D3) |
| 3A SKILL.md | 7 | 1 leaf | Yes (with 3B) |
| 3B README+AGENTS | 6 | 1 leaf | Yes (with 3A) |
| 4 Testing | 9 | 0 | No |
| 5 Publish | 5 | 0 | No |
| **Total** | **116** | **10 subagent dispatches** | Max 3 concurrent |

---

## API Schema Reference (for Phase 1 subagents)

### Auth
```
POST /api/cli/auth/login
  Body:   { email: string, password: string }
  → 200:  { access_token: string, refresh_token: string, user: { id, email, name } }
  → 401:  { error: "invalid_credentials" }
  → 429:  { error: "rate_limited", retry_after: number }

POST /api/cli/auth/refresh
  Body:   { refresh_token: string }
  → 200:  { access_token: string }
  → 401:  { error: "invalid_refresh_token" }

POST /api/cli/auth/logout
  Header: Authorization: Bearer <access_token>
  → 200:  { success: true }

GET /api/cli/auth/me
  Header: Authorization: Bearer <access_token>
  → 200:  { id, email, name, createdAt }
```

### Search
```
GET /api/cli/search?q=keyword&limit=10&type=article|canteen|course
  → 200: { results: [{ id, title, snippet, type }], total: number }
```

### Canteen
```
GET /api/cli/canteens
  → 200: { canteens: [{ id, name, location, announcement }] }

GET /api/cli/canteens/:id?meal=午餐
  → 200: { id, name, location, menu: { 早餐: {}, 午餐: { 饭类: [{ id, name, price, upvotes, downvotes }] }, 晚餐: {} } }

POST /api/cli/canteens/:id/vote  (auth)
  Body:   { dishId: string, vote: "up"|"down" }
  → 200:  { success: true, newUpvotes: number, newDownvotes: number }
```

### Course
```
GET /api/cli/courses?page=1&limit=48&subject=CSCI&sort=popular&q=algo
  → 200: { courses: [{ code, name, credits, score, reviewCount }], total: 9018, page: 1, totalPages: 188 }

GET /api/cli/courses/:code
  → 200: { code, name, credits, terms: [], description, score, reviewCount, stats: {} }

GET /api/cli/courses/:code/reviews?professor=&limit=10&offset=0
  → 200: { reviews: [{ id, user, rating, content, professor, createdAt, upvotes }], total }

POST /api/cli/courses/:code/review  (auth)
  Body:   { rating: 1-5, content: string, professorId?: string }
  → 201:  { id, ... }
```

### College Picker
```
GET /api/cli/college-picker/config
  → 200: { majors: ["工科","理科",...], factors: ["上课通勤","保宿机会","住宿环境"], extras: ["离港铁距离","par房"], avoid: ["FYP","宗教","面试","视频","笔试"] }

POST /api/cli/college-picker/recommend
  Body:   { smallCollege: "A"|"B"|"C", major: string, factors: [string,null,null], extras: string[], avoid: string[] }
  → 200:  { rankings: [{ college, score, reason }], metadata: { note: "非官方 · 仅供参考" } }
```
