---
name: create-pr
description: >
  Create Git branches, commits, pushes, and GitHub pull requests for CUpedia.
  Use when the user asks to create a branch, commit current changes, open a
  PR or draft PR, publish work, or recover from gh pr create issues.
  Covers branch naming, commit messages, PR body format, and pre-commit
  validation.
---

# Create PR

Use this skill when turning local work into a GitHub pull request.

## Workflow

1. Inspect the current state before mutating Git:

   ```bash
   git status --short
   git branch --show-current
   git diff -- <paths>
   ```

   Stage only files that belong to the requested change. Preserve unrelated
   user changes.

2. Create or confirm the branch:

   ```bash
   git switch -c feat/<short-topic>
   ```

   Branch naming:
   - `feat/<topic>` — New feature
   - `fix/<topic>` — Bug fix
   - `refactor/<topic>` — Code improvement
   - `docs/<topic>` — Documentation only

3. Validate before committing:

   ```bash
   pnpm lint
   pnpm test
   ```

   Fix any issues before proceeding.

4. Commit:

   ```bash
   git add <specific-files>
   git diff --cached --check
   git commit -m "type: concise description"
   ```

   Commit message format: `type: description`
   - `feat:` — New feature
   - `fix:` — Bug fix
   - `refactor:` — Code restructuring
   - `test:` — Adding/updating tests
   - `docs:` — Documentation changes

5. Push the branch:

   ```bash
   git push -u origin <branch>
   ```

6. Create the PR:

   ```bash
   gh pr create --base main --head <branch> --title "<title>" --body '<body>'
   ```

## PR Body

Match the PR template in `.github/pull_request_template.md`:

```markdown
## What?

<what changed>

## Why?

<why this is needed — link issues with `Fixes #number`>

## How?

<implementation approach, if non-obvious>

## Checklist

- [x] `pnpm lint` passes
- [x] `pnpm test` passes
- [ ] Tested in browser at `localhost:3000`
- [ ] DB changes include both `schema.ts` and generated migration
- [ ] No secrets or `.env` values committed
```

## Recovery

- If a PR may already exist, check before creating a duplicate:

  ```bash
  gh pr view --head <branch> --json url,isDraft,title 2>/dev/null
  ```

- If `gh pr create` fails, report that the branch is pushed and provide
  the exact command for the user to run manually.
