---
name: create-pr
description: >
  Create Git branches, commits, and GitHub pull requests for CUpedia.
  Use when the user asks to create a branch, commit changes, open a PR,
  or publish work. Covers branch naming, commit messages, PR body format,
  and pre-commit validation.
---

# Create PR

Use this skill when turning local work into a GitHub pull request.

## Workflow

1. **Inspect current state**

   ```bash
   git status --short
   git branch --show-current
   git diff --stat
   ```

   Stage only files that belong to the requested change.

2. **Create or confirm the branch**

   ```bash
   git switch -c feat/<short-topic>
   ```

   Branch naming:
   - `feat/<topic>` — New feature
   - `fix/<topic>` — Bug fix
   - `refactor/<topic>` — Code improvement
   - `docs/<topic>` — Documentation only

3. **Validate before committing**

   ```bash
   pnpm lint
   pnpm test
   ```

   Fix any issues before proceeding.

4. **Commit**

   ```bash
   git add <specific-files>
   git commit -m "type: concise description"
   ```

   Commit message format: `type: description`
   - `feat:` — New feature
   - `fix:` — Bug fix
   - `refactor:` — Code restructuring
   - `test:` — Adding/updating tests
   - `docs:` — Documentation changes

5. **Push**

   ```bash
   git push -u origin <branch>
   ```

6. **Create the PR**

   ```bash
   gh pr create --base main --head <branch> --title "<title>" --body '<body>'
   ```

## PR Body Format

```markdown
## Summary

- <what changed and why>

## Verification

- `pnpm lint` — passed
- `pnpm test` — passed
- Manual testing — <what was tested in browser>
```

## Recovery

- Check if a PR already exists before creating a duplicate:

  ```bash
  gh pr view --head <branch> --json url,title 2>/dev/null
  ```

- If `gh pr create` fails, report that the branch is pushed and provide the command for the user.

## Related Skills

- `$db-migration` — If the PR includes schema changes, verify migration is committed
