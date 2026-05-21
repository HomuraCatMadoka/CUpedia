# Contributing to CUpedia

Thanks for your interest in contributing!

## Getting Started

1. Fork the repo and clone your fork
2. Start the infrastructure:

   ```bash
   cd CUpedia
   docker compose up -d db minio
   ```

3. Install dependencies and start dev server:

   ```bash
   cp .env.example .env.local  # then fill in values
   pnpm install
   pnpm dev
   ```

4. Open http://localhost:3000

## Making Changes

1. Create a branch from `main`:

   ```bash
   git switch -c feat/my-feature
   ```

2. Make your changes. See `AGENTS.md` for project structure and coding conventions.

3. Verify before committing:

   ```bash
   pnpm lint
   pnpm test
   ```

4. Commit with a descriptive message:

   ```bash
   git commit -m "feat: add something useful"
   ```

5. Push and open a PR against `main`.

## Proposing New Features

**Bug fixes can go straight to a PR.** But for new features, please open a [Feature Request Discussion](https://github.com/HomuraCatMadoka/CUpedia/discussions/new?category=ideas) first. This lets us:

1. Validate the idea with the community
2. Discuss the scope and approach before you write code
3. Avoid duplicate work

Once the feature is accepted, reference the discussion in your PR.

## What We're Looking For

- Bug fixes
- New wiki features (please open a Discussion first)
- UI/UX improvements
- Accessibility improvements
- Documentation
- Test coverage

## Guidelines

- Follow the existing code style (ESLint + Prettier enforced via pre-commit hook)
- Server Components by default, `"use client"` only when necessary
- All wiki mutations go through `src/lib/wiki-actions.ts`
- DB schema changes must include both `schema.ts` and generated migration
- Don't commit `.env` files or secrets

## Questions?

Open a [Discussion](https://github.com/HomuraCatMadoka/CUpedia/discussions) if you have questions or want to propose ideas before coding.
