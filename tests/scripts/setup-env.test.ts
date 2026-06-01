import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  readFileSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ensureEnvLocal } from "../../scripts/setup-env";

describe("ensureEnvLocal", () => {
  let dir: string;
  let source: string;
  let target: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "setup-env-"));
    source = join(dir, ".env.example");
    target = join(dir, ".env.local");
    writeFileSync(source, "DATABASE_URL=postgresql://example\n");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("creates the target from the source when it is missing", () => {
    const result = ensureEnvLocal(source, target);
    expect(result).toBe("created");
    expect(existsSync(target)).toBe(true);
    expect(readFileSync(target, "utf8")).toBe(readFileSync(source, "utf8"));
  });

  it("leaves an existing target untouched", () => {
    writeFileSync(target, "DATABASE_URL=postgresql://kept\n");
    const result = ensureEnvLocal(source, target);
    expect(result).toBe("exists");
    expect(readFileSync(target, "utf8")).toBe(
      "DATABASE_URL=postgresql://kept\n",
    );
  });

  it("throws a clear error when the source is missing", () => {
    rmSync(source);
    expect(() => ensureEnvLocal(source, target)).toThrow(/\.env\.example/);
  });
});
