import { describe, expect, it } from "vitest";

import {
  emptyFoodMapCheckinStore,
  hktDateKey,
  parseFoodMapCheckinStore,
  serializeFoodMapCheckinStore,
  toggleFoodMapCheckin,
} from "@/lib/food-map/checkins";

describe("hktDateKey", () => {
  it("changes date at midnight in Hong Kong", () => {
    expect(hktDateKey(new Date("2026-07-26T15:59:59Z"))).toBe("2026-07-26");
    expect(hktDateKey(new Date("2026-07-26T16:00:00Z"))).toBe("2026-07-27");
  });
});

describe("food map check-in storage", () => {
  it("falls back safely for corrupted or unsupported data", () => {
    expect(parseFoodMapCheckinStore("{broken")).toEqual(
      emptyFoodMapCheckinStore(),
    );
    expect(
      parseFoodMapCheckinStore(
        JSON.stringify({ version: 2, byDate: { "2026-07-27": ["r1"] } }),
      ),
    ).toEqual(emptyFoodMapCheckinStore());
  });

  it("deduplicates restaurant ids while parsing and serializing", () => {
    const parsed = parseFoodMapCheckinStore(
      JSON.stringify({
        version: 1,
        byDate: {
          "2026-07-27": ["r1", " r1 ", "r2", "", 42],
          invalid: ["r3"],
        },
      }),
    );

    expect(parsed.byDate).toEqual({ "2026-07-27": ["r1", "r2"] });
    expect(
      parseFoodMapCheckinStore(serializeFoodMapCheckinStore(parsed)),
    ).toEqual(parsed);
  });

  it("toggles a restaurant on and off without mutating the input", () => {
    const empty = emptyFoodMapCheckinStore();
    const checked = toggleFoodMapCheckin(empty, "2026-07-27", "r1");

    expect(checked.byDate).toEqual({ "2026-07-27": ["r1"] });
    expect(empty.byDate).toEqual({});

    const unchecked = toggleFoodMapCheckin(checked, "2026-07-27", "r1");
    expect(unchecked).toEqual(emptyFoodMapCheckinStore());
    expect(checked.byDate).toEqual({ "2026-07-27": ["r1"] });
  });
});
