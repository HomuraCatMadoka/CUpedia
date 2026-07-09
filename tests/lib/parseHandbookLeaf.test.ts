import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseHandbookLeaf, expandCodes } from "@/lib/parseHandbookLeaf";

const fixture = (name: string) =>
  readFileSync(new URL(`./fixtures/${name}.html`, import.meta.url), "utf8");

describe("expandCodes", () => {
  it("expands bare-number shorthand against the running subject", () => {
    expect(expandCodes("EPIN1010, 1020, 1030")).toEqual([
      "EPIN1010",
      "EPIN1020",
      "EPIN1030",
    ]);
  });

  it("re-anchors subject on each full code, joins Word-split codes", () => {
    expect(expandCodes("CURE2005, 2377, ECON3320, SOWK 2203")).toEqual([
      "CURE2005",
      "CURE2377",
      "ECON3320",
      "SOWK2203",
    ]);
  });

  it("picks a code trailing a prose clause and drops TBC placeholders", () => {
    expect(expandCodes("6 units GLBS2101, 3101")).toEqual([
      "GLBS2101",
      "GLBS3101",
    ]);
    expect(
      expandCodes("GLBS courses at 3000 or above level, *LAWS2XXX"),
    ).toEqual([]);
  });
});

describe("parseHandbookLeaf — Global Studies minor (real fixture)", () => {
  const skeleton = parseHandbookLeaf(fixture("handbook-global-studies-minor"));

  it("reads programme header", () => {
    expect(skeleton.title).toBe("Global Studies");
    expect(skeleton.programmeKind).toBe("minor");
    expect(skeleton.totalUnits).toBe(18);
  });

  it("parses 'Any N courses' electives as units-bounded baskets", () => {
    const [a, b] = skeleton.categories;
    expect(a).toMatchObject({ kind: "basket", pickN: 2, unitsRequired: 6 });
    expect(a.members).toContain("GLBS2101");
    expect(a.members).toHaveLength(9);
    expect(b).toMatchObject({ kind: "basket", pickN: 4, unitsRequired: 12 });
    // 裸号继承 + 跨 subject 重锚
    expect(b.members).toEqual(expect.arrayContaining(["CURE2377", "ECON3320"]));
  });

  it("reads the authoritative Course List roster", () => {
    const glbs2101 = skeleton.courseList.find((c) => c.code === "GLBS2101");
    expect(glbs2101).toMatchObject({
      title: "History and Historiography of Globalization",
      units: 3,
    });
    expect(skeleton.courseList.length).toBeGreaterThanOrEqual(20);
  });
});

describe("parseHandbookLeaf — Entrepreneurship minor (real fixture)", () => {
  const skeleton = parseHandbookLeaf(
    fixture("handbook-entrepreneurship-minor"),
  );

  it("classifies a take-all section as required", () => {
    const required = skeleton.categories[0];
    expect(required).toMatchObject({
      name: "Required Courses",
      kind: "required",
      unitsRequired: 3,
    });
    expect(required.members).toEqual(["EPIN2010"]);
  });

  it("expands elective baskets and drops TBC placeholder codes", () => {
    const electiveB = skeleton.categories.find((c) => c.name.endsWith("(b)"));
    expect(electiveB?.kind).toBe("basket");
    expect(electiveB?.members).toContain("EPIN3010");
    // *LAWS2XXX / *MAEG2XXX 不可枚举，不得落入成员
    expect(electiveB?.members.some((m) => m.includes("XXX"))).toBe(false);
  });

  it("strips the Word-inserted space inside Course List codes", () => {
    expect(
      skeleton.courseList.find((c) => c.code === "EPIN2010"),
    ).toMatchObject({
      title: "Toolkit for Entrepreneurs",
    });
  });
});

describe("parseHandbookLeaf — category kinds", () => {
  it("treats 'Any one course' as one-of", () => {
    const html = `
      <p>Students are required to complete a minimum of 3 units of courses as follows:</p>
      <p>1. Core Requirement:</p>
      <p>(a) Any one course from the following: 3 units MATH1010, 1020</p>
      <p>Course List</p>
      <table>
        <tr><td>Course Code</td><td>Course Title</td><td>Unit</td></tr>
        <tr><td>MATH1010</td><td>Calculus I</td><td>3</td></tr>
      </table>`;
    const [cat] = parseHandbookLeaf(html).categories;
    expect(cat).toMatchObject({ kind: "one-of", pickN: 1, unitsRequired: 3 });
    expect(cat.members).toEqual(["MATH1010", "MATH1020"]);
  });
});
