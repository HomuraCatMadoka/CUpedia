# CUpedia agent guide

CUpedia is a Next.js 16 App Router platform for CUHK students. It contains several product domains, including Wiki, courses and professors, canteens, College Picker, Campus Transport, announcements, notifications, and product updates.

## Sources of truth

Use the repository itself as the authority:

- `package.json` defines runnable commands
- `.github/workflows/ci.yml` and `scripts/ci-classifier.mjs` define hosted CI gates
- `src/db/schema.ts` defines the current Drizzle schema
- `CONTEXT-MAP.md` and the relevant `CONTEXT.md` define domain language and boundaries
- `docs/adr/README.md` indexes accepted and proposed architectural decisions
- `docs/README.md` routes development, operations, research, and historical documentation

When prose conflicts with code or configuration, verify the live source and update stale prose when it is in scope.

## Load context by task

Read only the branch relevant to the task:

- **Domain behavior or terminology**: read `CONTEXT-MAP.md`, then the relevant `CONTEXT.md` and ADRs. Follow `docs/agents/domain.md`.
- **Local setup or environment**: read `docs/development/setup.md`.
- **Database or migration work**: read `docs/development/database.md` before editing `src/db/schema.ts` or migrations.
- **Tests, CI, or verification**: read `docs/development/testing.md`; use `docs/ci-topology.md` for hosted CI classification.
- **Wiki persistence, drafts, search, or assets**: read `docs/development/wiki.md` and its linked ADRs.
- **Issues, labels, or triage**: read `docs/agents/issue-tracker.md` and `docs/agents/triage-labels.md`.
- **Pull requests or publishing work**: use `$create-pr`.

## Repository map

Core paths are `src/app/`, `src/components/`, `src/lib/`, `src/db/`, `tests/`, `e2e/`, `scripts/`, and `docs/`.

Use `rg` or `rg --files` to locate code. For database questions, start with `src/db/schema.ts`; for authentication, start with `src/lib/auth.ts` and `src/lib/auth-guard.ts`; for a component, follow its import chain.

## Engineering guardrails

- Keep Server Components as the default. Add `"use client"` only when browser state or client hooks require it.
- Put server actions in `src/lib/*-actions.ts` with `"use server"`.
- Use kebab-case filenames, camelCase functions, PascalCase components, and the `@/` alias for `src/` imports.
- Reuse the repository's authentication guards. Enforce authorization on the server for every write path.
- Read email eligibility from `src/lib/email.ts`; do not copy domain rules into a new implementation.
- Preserve unrelated working-tree changes. Stage only files that belong to the requested issue.

## Change workflow

1. Inspect `git status --short`, the current branch, and the relevant diff before changing files.
2. Read the relevant context and decision documents.
3. Split the work into independently verifiable steps.
4. Run targeted WIP checks while iterating. Include both tracked changes and untracked source files; see `docs/development/testing.md`.
5. Run the Ready baseline before completion or a PR:

```bash
pnpm lint
pnpm test
pnpm typecheck
```

Add checks based on the change:

| Change                              | Additional verification                                                      |
| ----------------------------------- | ---------------------------------------------------------------------------- |
| `src/components/**` or `src/app/**` | Manual browser check at `http://localhost:3000`                              |
| Authentication                      | Complete the affected register, login, account-completion, and redirect flow |
| API route                           | Exercise the route with a browser or HTTP client                             |
| `src/db/schema.ts`                  | Generate and apply the migration, then run relevant database tests           |
| Dependencies or build configuration | `pnpm install` and `pnpm build`                                              |
| CSS or Tailwind                     | Check affected desktop and mobile states in a browser                        |

The Ready commands are the local completion baseline. Hosted CI may select a smaller or larger plan from the changed paths; `docs/ci-topology.md` explains that classification.

## Git and pull requests

- Create one independent PR per GitHub issue.
- In a worktree, keep the branch or another ref pointing to every needed commit. Remove the worktree only after the push or merge is confirmed.

## Completion report

Complete every task with these fields:

```text
Files: every file added, modified, or deleted
Ran: every lint, test, typecheck, build, or manual check and its pass/fail result
Not verified: anything not checked and the reason
```
