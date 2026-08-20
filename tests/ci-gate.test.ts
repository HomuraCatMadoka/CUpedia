import { describe, expect, it } from "vitest";
import { classifyChanges } from "../scripts/ci-classifier.mjs";
import { evaluateGate } from "../scripts/ci-gate.mjs";

const change = (path: string) => [{ status: "M", paths: [path] }];

function verdict(
  plan: ReturnType<typeof classifyChanges>,
  overrides: Record<string, string> = {},
) {
  return evaluateGate({
    qualityPlan: plan,
    buildPlan: plan,
    results: {
      quality: "success",
      build: "success",
      e2e: "skipped",
      browserThird: "skipped",
      ...overrides,
    },
  });
}

describe("aggregate CI gate (#670)", () => {
  it("accepts only planned skips for docs-only", () => {
    const plan = classifyChanges(change("docs/ci-topology.md"));
    expect(verdict(plan)).toEqual({ ok: true, reason: "docs plan completed" });
  });

  it("requires selected ordinary Chromium", () => {
    const plan = classifyChanges(
      change("src/components/canteen/canteen-card.tsx"),
    );
    expect(verdict(plan, { e2e: "success" }).ok).toBe(true);
    expect(verdict(plan, { e2e: "failure" })).toEqual({
      ok: false,
      reason: "required e2e job was failure",
    });
  });

  it("requires every full-regression browser execution", () => {
    const plan = classifyChanges(change("src/db/schema.ts"));
    expect(verdict(plan, { e2e: "success", browserThird: "success" }).ok).toBe(
      true,
    );
    expect(
      verdict(plan, { e2e: "cancelled", browserThird: "success" }).ok,
    ).toBe(false);
    expect(verdict(plan, { e2e: "success", browserThird: "skipped" }).ok).toBe(
      false,
    );
  });

  it.each(["failure", "cancelled", "skipped"])(
    "rejects a %s quality result",
    (quality) => {
      const plan = classifyChanges(change("docs/ci-topology.md"));
      expect(verdict(plan, { quality }).ok).toBe(false);
    },
  );

  it("rejects missing or disagreeing plans", () => {
    const docs = classifyChanges(change("docs/ci-topology.md"));
    const full = classifyChanges(change("src/db/schema.ts"));
    expect(
      evaluateGate({ qualityPlan: null, buildPlan: docs, results: {} }).ok,
    ).toBe(false);
    expect(
      evaluateGate({ qualityPlan: docs, buildPlan: full, results: {} }).ok,
    ).toBe(false);
    expect(
      evaluateGate({
        qualityPlan: { version: 1, tier: "docs" },
        buildPlan: { version: 1, tier: "docs" },
        results: {
          quality: "success",
          build: "success",
          e2e: "skipped",
          browserThird: "skipped",
        },
      }).ok,
    ).toBe(false);
  });
});
