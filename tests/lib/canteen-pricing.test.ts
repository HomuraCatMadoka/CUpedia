import { describe, expect, it } from "vitest";
import {
  buildMenuItemPricing,
  formatPriceAmount,
  formatPriceOption,
} from "@/lib/canteen-pricing";

describe("canteen pricing DTO", () => {
  it("prefers normalized options and sorts them", () => {
    const pricing = buildMenuItemPricing(
      "item-1",
      [
        {
          id: "iced",
          label: "凍",
          amountMinor: 1300,
          currency: "HKD",
          sortOrder: 1,
        },
        {
          id: "hot",
          label: "熱",
          amountMinor: 1100,
          currency: "HKD",
          sortOrder: 0,
        },
      ],
      99,
    );
    expect(pricing?.options.map((option) => option.id)).toEqual([
      "hot",
      "iced",
    ]);
  });

  it("maps a legacy DB price behind the stable API contract", () => {
    expect(buildMenuItemPricing("item-1", [], 13)).toEqual({
      options: [
        {
          id: "legacy:item-1",
          label: null,
          amountMinor: 1300,
          currency: "HKD",
          sortOrder: 0,
        },
      ],
    });
  });

  it("formats whole and fractional prices", () => {
    expect(formatPriceAmount(1300, "HKD")).toBe("$13");
    expect(formatPriceAmount(2880, "HKD")).toBe("$28.80");
    expect(
      formatPriceOption({
        id: "iced",
        label: "凍",
        amountMinor: 1300,
        currency: "HKD",
        sortOrder: 0,
      }),
    ).toBe("凍 $13");
  });
});
