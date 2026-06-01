import { copyFileSync, existsSync } from "node:fs";

/**
 * Copy the env template to the local env file when it is missing.
 * Returns "created" on copy, "exists" when the target is already present.
 */
export function ensureEnvLocal(
  sourcePath: string,
  targetPath: string,
): "created" | "exists" {
  if (existsSync(targetPath)) return "exists";
  if (!existsSync(sourcePath)) {
    throw new Error(`Missing env template: ${sourcePath} (.env.example)`);
  }
  copyFileSync(sourcePath, targetPath);
  return "created";
}
