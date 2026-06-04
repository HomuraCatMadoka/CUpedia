# Contributing to CUpedia

Thanks for your interest in contributing!

New here? Look for issues labelled
[`good first issue`](https://github.com/HomuraCatMadoka/CUpedia/labels/good%20first%20issue)
or [`help wanted`](https://github.com/HomuraCatMadoka/CUpedia/labels/help%20wanted).

## Getting Started

Prerequisites: Docker, Node, and pnpm.

1. [Fork the repo](https://github.com/HomuraCatMadoka/CUpedia/fork) on GitHub, then clone your fork:

   ```bash
   git clone https://github.com/YOUR_USERNAME/CUpedia.git
   cd CUpedia
   ```

2. Install dependencies and run the one-command setup:

   ```bash
   pnpm install
   pnpm bootstrap   # writes .env.local, starts docker, creates the bucket, migrates, seeds
   ```

   `pnpm bootstrap` is idempotent — safe to re-run any time. See
   [AGENTS.md](AGENTS.md) for what each step does and how to reset the stack.

3. Start the dev server:

   ```bash
   pnpm dev
   ```

4. Open http://localhost:3000 and sign in with a seed account
   (`admin@test.com` / `password123`).

## Making Changes

1. Create a branch from `main`:

   ```bash
   git switch -c feat/my-feature
   ```

2. Make your changes. See [AGENTS.md](AGENTS.md) for project structure, coding
   conventions, and the per-change validation matrix.

3. Verify before committing (the **Ready** profile — all must pass):

   ```bash
   pnpm lint
   pnpm test
   pnpm tsc --noEmit
   ```

   If you changed pages or components, also check the browser at
   `localhost:3000`. For end-to-end flows, run `pnpm test:e2e` (one-time setup:
   `pnpm exec playwright install chromium`).

4. Commit using [Conventional Commits](https://www.conventionalcommits.org)
   (`type: description`, e.g. `feat: add revision rollback`,
   `fix: edit conflict detection`). Common types: `feat`, `fix`, `perf`,
   `refactor`, `docs`, `test`, `chore`, `ci`.

5. Push to your fork and open a PR against `main`.

## Proposing New Features

**Small bug fixes can go straight to a PR** (still reference an issue — see below).
For new features, please open a
[Feature Request Discussion](https://github.com/HomuraCatMadoka/CUpedia/discussions/new?category=ideas)
first. This lets us validate the idea, agree on scope and approach, and avoid
duplicate work. Once accepted, reference the discussion in your PR.

## Pull Request Requirements

- **One issue per PR.** Each GitHub issue gets its own independent PR — don't
  bundle multiple issues together.
- **Reference the issue.** The PR description must contain a line starting with
  `Issue Number:` and link the issue with `close #<id>` (or `ref #<id>` when it
  doesn't fully resolve it).
- **Order dependent work.** When issues depend on each other, merge the blocker
  PR first, then branch the next PR off the updated `main`.
- **Prefer follow-up commits over force-push.** PRs are squash-merged, so a
  messy intermediate history is fine.
- Fill in the PR template checklist (lint / test / browser / DB migration / no secrets).

## Guidelines

- Follow the existing code style (ESLint + Prettier, enforced via the pre-commit hook).
- Server Components by default; `"use client"` only when necessary.
- All wiki mutations go through `src/lib/wiki-actions.ts`.
- DB schema changes must commit both `src/db/schema.ts` and the generated
  migration (`pnpm drizzle-kit generate`). Never edit migration files by hand,
  and never use `drizzle-kit push`.
- Don't commit `.env` files or secrets.

## Reporting Bugs & Security Issues

- **Bugs:** open an [issue](https://github.com/HomuraCatMadoka/CUpedia/issues/new/choose) using the bug report template.
- **Security vulnerabilities:** do **not** open a public issue — see [SECURITY.md](SECURITY.md).

## Questions?

Open a [Discussion](https://github.com/HomuraCatMadoka/CUpedia/discussions) if
you have questions or want to propose ideas before coding.
