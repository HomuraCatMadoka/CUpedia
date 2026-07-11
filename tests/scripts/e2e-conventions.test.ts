import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const e2eDir = path.resolve(__dirname, "../../e2e");

function specSources() {
  return readdirSync(e2eDir)
    .filter((name) => name.endsWith(".spec.ts"))
    .map((name) => ({
      name,
      source: readFileSync(path.join(e2eDir, name), "utf8"),
    }));
}

describe("e2e synchronization conventions", () => {
  it("does not use networkidle as a page-ready signal", () => {
    const offenders = specSources()
      .filter(({ source }) => /["']networkidle["']/.test(source))
      .map(({ name }) => name);

    expect(offenders).toEqual([]);
  });

  it("does not use fixed sleeps for synchronization", () => {
    const offenders = specSources()
      .filter(({ source }) => /waitForTimeout\s*\(/.test(source))
      .map(({ name }) => name);

    expect(offenders).toEqual([]);
  });

  it("does not turn runtime failures into skipped tests", () => {
    const offenders = specSources()
      .filter(({ source }) => /test\.skip\s*\(/.test(source))
      .map(({ name }) => name);

    expect(offenders).toEqual([]);
  });
});
