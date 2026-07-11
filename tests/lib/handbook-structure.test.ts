import { describe, expect, it } from "vitest";

import {
  extractPrincipalRequirementTable,
  groupRequirementSections,
} from "@/lib/handbook-structure";

const table = (intro: string, rows: string) => `
  <table><tr><td>Outer wrapper</td></tr><tr><td>
    <table>
      <tr><td>Major Programme Requirement</td></tr>
      <tr><td>${intro}</td></tr>
      <tr><td></td><td></td><td>Units</td></tr>
      ${rows}
    </table>
  </td></tr></table>`;

describe("extractPrincipalRequirementTable", () => {
  it("preserves numbered and lettered requirement rows with their unit cells", () => {
    const result = extractPrincipalRequirementTable(
      table(
        "Students are required to complete a minimum of 69 units of courses as follows:",
        `<tr><td>1.</td><td>Faculty Package:</td><td>9</td></tr>
         <tr><td>(d)</td><td>At least nine courses from the course list</td><td>27</td></tr>
         <tr><td></td><td>Total:</td><td>69</td></tr>`,
      ),
    );
    expect(result).toEqual({
      totalUnits: 69,
      rows: [
        { marker: "1.", text: "Faculty Package:", units: 9 },
        {
          marker: "(d)",
          text: "At least nine courses from the course list",
          units: 27,
        },
      ],
    });
  });

  it("keeps unmarked subrows instead of flattening their units", () => {
    const result = extractPrincipalRequirementTable(
      table(
        "Students are required to complete a minimum of 111 units of courses as follows:",
        `<tr><td>1.</td><td>Required Courses:</td><td></td></tr>
         <tr><td></td><td>Research Experience BECE4540</td><td>6</td></tr>
         <tr><td></td><td>Teaching Practice BECE4010</td><td>10</td></tr>`,
      ),
    );
    expect(result?.rows.slice(1)).toEqual([
      { marker: "", text: "Research Experience BECE4540", units: 6 },
      { marker: "", text: "Teaching Practice BECE4010", units: 10 },
    ]);
  });

  it("accepts a numbered requirement table without the words as follows", () => {
    const result = extractPrincipalRequirementTable(
      table(
        "Students are required to complete a minimum of 90 units of courses.",
        `<tr><td>1.</td><td>Faculty Package:</td><td>9</td></tr>`,
      ),
    );
    expect(result).toEqual({
      totalUnits: 90,
      rows: [{ marker: "1.", text: "Faculty Package:", units: 9 }],
    });
  });

  it("groups rows under numbered sections without interpreting subgroups", () => {
    const extracted = extractPrincipalRequirementTable(
      table(
        "Students are required to complete a minimum of 56 units of courses as follows:",
        `<tr><td>1 .</td><td>Required Courses:</td><td></td></tr>
         <tr><td></td><td>Core Courses</td><td>40</td></tr>
         <tr><td>(a)</td><td>Research Experience</td><td>6</td></tr>
         <tr><td>2.</td><td>Elective Courses:</td><td>10</td></tr>`,
      ),
    );
    expect(groupRequirementSections(extracted!)).toEqual([
      {
        marker: "1.",
        heading: "Required Courses",
        units: null,
        rows: [
          { marker: "", text: "Core Courses", units: 40 },
          { marker: "(a)", text: "Research Experience", units: 6 },
        ],
      },
      {
        marker: "2.",
        heading: "Elective Courses",
        units: 10,
        rows: [],
      },
    ]);
  });
});
