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
      "complete",
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
    expect(isSuspiciousMenuIdentityChurn(observation, 1, "complete")).toBe(
      true,
    );
  });

  it("does not flag an unambiguous Aigens offering period move as churn", () => {
    const observation = observeMenuIdentityChurn(
      [
        {
          externalProductId: "product-42#offering-period=lunch",
          name: "凍奶茶",
        },
      ],
      [
        {
          externalProductId: "product-42#offering-period=dinner",
          name: "凍奶茶",
        },
      ],
      "complete",
    );

    expect(observation).toMatchObject({
      newProductCount: 0,
      missingProductCount: 0,
      suspectedReplacementCount: 0,
      suspectedReplacementSamples: [],
      ambiguousOfferingTransitionCount: 0,
      ambiguousOfferingTransitionSamples: [],
    });
    expect(isSuspiciousMenuIdentityChurn(observation, 1, "complete")).toBe(
      false,
    );
  });

  it("flags an ambiguous Aigens offering split even below bulk thresholds", () => {
    const observation = observeMenuIdentityChurn(
      [
        {
          externalProductId: "product-42#offering-period=breakfast",
          name: "早餐奶茶",
        },
      ],
      [
        {
          externalProductId: "product-42#offering-period=lunch",
          name: "午餐奶茶",
        },
        {
          externalProductId: "product-42#offering-period=dinner",
          name: "晚餐奶茶",
        },
      ],
      "complete",
    );

    expect(observation.ambiguousOfferingTransitionCount).toBe(1);
    expect(observation.ambiguousOfferingTransitionSamples).toEqual([
      expect.stringMatching(/^[a-f0-9]{12}$/),
    ]);
    expect(JSON.stringify(observation)).not.toContain("product-42");
    expect(isSuspiciousMenuIdentityChurn(observation, 1, "complete")).toBe(
      true,
    );
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
      "complete",
    );

    expect(observation.newProductCount).toBe(1);
    expect(observation.suspectedReplacementCount).toBe(0);
    expect(observation.suspectedReplacementSamples).toEqual([]);
    expect(isSuspiciousMenuIdentityChurn(observation, 4, "complete")).toBe(
      false,
    );
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
    const observation = observeMenuIdentityChurn(
      existing,
      incoming,
      "complete",
    );

    expect(observation.newProductCount).toBe(30);
    expect(observation.missingProductCount).toBe(30);
    expect(observation.newProductSamples).toHaveLength(25);
    expect(observation.truncated).toBe(true);
    expect(isSuspiciousMenuIdentityChurn(observation, 100, "complete")).toBe(
      true,
    );
  });

  it("does not treat absences from a partial snapshot as bulk churn", () => {
    const existing = Array.from({ length: 117 }, (_, index) => ({
      externalProductId: `existing-${index}`,
      name: `Existing ${index}`,
    }));
    const incoming = existing.slice(0, 20);
    const observation = observeMenuIdentityChurn(existing, incoming, "partial");

    expect(observation).toMatchObject({
      newProductCount: 0,
      missingProductCount: 97,
      suspectedReplacementCount: 0,
    });
    expect(isSuspiciousMenuIdentityChurn(observation, 117, "partial")).toBe(
      false,
    );
  });

  it("still blocks bulk additions from a partial snapshot", () => {
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
    const observation = observeMenuIdentityChurn(existing, incoming, "partial");

    expect(observation.newProductCount).toBe(3);
    expect(isSuspiciousMenuIdentityChurn(observation, 12, "partial")).toBe(
      true,
    );
  });

  it("reports ambiguous offering transitions from a partial snapshot", () => {
    const observation = observeMenuIdentityChurn(
      [
        {
          externalProductId: "product-42#offering-period=breakfast",
          name: "早餐奶茶",
        },
      ],
      [
        {
          externalProductId: "product-42#offering-period=lunch",
          name: "午餐奶茶",
        },
        {
          externalProductId: "product-42#offering-period=dinner",
          name: "晚餐奶茶",
        },
      ],
      "partial",
    );

    expect(observation.ambiguousOfferingTransitionCount).toBe(1);
    expect(isSuspiciousMenuIdentityChurn(observation, 1, "partial")).toBe(true);
  });
});
