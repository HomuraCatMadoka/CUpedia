import { describe, expect, it } from "vitest";

import {
  emptyFoodMapCheckinStore,
  hktDateKey,
  parseFoodMapCheckinStore,
  recordFoodMapCheckin,
  serializeFoodMapCheckinStore,
  countFoodMapVisits,
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

  it("records at most one immutable visit per restaurant each day", () => {
    const empty = emptyFoodMapCheckinStore();
    const checked = recordFoodMapCheckin(empty, "2026-07-27", "r1");

    expect(checked.byDate).toEqual({ "2026-07-27": ["r1"] });
    expect(empty.byDate).toEqual({});

    const repeated = recordFoodMapCheckin(checked, "2026-07-27", "r1");
    expect(repeated).toEqual(checked);
    expect(checked.byDate).toEqual({ "2026-07-27": ["r1"] });

    const nextDay = recordFoodMapCheckin(checked, "2026-07-28", "r1");
    expect(countFoodMapVisits(nextDay, "r1")).toBe(2);
  });

  it("keeps the legacy commute-map toggle behavior", () => {
    const empty = emptyFoodMapCheckinStore();
    const checked = toggleFoodMapCheckin(empty, "2026-07-27", "r1");

    expect(checked.byDate).toEqual({ "2026-07-27": ["r1"] });
    expect(empty.byDate).toEqual({});
    expect(toggleFoodMapCheckin(checked, "2026-07-27", "r1")).toEqual(
      emptyFoodMapCheckinStore(),
    );
  });
});
