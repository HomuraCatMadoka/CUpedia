# Set up CUpedia locally

This guide creates a repeatable local environment with PostgreSQL, MinIO, migrations, and development fixtures. The root [README](../../README.md) gives the shortest path; use this page when you need service, environment, or reset details.

## Prerequisites

Use the same baseline as continuous integration (CI):

- Node.js 20
- pnpm 10
- Docker with Docker Compose

Newer local Node.js or pnpm versions may work, but CI remains the compatibility target.

## Bootstrap the environment

Clone the repository, install dependencies, and run the idempotent bootstrap command:

```bash
git clone https://github.com/HomuraCatMadoka/CUpedia.git
cd CUpedia
pnpm install
pnpm bootstrap
pnpm dev
```

Open `http://localhost:3000` after Next.js starts.

`pnpm bootstrap` runs `scripts/setup.ts` and completes these steps:

1. Copy `.env.example` to `.env.local` when the local file is absent
2. Start the `db` and `minio` Docker services and wait for their health checks
3. Create the public `cuclaw-uploads` bucket and the private
   `cuclaw-private-uploads` bucket used by controlled Campus Map Place-photo
   routes
4. Apply every migration with `pnpm drizzle-kit migrate`
5. Load the idempotent development fixtures with `pnpm seed`

Re-run the command when a migration or fixture changes. It preserves an existing `.env.local`.

## Use the development accounts

Every seeded account uses the password `password123`:

| Email                  | Role  | Purpose                             |
| ---------------------- | ----- | ----------------------------------- |
| `admin@test.com`       | Admin | Admin routes and governance actions |
| `user@test.com`        | User  | Ordinary authenticated flows        |
| `contributor@test.com` | User  | Multi-author and revision scenarios |
| `banned@test.com`      | User  | Banned-account behavior             |

The fixtures also cover rich Wiki content, multiple revisions, a deleted page, hierarchy, and product-domain sample data.

## Local services

Start only the dependencies without running migrations or fixtures:

```bash
docker compose up -d --wait db minio
```

| Service       | Address                 | Local credentials              |
| ------------- | ----------------------- | ------------------------------ |
| PostgreSQL    | `localhost:5433`        | `postgres` / `postgres`        |
| MinIO API     | `http://localhost:9000` | `minioadmin` / `minioadmin`    |
| MinIO console | `http://localhost:9001` | `minioadmin` / `minioadmin`    |
| Next.js       | `http://localhost:3000` | Seed account credentials above |

These credentials are development defaults. Production must use separate secrets.

## Environment variables

`.env.example` is the local template. `pnpm bootstrap` creates `.env.local`; edit that local file for machine-specific values.

The main local groups are:

- **Database**: `DATABASE_URL` points to PostgreSQL on port `5433`
- **Authentication**: `AUTH_SECRET` and `AUTH_URL`; the template enables the development-only email whitelist bypass
- **Email**: `BREVO_API_KEY` and `EMAIL_FROM` are required only for real one-time-password email delivery
- **Storage**: `MINIO_*` points to the local S3-compatible MinIO service;
  `MINIO_BUCKET` is public Wiki media while `MINIO_PRIVATE_BUCKET` must not
  grant anonymous reads
- **Scheduled cleanup**: production needs `CRON_SECRET`; Vercel calls the
  bounded Campus Map Place-photo cleanup route hourly so expired, unbound
  objects do not depend on a later user request for removal
- **Product flags**: optional canteen, danmaku, sensitive-content, and Campus Bus settings are documented beside their variables

Seeded password login does not require Brevo.

## Reset local data

The following command deletes the local PostgreSQL and MinIO volumes, then rebuilds them from migrations and fixtures:

```bash
docker compose down -v
pnpm bootstrap
```

Run it only when local database and upload data can be discarded.

## Resolve common setup failures

- If the application cannot connect to PostgreSQL or MinIO, run `docker compose ps` and start unhealthy services again.
- If authentication redirects use the wrong host, confirm `AUTH_URL=http://localhost:3000`.
- If registration cannot send an email, use a seeded account or configure Brevo credentials.
- If migrations fail, follow the [database workflow](database.md) and use `migrate`, not `push`.
