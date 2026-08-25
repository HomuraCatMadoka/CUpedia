# Verify a CUpedia change

Use targeted checks while developing, then run the Ready baseline before reporting completion. Hosted CI chooses additional jobs from the changed paths; [the CI topology](../ci-topology.md) documents that classification.

## Run WIP checks

List both modified tracked files and new untracked source files:

```bash
git diff --name-only --diff-filter=d HEAD -- '*.ts' '*.tsx' '*.mjs'
git ls-files --others --exclude-standard -- '*.ts' '*.tsx' '*.mjs'
```

Pass every relevant path from both lists to ESLint, then run the closest test file:

```bash
pnpm lint src/lib/search.ts tests/lib/search.test.ts
pnpm test tests/lib/search.test.ts
```

Change the example paths to the files in the current task. WIP checks support iteration; they do not replace the Ready baseline.

## Run the Ready baseline

Every completed task and pull request runs:

```bash
pnpm lint
pnpm test
pnpm typecheck
```

`pnpm typecheck` runs Next.js type generation before TypeScript. Use the package script instead of calling `tsc` directly.

## Add change-specific verification

| Change                            | Required addition                                                 |
| --------------------------------- | ----------------------------------------------------------------- |
| Pure function under `src/lib/**`  | Focused Vitest file                                               |
| Page or component                 | Manual browser check at `http://localhost:3000`                   |
| Authentication                    | Affected register, login, completion, and redirect flow           |
| API route                         | Browser or HTTP request against the real route                    |
| Database schema                   | Generate and apply the migration, then run focused database tests |
| Dependency or build configuration | `pnpm install` and `pnpm build`                                   |
| CSS or Tailwind                   | Affected desktop and mobile states                                |

Record any check that the environment cannot support in the completion report.

## Run end-to-end tests

Playwright provisions an isolated database before its server starts. It derives a database ending in `_e2e` from `DATABASE_URL`, migrates it, clears it, and loads fixtures. The development database remains untouched.

Start PostgreSQL and install the browsers once:

```bash
docker compose up -d --wait db
pnpm exec playwright install chromium webkit
```

Run the full suite or one feature file:

```bash
pnpm test:e2e
pnpm test:e2e e2e/wiki-read.spec.ts
```

Parallel worktrees must set a unique `E2E_DATABASE_URL`. The default production-mode Next.js build is the authoritative local path; set `E2E_SERVER_MODE=dev` only for faster debugging.

## Name Playwright specs by behavior

Use feature names such as `wiki-read.spec.ts`, `sidebar.spec.ts`, or `login-flow.spec.ts`. Use a shared prefix for a product area and a dot suffix for variants such as `wiki-edit.autosave.spec.ts`.

Keep issue traceability in the `test.describe` title or a `ref #number` file comment. Do not create `issue-number.spec.ts`; [ADR 0007](../adr/0007-e2e-tests-named-by-feature.md) records the naming decision.

## Preserve test evidence

Capture long output once when a suite is slow or noisy. Analyze that captured result before deciding whether another run is necessary. Playwright retains screenshots and traces on failure.
