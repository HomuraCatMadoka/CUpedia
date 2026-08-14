import { describe, expect, it } from "vitest";
import {
  parseAigensOfferingId,
  parseMenuExternalKey,
} from "@/lib/canteen-menu-external-key";

describe("persisted menu external key grammar", () => {
  it("parses exact writer output", () => {
    expect(parseMenuExternalKey("product-42#period=dinner+lunch")).toEqual({
      productIdentity: "product-42",
      mealPeriods: ["dinner", "lunch"],
    });
    expect(parseAigensOfferingId("product-42#offering-period=lunch")).toEqual({
      productId: "product-42",
      mealPeriod: "lunch",
    });
  });

  it.each([
    "product-42#period=bogus",
    "product-42#period=",
    "product-42#period=lunch+dinner",
    "product-42#period=lunch#period=lunch",
  ])("rejects non-writer envelope %s", (externalKey) => {
    expect(parseMenuExternalKey(externalKey)).toBeNull();
  });
});
