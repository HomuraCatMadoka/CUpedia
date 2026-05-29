import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import path from "node:path";

/**
 * Deterministic e2e baseline: seed the DB to a known state and drop Next's
 * persistent data cache so the freshly-started server reads `updatedAt` values
 * consistent with the seed (a stale `unstable_cache` entry would hand the
 * editor a stale optimistic-lock baseline and self-trigger EDIT_CONFLICT).
 * Runs before the webServer boots.
 */
export default function globalSetup() {
  const root = path.resolve(__dirname, "..");
  rmSync(path.join(root, ".next", "cache"), { recursive: true, force: true });
  execSync("pnpm seed", { cwd: root, stdio: "inherit" });
}
