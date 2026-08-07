import { describe, it, expect } from "vitest";

import { GET } from "@/app/api/college-picker/config/route";
import {
  MAJOR_GROUPS,
  SCORED_FACTORS,
  AVOID_FACTORS,
  BONUS_FACTORS,
} from "@/lib/college-picker/data";

describe("GET /api/college-picker/config", () => {
  it("returns all option lists straight from data.ts", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json.majors).toEqual(MAJOR_GROUPS);
    expect(json.scoredFactors).toEqual(SCORED_FACTORS);
    expect(json.avoidFactors).toEqual(AVOID_FACTORS);
    expect(json.bonusFactors).toEqual(BONUS_FACTORS);
  });

  it("serializes the actual FactorOption/MajorGroupOption fields", async () => {
    const res = await GET();
    const json = await res.json();

    // FactorOption<T> = { id, nameZh }
    for (const option of [
      ...json.scoredFactors,
      ...json.avoidFactors,
      ...json.bonusFactors,
    ]) {
      expect(typeof option.id).toBe("string");
      expect(typeof option.nameZh).toBe("string");
    }
    // MajorGroupOption = { id, nameZh, notes }
    expect(json.majors[0]).toEqual(MAJOR_GROUPS[0]);
    expect(json.majors[0]).toMatchObject({
      id: "engineering",
      nameZh: "工科",
      notes: expect.any(String),
    });
  });
});
