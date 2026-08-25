---
name: create-pr
description: >
  Create and publish CUpedia pull requests. Use when the user asks to create a
  branch, commit or push changes, open a PR or draft PR, publish work, or
  recover from a failed gh pr create command.
---

# Create a pull request

Complete only the Git mutations the user requested. Branch creation does not imply permission to commit, push, or open a PR.

Follow `CONTRIBUTING.md` for repository policy and `.github/pull_request_template.md` for the current PR body. This skill is the executable workflow.

## Workflow

1. Inspect the current state before mutating Git:

   ```bash
   git status --short
   git branch --show-current
   git diff HEAD -- path/to/file
   git ls-files --others --exclude-standard
   ```

   Open every in-scope untracked file before staging it. Stage only files that
   belong to the requested change and preserve unrelated user changes.

2. Confirm the current focused branch, or create one from the latest remote `main` using the naming guidance in `CONTRIBUTING.md`. Do not recreate a branch that already exists.

   ```bash
   git fetch origin main
   git switch --no-track -c docs/short-topic origin/main
   ```

3. Validate before committing:

   ```bash
   pnpm lint
   pnpm test
   pnpm typecheck
   ```

4. Commit:

   ```bash
   git add path/to/file
   git diff --cached --name-status
   git diff --cached
   git diff --cached --check
   git commit -m "type: concise description"
   ```

5. Push the branch:

   ```bash
   git push -u origin branch_name
   ```

6. Read `.github/pull_request_template.md`, preserve its headings and checklist, and fill it with the current change. The first line must start with `Issue Number:` and use `close #number` when the PR completes the issue or `ref #number` otherwise. Mark a verification item complete only when that exact check passed; explain anything not applicable or not verified.

   Pass the completed body on standard input, then close the input stream. Add `--draft` only when the user requested a draft:

   ```bash
   gh pr create --base main --head branch_name \
     --title "concise title" --body-file -
   ```

## Recovery

- If a PR may already exist, check before creating a duplicate:

  ```bash
  gh pr list --head branch_name --json url,isDraft,title --limit 1
  ```

- If `gh pr create` fails, report that the branch is pushed and provide
  the exact command for the user to run manually.
