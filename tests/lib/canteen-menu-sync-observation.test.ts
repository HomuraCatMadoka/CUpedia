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
