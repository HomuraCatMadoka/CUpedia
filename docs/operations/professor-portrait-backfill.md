# Professor portrait production backfill

Status: Current
Last verified: 2026-08-28

The production professor pages read only owned portrait assets. Until the
manifest is populated, they intentionally show initials. The backfill is a
manual, protected operation; it is not part of `vercel-build` and has no
schedule.

## One-time setup

From the repository root, run:

```bash
scripts/setup-professor-portrait-backfill.sh
```

The wizard creates or confirms the GitHub `production` Environment and stores
the following values as environment secrets without writing them to the repo:

- `DATABASE_URL`
- `MINIO_ENDPOINT`
- `MINIO_REGION`
- `MINIO_ACCESS_KEY`
- `MINIO_SECRET_KEY`
- `MINIO_BUCKET`
- `MINIO_PUBLIC_URL`

Retrieve the database connection from the production Supabase project. Retrieve
the object-storage values from their authoritative provider or password
manager; Vercel Sensitive values cannot be downloaded after they are stored.
Configure required reviewers on the GitHub `production` Environment before a
canary or full run.

## Rollout

Use **Actions → Production professor portrait backfill → Run workflow**.

1. Run `dry-run`, limit `10`, concurrency `2`. It reads the database only.
2. Run `canary`, limit `10`, concurrency `2` after environment approval.
3. Verify the job reports ready rows, both WebP variants return HTTP 200 with a
   one-year immutable cache policy, and professor pages contain no
   `/_next/image` or `/api/professor-portraits` requests.
4. Repeat the same canary. It should primarily report `skipped` and must not
   create duplicate object keys.
5. Run `full` with concurrency `4`. The limit input is ignored only in this
   explicitly selected mode.
6. Query `professor_portrait_assets` by status, investigate bounded failure
   codes, and rerun after correcting transient source or storage failures.

The command continues after individual portrait failures but exits non-zero if
any failed. A failed refresh retains the last ready keys. Old content-addressed
objects are not deleted during this rollout.

## Rollback and stopping rules

- Stop if the dry-run total differs from the requested limit while production
  contains at least that many professors.
- Stop if the canary writes objects outside `professor-portraits/` or if either
  variant lacks `Cache-Control: public, max-age=31536000, immutable`.
- Cancelling the workflow stops new work. Completed objects are safe to retain;
  incomplete people remain retryable.
- Do not reintroduce `next/image` or the deleted runtime portrait proxy as a
  rollback. The UI safely falls back to initials when a manifest is missing.
