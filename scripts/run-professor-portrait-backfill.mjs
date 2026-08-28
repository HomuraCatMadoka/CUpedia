import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const MODES = new Set(["dry-run", "canary", "full"]);
const CONCURRENCY = new Set(["1", "2", "4", "6"]);

export function normalizeProfessorPortraitDatabaseUrl(value) {
  if (!value) return value;
  const url = new URL(value);
  if (url.hostname.endsWith(".pooler.supabase.com")) {
    url.searchParams.set("sslmode", "verify-full");
  }
  return url.toString();
}

export function buildProfessorPortraitBackfillArgs(input) {
  const mode = input.mode ?? "dry-run";
  const limit = input.limit ?? "10";
  const concurrency = input.concurrency ?? "2";

  if (!MODES.has(mode)) {
    throw new Error("BACKFILL_MODE must be dry-run, canary, or full");
  }
  if (!CONCURRENCY.has(concurrency)) {
    throw new Error("BACKFILL_CONCURRENCY must be 1, 2, 4, or 6");
  }
  if (!/^\d+$/.test(limit) || Number(limit) < 1 || Number(limit) > 10_000) {
    throw new Error("BACKFILL_LIMIT must be an integer from 1 to 10000");
  }
  const args = [
    "materialize:professor-portraits",
    "--",
    "--concurrency",
    concurrency,
  ];
  if (mode === "dry-run") args.push("--dry-run");
  if (mode === "dry-run") args.push("--limit", limit);
  if (mode === "canary") args.push("--limit", "10");
  return args;
}

export function main(env = process.env) {
  const args = buildProfessorPortraitBackfillArgs({
    mode: env.BACKFILL_MODE,
    limit: env.BACKFILL_LIMIT,
    concurrency: env.BACKFILL_CONCURRENCY,
  });
  const result = spawnSync("pnpm", args, {
    env: {
      ...env,
      DATABASE_URL: normalizeProfessorPortraitDatabaseUrl(env.DATABASE_URL),
    },
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
