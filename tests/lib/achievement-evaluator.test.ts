import { describe, expect, it } from "vitest";

import { evaluateSubjectCountRule } from "@/lib/achievement-evaluator";

const ratings = [
  { id: "r1", courseCode: "MATH1010", subject: "MATH", score: 0.5 },
  { id: "r2", courseCode: "MATH2010", subject: "MATH", score: 5 },
  { id: "r3", courseCode: "MATH3010", subject: "MATH", content: "" },
  { id: "r4", courseCode: "MATH4010", subject: "MATH" },
  { id: "r5", courseCode: "PHYS1111", subject: "PHYS" },
];

describe("evaluateSubjectCountRule", () => {
  it("makes four matching subjects eligible without inspecting rating details", () => {
    expect(
      evaluateSubjectCountRule(
        { subjectCodes: ["MATH"], requiredCount: 4 },
        ratings,
      ),
    ).toEqual({
      eligible: true,
      matchedCount: 4,
      requiredCount: 4,
      evidenceRatingIds: ["r1", "r2", "r3", "r4"],
    });
  });

  it("lets an unoccupied rating advance multiple candidate previews", () => {
    const first = evaluateSubjectCountRule(
      { subjectCodes: ["MATH"], requiredCount: 4 },
      ratings,
    );
    const second = evaluateSubjectCountRule(
      { subjectCodes: ["MATH", "PHYS"], requiredCount: 4 },
      ratings,
    );

    expect(first.matchedCount).toBe(4);
    expect(second.matchedCount).toBe(4);
    expect(first.evidenceRatingIds).toContain("r1");
    expect(second.evidenceRatingIds).toContain("r1");
  });

  it("recalculates progress after redeemed evidence becomes occupied", () => {
    const evaluation = evaluateSubjectCountRule(
      { subjectCodes: ["MATH", "PHYS"], requiredCount: 4 },
      ratings,
      new Set(["r1", "r2", "r3", "r4"]),
    );

    expect(evaluation).toMatchObject({ eligible: false, matchedCount: 1 });
    expect(evaluation.evidenceRatingIds).toEqual(["r5"]);
  });
});
