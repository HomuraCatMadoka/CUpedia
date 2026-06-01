import { execSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { ensureEnvLocal } from "./setup-env";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const run = (cmd: string) => execSync(cmd, { cwd: root, stdio: "inherit" });

function main() {
  const env = ensureEnvLocal(
    resolve(root, ".env.example"),
    resolve(root, ".env.local"),
  );
  console.log(
    env === "created"
      ? "✓ Created .env.local from .env.example"
      : "✓ .env.local already present",
  );
  // Load DATABASE_URL etc. so drizzle-kit migrate (which reads process.env) works.
  dotenv.config({ path: resolve(root, ".env.local") });

  console.log("\n▶ Starting Postgres + MinIO …");
  run("docker compose up -d --wait db minio");
  console.log("\n▶ Creating uploads bucket …");
  run("docker compose run --rm createbuckets");

  console.log("\n▶ Applying database migrations …");
  run("pnpm drizzle-kit migrate");
  console.log("\n▶ Seeding development data …");
  run("pnpm seed");

  console.log("\n✓ Local environment ready — run `pnpm dev`.");
}

main();
