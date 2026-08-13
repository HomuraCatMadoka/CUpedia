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
      suspectedReplacements: [
        {
          previousProductId: "old-id",
          nextProductId: "new-id",
          normalizedName: "凍奶茶",
        },
      ],
    });
    expect(isSuspiciousMenuIdentityChurn(observation, 1)).toBe(true);
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
    );

    expect(observation).toMatchObject({
      newProductCount: 0,
      missingProductCount: 0,
      suspectedReplacements: [],
      ambiguousOfferingTransitions: [],
    });
    expect(isSuspiciousMenuIdentityChurn(observation, 1)).toBe(false);
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
    );

    expect(observation.ambiguousOfferingTransitions).toEqual([
      {
        productIdentity: "product-42",
        previousProductIds: ["product-42#offering-period=breakfast"],
        nextProductIds: [
          "product-42#offering-period=lunch",
          "product-42#offering-period=dinner",
        ],
      },
    ]);
    expect(isSuspiciousMenuIdentityChurn(observation, 1)).toBe(true);
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
    expect(observation.suspectedReplacements).toEqual([]);
    expect(isSuspiciousMenuIdentityChurn(observation, 4)).toBe(false);
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
    expect(observation.newProductIds).toHaveLength(25);
    expect(observation.truncated).toBe(true);
    expect(isSuspiciousMenuIdentityChurn(observation, 100)).toBe(true);
  });
});
