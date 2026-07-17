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
        { subjectGroups: [{ subjectCodes: ["MATH"], requiredCount: 4 }] },
        ratings,
      ),
    ).toEqual({
      eligible: true,
      matchedCount: 4,
      requiredCount: 4,
      evidenceRatingIds: ["r1", "r2", "r3", "r4"],
      evidenceRatingIdsBySlot: ["r4", "r3", "r2", "r1"],
    });
  });

  it("lets an unoccupied rating advance multiple candidate previews", () => {
    const first = evaluateSubjectCountRule(
      { subjectGroups: [{ subjectCodes: ["MATH"], requiredCount: 4 }] },
      ratings,
    );
    const second = evaluateSubjectCountRule(
      {
        subjectGroups: [{ subjectCodes: ["MATH", "PHYS"], requiredCount: 4 }],
      },
      ratings,
    );

    expect(first.matchedCount).toBe(4);
    expect(second.matchedCount).toBe(4);
    expect(first.evidenceRatingIds).toContain("r1");
    expect(second.evidenceRatingIds).toContain("r1");
  });

  it("recalculates progress after redeemed evidence becomes occupied", () => {
    const evaluation = evaluateSubjectCountRule(
      {
        subjectGroups: [{ subjectCodes: ["MATH", "PHYS"], requiredCount: 4 }],
      },
      ratings,
      new Set(["r1", "r2", "r3", "r4"]),
    );

    expect(evaluation).toMatchObject({ eligible: false, matchedCount: 1 });
    expect(evaluation.evidenceRatingIds).toEqual(["r5"]);
  });

  it("supports mixed subject compositions", () => {
    const result = evaluateSubjectCountRule(
      {
        subjectGroups: [
          { subjectCodes: ["ENGG"], requiredCount: 2 },
          { subjectCodes: ["CSCI"], requiredCount: 2 },
        ],
      },
      [
        { id: "e1", courseCode: "ENGG1000", subject: "ENGG" },
        { id: "e2", courseCode: "ENGG2000", subject: "ENGG" },
        { id: "c1", courseCode: "CSCI1000", subject: "CSCI" },
        { id: "c2", courseCode: "CSCI2000", subject: "CSCI" },
      ],
    );

    expect(result).toMatchObject({ eligible: true, matchedCount: 4 });
    expect(result.evidenceRatingIds).toHaveLength(4);
  });

  it("allocates overlapping groups without starving a strict group", () => {
    const result = evaluateSubjectCountRule(
      {
        subjectGroups: [
          { subjectCodes: ["ACCT", "FINA"], requiredCount: 1 },
          { subjectCodes: ["ACCT"], requiredCount: 1 },
        ],
      },
      [
        { id: "a1", courseCode: "ACCT1000", subject: "ACCT" },
        { id: "f1", courseCode: "FINA1000", subject: "FINA" },
      ],
    );

    expect(result).toMatchObject({ eligible: true, matchedCount: 2 });
  });
});
