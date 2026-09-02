import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

const eslint = new ESLint({ cwd: process.cwd() });

async function restrictedImportRuleIds(source: string, filePath: string) {
  const [result] = await eslint.lintText(source, { filePath });
  return result.messages
    .filter(
      (message) =>
        message.ruleId === "no-restricted-imports" ||
        message.ruleId === "no-restricted-syntax",
    )
    .map((message) => message.ruleId);
}

describe("E2E src import boundary", () => {
  it.each([
    {
      name: "one parent",
      source: 'import "../src/lib/example";',
      filePath: "e2e/diagnostic.ts",
      ruleId: "no-restricted-imports",
    },
    {
      name: "arbitrary parent depth",
      source: 'import "../../../../src/lib/example";',
      filePath: "e2e/a/b/c/diagnostic.ts",
      ruleId: "no-restricted-imports",
    },
    {
      name: "normalized dot segment",
      source: 'import ".././src/lib/example";',
      filePath: "e2e/diagnostic.ts",
      ruleId: "no-restricted-imports",
    },
    {
      name: "dynamic import",
      source: 'void import("../src/lib/example");',
      filePath: "e2e/diagnostic.ts",
      ruleId: "no-restricted-syntax",
    },
  ])("rejects $name paths into src", async ({ source, filePath, ruleId }) => {
    await expect(restrictedImportRuleIds(source, filePath)).resolves.toContain(
      ruleId,
    );
  });

  it.each([
    { name: "src alias", source: 'import "@/lib/example";' },
    { name: "repository script", source: 'import "../scripts/seed-data";' },
    { name: "local helper", source: 'import "./helpers/auth";' },
  ])("allows $name imports", async ({ source }) => {
    await expect(
      restrictedImportRuleIds(source, "e2e/diagnostic.ts"),
    ).resolves.toEqual([]);
  });
});
