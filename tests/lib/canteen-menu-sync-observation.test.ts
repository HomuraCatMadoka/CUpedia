import { describe, expect, it } from "vitest";
import {
  isSuspiciousMenuIdentityChurn,
  observeMenuIdentityChurn,
} from "@/lib/canteen-menu-sync-observation";

describe("menu identity churn observation", () => {
  it("flags a one-to-one same-name product ID replacement", () => {
    const observation = observeMenuIdentityChurn(
      [{ externalProductId: "old-id", name: "凍奶茶" }],
      [{ externalProductId: "new-id", name: "凍奶茶" }],
    );

    expect(observation).toMatchObject({
      newProductCount: 1,
      missingProductCount: 1,
      suspectedReplacementCount: 1,
      suspectedReplacementSamples: [
        {
          previousProductId: expect.stringMatching(/^[a-f0-9]{12}$/),
          nextProductId: expect.stringMatching(/^[a-f0-9]{12}$/),
        },
      ],
    });
    expect(JSON.stringify(observation)).not.toContain("old-id");
    expect(JSON.stringify(observation)).not.toContain("new-id");
    expect(JSON.stringify(observation)).not.toContain("凍奶茶");
    expect(
      isSuspiciousMenuIdentityChurn(observation, 1, {
        kind: "provider-catalog",
      }),
    ).toBe(true);
    expect(
      isSuspiciousMenuIdentityChurn(observation, 1, { kind: "none" }),
    ).toBe(true);
  });

  it("allows ordinary low-volume additions without guessing identity", () => {
    const observation = observeMenuIdentityChurn(
      [
        { externalProductId: "a", name: "A" },
        { externalProductId: "b", name: "B" },
        { externalProductId: "c", name: "C" },
        { externalProductId: "d", name: "D" },
      ],
      [
        { externalProductId: "a", name: "A" },
        { externalProductId: "b", name: "B" },
        { externalProductId: "c", name: "C" },
        { externalProductId: "d", name: "D" },
        { externalProductId: "e", name: "E" },
      ],
    );

    expect(observation.newProductCount).toBe(1);
    expect(observation.suspectedReplacementCount).toBe(0);
    expect(observation.suspectedReplacementSamples).toEqual([]);
    expect(
      isSuspiciousMenuIdentityChurn(observation, 4, {
        kind: "provider-catalog",
      }),
    ).toBe(false);
  });

  it("uses full counts even when retained ID samples are bounded", () => {
    const existing = Array.from({ length: 100 }, (_, index) => ({
      externalProductId: `old-${index}`,
      name: `Old ${index}`,
    }));
    const incoming = Array.from({ length: 100 }, (_, index) => ({
      externalProductId: index < 30 ? `new-${index}` : `old-${index}`,
      name: index < 30 ? `New ${index}` : `Old ${index}`,
    }));
    const observation = observeMenuIdentityChurn(existing, incoming);

    expect(observation.newProductCount).toBe(30);
    expect(observation.missingProductCount).toBe(30);
    expect(observation.newProductSamples).toHaveLength(25);
    expect(observation.truncated).toBe(true);
    expect(
      isSuspiciousMenuIdentityChurn(observation, 100, {
        kind: "provider-catalog",
      }),
    ).toBe(true);
  });

  it("does not treat absences from a partial snapshot as bulk churn", () => {
    const existing = Array.from({ length: 117 }, (_, index) => ({
      externalProductId: `existing-${index}`,
      name: `Existing ${index}`,
    }));
    const incoming = existing.slice(0, 20);
    const observation = observeMenuIdentityChurn(existing, incoming);

    expect(observation).toMatchObject({
      newProductCount: 0,
      missingProductCount: 97,
      suspectedReplacementCount: 0,
    });
    expect(
      isSuspiciousMenuIdentityChurn(observation, 117, { kind: "none" }),
    ).toBe(false);
  });

  it("allows bulk additions from a partial snapshot", () => {
    const existing = Array.from({ length: 12 }, (_, index) => ({
      externalProductId: `existing-${index}`,
      name: `Existing ${index}`,
    }));
    const incoming = [
      ...existing,
      ...Array.from({ length: 3 }, (_, index) => ({
        externalProductId: `new-${index}`,
        name: `New ${index}`,
      })),
    ];
    const observation = observeMenuIdentityChurn(existing, incoming);

    expect(observation.newProductCount).toBe(3);
    expect(
      isSuspiciousMenuIdentityChurn(observation, 12, { kind: "none" }),
    ).toBe(false);
  });

  it("allows missing-only contraction under current-activity authority", () => {
    const existing = Array.from({ length: 249 }, (_, index) => ({
      externalProductId: `existing-${index}`,
      name: `Existing ${index}`,
    }));
    const observation = observeMenuIdentityChurn(
      existing,
      existing.slice(0, 150),
    );

    expect(observation).toMatchObject({
      newProductCount: 0,
      missingProductCount: 99,
      suspectedReplacementCount: 0,
    });
    expect(
      isSuspiciousMenuIdentityChurn(observation, 249, {
        kind: "current-activity",
        coveredMealPeriods: ["breakfast", "lunch", "dinner"],
      }),
    ).toBe(false);
  });

  it("still blocks production-shaped simultaneous bulk identity replacement", () => {
    const existing = Array.from({ length: 249 }, (_, index) => ({
      externalProductId: `old-${index}`,
      name: `Old ${index}`,
    }));
    const incoming = Array.from({ length: 150 }, (_, index) => ({
      externalProductId: `new-${index}`,
      name: `New ${index}`,
    }));
    const observation = observeMenuIdentityChurn(existing, incoming);

    expect(observation).toMatchObject({
      newProductCount: 150,
      missingProductCount: 249,
      suspectedReplacementCount: 0,
    });
    expect(
      isSuspiciousMenuIdentityChurn(observation, 249, {
        kind: "current-activity",
        coveredMealPeriods: ["breakfast", "lunch", "dinner"],
      }),
    ).toBe(true);
  });
});
