# Contribute to CUpedia

This guide takes a contribution from local setup through a pull request. New contributors can start with [`good first issue`](https://github.com/HomuraCatMadoka/CUpedia/labels/good%20first%20issue) or [`help wanted`](https://github.com/HomuraCatMadoka/CUpedia/labels/help%20wanted).

## Set up your fork

Use Node.js 20, pnpm 10, and Docker with Docker Compose.

1. [Fork CUpedia](https://github.com/HomuraCatMadoka/CUpedia/fork), then clone your fork:

   ```bash
   git clone https://github.com/your_github_username/CUpedia.git
   cd CUpedia
   git remote add upstream https://github.com/HomuraCatMadoka/CUpedia.git
   ```

2. Install dependencies and bootstrap the local services:

   ```bash
   pnpm install
   pnpm bootstrap
   ```

3. Start the development server:

   ```bash
   pnpm dev
   ```

4. Open `http://localhost:3000` and sign in with `admin@test.com` and `password123`.

`pnpm bootstrap` is safe to repeat and preserves an existing `.env.local`. The [local setup guide](docs/development/setup.md) explains its services, fixtures, environment variables, and destructive reset command.

## Prepare a change

1. Choose or create one GitHub issue. Each issue gets an independent pull request.
2. Update `main`, then create a focused branch. Prefix it with the change kind, such as `feat/`, `fix/`, `refactor/`, or `docs/`:

   ```bash
   git fetch upstream
   git switch main
   git merge --ff-only upstream/main
   git switch -c feat/short-topic
   ```

3. Read the relevant entry in the [documentation index](docs/README.md). For domain behavior, start with the [context map](CONTEXT-MAP.md).
4. Make the smallest change that satisfies the issue and preserve unrelated working-tree changes.
5. Run the Ready baseline:

   ```bash
   pnpm lint
   pnpm test
   pnpm typecheck
   ```

6. Add the checks required by the change. Pages and components need a browser check; database changes need migration and focused database verification; dependency or build changes need `pnpm build`. The [testing guide](docs/development/testing.md) contains the complete matrix.

## Commit and open the pull request

Use a concise Conventional Commit in `type: description` form. Common types are `feat`, `fix`, `perf`, `refactor`, `docs`, `test`, `chore`, and `ci`.

Push the branch to your fork and open a pull request against `main`. Complete the repository template, including a line that starts with `Issue Number:` and uses `close #number` or `ref #number`.

Pull requests follow these rules:

- Keep one issue per PR; merge a dependency before branching its dependent work from the updated `main`
- Prefer follow-up commits to force pushes; the repository squash-merges PRs
- Explain any skipped browser, database, build, or environment check
- Keep secrets and `.env` values out of commits, logs, issues, and PR descriptions

## Follow the engineering boundaries

- Use Server Components by default and add `"use client"` only for browser state or client hooks.
- Route Wiki public mutations through `src/lib/wiki-actions.ts` and private page draft mutations through `src/lib/wiki-draft-actions.ts`.
- For schema changes, follow the [database workflow](docs/development/database.md), commit the schema and new migration together, and use `migrate` rather than `push`.
- Treat committed migrations as immutable. Put SQL outside Drizzle's schema model in a new custom migration.
- Follow the existing ESLint and Prettier configuration. The pre-commit hook formats and lints supported staged files.

## Propose a feature

Small fixes still need an issue reference, but they can pair a concise issue with an immediate PR. For a new feature, open a [Feature Request Discussion](https://github.com/HomuraCatMadoka/CUpedia/discussions/new?category=ideas) first so maintainers can agree on the problem, scope, and domain boundary.

## Report bugs and security issues

- Report a bug with the [issue chooser](https://github.com/HomuraCatMadoka/CUpedia/issues/new/choose).
- Report a vulnerability privately by following [SECURITY.md](SECURITY.md); do not publish vulnerability details in an issue, discussion, or PR.

Use [GitHub Discussions](https://github.com/HomuraCatMadoka/CUpedia/discussions) for questions that do not yet have a bounded implementation task.
