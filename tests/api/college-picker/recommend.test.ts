import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";

import { POST } from "@/app/api/college-picker/recommend/route";
import { recommend, type RecommendInput } from "@/lib/college-picker/recommend";
import { COLLEGES } from "@/lib/college-picker/data";

function makePost(body: unknown) {
  return new NextRequest(
    new URL("http://localhost:3000/api/college-picker/recommend"),
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

describe("POST /api/college-picker/recommend", () => {
  it("returns the pure-function rankings for a valid input", async () => {
    const input: RecommendInput = {
      majorGroup: "engineering",
      priorities: [
        "Commute_Time",
        "Accommodation_Environment",
        "Hostel_Guarantee",
      ],
      avoids: [],
    };

    const res = await POST(makePost(input));
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json.rankings).toEqual(recommend(input));
    expect(json.rankings).toHaveLength(COLLEGES.length);
  });

  it("keeps the golden ordering for the engineering scenario", async () => {
    const input: RecommendInput = {
      majorGroup: "engineering",
      priorities: [
        "Commute_Time",
        "Accommodation_Environment",
        "Hostel_Guarantee",
      ],
      avoids: [],
    };

    const res = await POST(makePost(input));
    const json = await res.json();

    // Golden scenario from tests/lib/college-picker.test.ts (C-i).
    expect(json.rankings.map((c: { id: string }) => c.id)).toEqual([
      "mc",
      "cc",
      "uc",
      "lws",
      "na",
      "sc",
      "wys",
      "shho",
      "cwc",
    ]);
    expect(json.rankings[0].score).toBeGreaterThan(json.rankings[1].score);
  });

  it("accepts optional smallCollege fields and avoid factors", async () => {
    const input: RecommendInput = {
      majorGroup: "business",
      priorities: ["Hostel_Guarantee", "Commute_Time", "Exchange_Opportunity"],
      avoids: ["Admission_Interview", "Admission_Written_Test"],
      smallCollegePreference: "aim",
      bonusFactors: ["MTR_Distance"],
      smallCollegeAnswers: { q1: "A", q2: "C", q3: "B", q4: "A" },
    };

    const res = await POST(makePost(input));
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json.rankings).toEqual(recommend(input));
  });

  it("rejects an invalid majorGroup with 400 INVALID_PARAMS", async () => {
    const res = await POST(
      makePost({
        majorGroup: "law",
        priorities: ["Commute_Time", "", ""],
        avoids: [],
      }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "INVALID_PARAMS" });
  });

  it("rejects skipped priority slots with 400 INVALID_PARAMS", async () => {
    const res = await POST(
      makePost({
        majorGroup: "engineering",
        priorities: ["Commute_Time", "", "Hostel_Guarantee"],
        avoids: [],
      }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "INVALID_PARAMS" });
  });

  it("rejects a non-JSON body with 400 INVALID_JSON", async () => {
    const request = new NextRequest(
      new URL("http://localhost:3000/api/college-picker/recommend"),
      { method: "POST", body: "not json" },
    );
    const res = await POST(request);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "INVALID_JSON" });
  });
});
