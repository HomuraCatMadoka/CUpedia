import { describe, expect, it } from "vitest";

import {
  parseHandbookRequirementAst,
  projectHandbookCategories,
  projectLegacyHandbookCategories,
  validateHandbookRequirementAst,
} from "@/lib/handbook-requirement";

const html = `
  <table>
    <tr><td>Major Programme Requirement</td></tr>
    <tr><td>Students are required to complete a minimum of 18 units of courses as follows:</td></tr>
    <tr><td></td><td></td><td>Units</td></tr>
    <tr><td>1.</td><td>Required Courses:</td><td>6</td></tr>
    <tr><td></td><td>CSCI2100, 3100</td><td></td></tr>
    <tr><td>2.</td><td>Elective Courses:</td><td>12</td></tr>
    <tr><td>(a)</td><td>Any courses from ENGG2440/ESTR2004</td><td>6</td></tr>
    <tr><td></td><td>Total:</td><td>18</td></tr>
  </table>`;

describe("parseHandbookRequirementAst", () => {
  it("keeps source clauses and derives normalized course members", () => {
    const ast = parseHandbookRequirementAst(html);
    expect(ast).toEqual({
      totalUnits: 18,
      sections: [
        {
          marker: "1.",
          heading: "Required Courses",
          declaredUnits: 6,
          courses: ["CSCI2100", "CSCI3100"],
          clauses: [
            {
              marker: "",
              text: "CSCI2100, 3100",
              declaredUnits: null,
              courses: ["CSCI2100", "CSCI3100"],
              constraints: [],
            },
          ],
        },
        {
          marker: "2.",
          heading: "Elective Courses",
          declaredUnits: 12,
          courses: ["ENGG2440", "ESTR2004"],
          clauses: [
            {
              marker: "(a)",
              text: "Any courses from ENGG2440/ESTR2004",
              declaredUnits: 6,
              courses: ["ENGG2440", "ESTR2004"],
              constraints: [],
            },
          ],
        },
      ],
    });
    expect(validateHandbookRequirementAst(ast)).toEqual([]);
    expect(projectHandbookCategories(ast!)).toEqual([
      {
        name: "Required Courses",
        kind: "required",
        unitsRequired: 6,
        pickN: null,
        members: ["CSCI2100", "CSCI3100"],
        textualRule: "CSCI2100, 3100",
      },
      {
        name: "Elective Courses",
        kind: "basket",
        unitsRequired: 12,
        pickN: null,
        members: ["ENGG2440", "ESTR2004"],
        textualRule: "(a) Any courses from ENGG2440/ESTR2004",
      },
    ]);
  });

  it("projects an outer option choice as one enforceable elective basket", () => {
    expect(
      projectLegacyHandbookCategories({
        totalUnits: 17,
        sections: [
          {
            marker: "4.",
            heading: "Choose any ONE from the following two options",
            declaredUnits: 17,
            courses: ["CSCI3230", "CSCI3170"],
            clauses: [
              {
                marker: "(a)",
                text: "General Computer Science: CSCI3230",
                declaredUnits: null,
                courses: ["CSCI3230"],
                constraints: [],
              },
              {
                marker: "(b)",
                text: "Database Stream: CSCI3170",
                declaredUnits: null,
                courses: ["CSCI3170"],
                constraints: [],
              },
            ],
          },
        ],
      }),
    ).toEqual([
      expect.objectContaining({
        name: "Elective Courses",
        unitsRequired: 17,
        members: ["CSCI3230", "CSCI3170"],
      }),
    ]);
  });
});
