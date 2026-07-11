import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { parseHandbookLeaf, expandCodes } from "@/lib/parseHandbookLeaf";

const fixture = (name: string) =>
  readFileSync(new URL(`./fixtures/${name}.html`, import.meta.url), "utf8");
const handbook = (name: string) =>
  readFileSync(
    new URL(`../../scripts/data/handbook/${name}.html`, import.meta.url),
    "utf8",
  );
const hasHandbookData = existsSync(
  new URL(
    "../../scripts/data/handbook/2022-23-b-sc-in-biology.html",
    import.meta.url,
  ),
);

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

  it("keeps shorthand after handbook footnotes and slash alternatives", () => {
    expect(
      expandCodes("ECON1101[a], 1111, CHPR4901#, 4902 / PHPC1001†"),
    ).toEqual(["ECON1101", "ECON1111", "CHPR4901", "CHPR4902", "PHPC1001"]);
  });

  it("keeps the current code before a bracketed replacement annotation", () => {
    expect(
      expandCodes(
        "BMBL1001, 1002[3001], 2001, CURE1401 [# CUMT1001], HKSL1003[2050] 6",
      ),
    ).toEqual(["BMBL1001", "BMBL1002", "BMBL2001", "CURE1401", "HKSL1003"]);
  });

  it("separates a final course code from the Word table unit column", () => {
    expect(expandCodes("LING1000, 2003, 2004, 2005 12")).toEqual([
      "LING1000",
      "LING2003",
      "LING2004",
      "LING2005",
    ]);
  });

  it("restores the outer subject after a parenthesized alternative", () => {
    expect(expandCodes("BIOL3630 (or FNSC4101 and 4102#), 3710, 4120")).toEqual(
      ["BIOL3630", "FNSC4101", "FNSC4102", "BIOL3710", "BIOL4120"],
    );
  });

  it("keeps a bare course followed by a capstone annotation and units", () => {
    expect(expandCodes("ARCH2111, 4116 (capstone course) 30")).toEqual([
      "ARCH2111",
      "ARCH4116",
    ]);
  });

  it("restores the outer subject after a parenthesized alternative following a bare code", () => {
    expect(
      expandCodes("BIOL3310, 3630 (or FNSC4101 and 4102), 3710, 4120"),
    ).toEqual([
      "BIOL3310",
      "BIOL3630",
      "FNSC4101",
      "FNSC4102",
      "BIOL3710",
      "BIOL4120",
    ]);
  });

  it("keeps an inherited code before the next flattened unit group", () => {
    expect(expandCodes("MATH3030, 5051 3 units from MATH3040, 4080")).toEqual([
      "MATH3030",
      "MATH5051",
      "MATH3040",
      "MATH4080",
    ]);
  });

  it("keeps inherited codes before later full codes and prefers the current subject annotation", () => {
    expect(expandCodes("CLED3510 or 3610 CLED4510 or 4650")).toEqual([
      "CLED3510",
      "CLED3610",
      "CLED4510",
      "CLED4650",
    ]);
    expect(expandCodes("ACCT1111, DOTE[DSME]1030, 1040")).toEqual([
      "ACCT1111",
      "DOTE1030",
      "DOTE1040",
    ]);
  });

  it("repairs spaces inserted inside a Word-split course code", () => {
    expect(expandCodes("FTEC2 101/ESTR2520, FTEC3001, 3 002")).toEqual([
      "FTEC2101",
      "ESTR2520",
      "FTEC3001",
      "FTEC3002",
    ]);
  });
});

describe.runIf(hasHandbookData)(
  "parseHandbookLeaf — downloaded Handbook corpus",
  () => {
    it("collapses a repeated degree heading before a co-terminal suffix", () => {
      expect(
        parseHandbookLeaf(
          handbook(
            "2022-23-b-a-english-studies-and-b-ed-english-language-education",
          ),
        ).title,
      ).toBe(
        "Bachelor of Arts (English Studies) and Bachelor of Education (English Language Education) Co-terminal Double Degree Programme",
      );
    });

    it.each(["2022-23", "2023-24", "2024-25", "2025-26"])(
      "does not truncate %s Economics after the faculty package",
      (year) => {
        const skeleton = parseHandbookLeaf(
          handbook(`${year}-b-s-sc-in-economics`),
        );
        expect(skeleton.categories.map(({ name }) => name)).toEqual(
          expect.arrayContaining(["Faculty Package", "Required Courses"]),
        );
        expect(
          skeleton.categories.find(({ name }) => name === "Required Courses")
            ?.members,
        ).toEqual(expect.arrayContaining(["ECON1101", "ECON1111"]));
      },
    );

    it("keeps footnoted Community Health Practice courses", () => {
      const skeleton = parseHandbookLeaf(
        handbook("2025-26-b-sc-in-community-health-practice"),
      );
      const required = skeleton.categories.find(
        ({ name }) => name === "Required Courses",
      );
      expect(required?.unitsRequired).toBe(45);
      expect(required?.members).toEqual(
        expect.arrayContaining(["CHPR4901", "CHPR4902", "PHPC1017"]),
      );
    });

    it("reads footnoted total units and does not treat subgroup course codes as units", () => {
      expect(
        parseHandbookLeaf(handbook("2022-23-b-sc-in-biology")).totalUnits,
      ).toBe(64);
      const law = parseHandbookLeaf(
        handbook("2025-26-ll-b-bachelor-of-laws-programme"),
      );
      expect(
        law.categories.every(({ unitsRequired }) => unitsRequired !== 290),
      ).toBe(true);
      expect(
        parseHandbookLeaf(
          handbook("2022-23-b-a-in-bimodal-bilingual-studies"),
        ).categories.find(({ name }) => name === "Required Courses (a)"),
      ).toMatchObject({
        unitsRequired: 12,
        members: expect.arrayContaining(["LING2005"]),
      });
    });

    it("preserves explicit textual elective rules without enumerable codes", () => {
      const theology = parseHandbookLeaf(handbook("2022-23-b-a-in-theology"));
      expect(
        theology.categories.some(
          ({ name, members, textualRule }) =>
            name === "Elective Courses (a)" &&
            members.length === 0 &&
            textualRule?.includes("Theological Studies Areas"),
        ),
      ).toBe(true);
    });

    it("parses spaced numeric markers and Law course footnotes", () => {
      const law = parseHandbookLeaf(
        handbook("2025-26-ll-b-bachelor-of-laws-programme"),
      );
      expect(
        law.categories.find(({ name }) => name === "Required Courses"),
      ).toMatchObject({
        unitsRequired: 45,
        members: expect.arrayContaining(["LAWS1010", "LAWS1020", "LAWS4152"]),
      });
      expect(
        law.categories.find(({ name }) => name === "Elective Courses"),
      ).toMatchObject({
        unitsRequired: 45,
        members: [],
      });
    });

    it("repairs Word-split category labels", () => {
      const electronic = parseHandbookLeaf(
        handbook("2022-23-b-eng-in-electronic-engineering"),
      );
      expect(
        electronic.categories.some(
          ({ name }) => name === "Foundation Courses (a)",
        ),
      ).toBe(true);
    });

    it("keeps inline roman-numeral groups in their source category", () => {
      const bilingual = parseHandbookLeaf(
        handbook("2022-23-b-a-in-bimodal-bilingual-studies"),
      );
      const elective = bilingual.categories.find(
        ({ name }) => name === "Elective Courses (b)",
      );
      expect(elective?.members).toEqual(
        expect.arrayContaining([
          "BMBL4101",
          "BMBL4102",
          "BMBL4201",
          "BMBL4202",
        ]),
      );
      expect(elective?.textualRule).toContain("(i)");
      expect(elective?.textualRule).toContain("(ii)");
    });

    it("keeps lettered children under a top-level category that has direct courses", () => {
      const chineseEducation = parseHandbookLeaf(
        handbook(
          "2022-23-b-a-chinese-language-studies-and-b-ed-chinese-language-education",
        ),
      );
      expect(
        chineseEducation.categories.find(
          ({ name }) => name === "Required Courses",
        )?.members,
      ).toEqual(expect.arrayContaining(["CLED2530", "CLED3530", "CLED4520"]));
    });

    it("does not treat parenthesized prose as a category marker", () => {
      const biology = parseHandbookLeaf(handbook("2022-23-b-sc-in-biology"));
      expect(
        biology.categories.find(({ name }) => name === "Faculty Package")
          ?.members,
      ).toEqual(
        expect.arrayContaining([
          "CHEM1070",
          "MATH1010",
          "MATH1018",
          "PHYS1111",
          "STAT1011",
        ]),
      );
    });

    it("reads category units followed by a footnote", () => {
      const communication = parseHandbookLeaf(
        handbook("2022-23-b-s-sc-in-global-communication"),
      );
      expect(
        communication.categories.find(
          ({ name }) => name === "Required Courses (b)",
        )?.unitsRequired,
      ).toBe(12);
      expect(
        communication.categories.some(
          ({ name }) => name === "Required Courses (s)",
        ),
      ).toBe(false);
    });

    it("does not fold optional stream requirements into principal electives", () => {
      const biomedical = parseHandbookLeaf(
        handbook("2022-23-b-eng-in-biomedical-engineering"),
      );
      const elective = biomedical.categories.find(
        ({ name }) => name === "Elective Courses",
      );
      expect(elective?.members).toContain("MBTE4320");
      expect(elective?.members).not.toContain("BMEG4998");
      expect(elective?.members).not.toContain("BMEG4999");
    });

    it("does not truncate a requirement that mentions a course list", () => {
      const geography = parseHandbookLeaf(
        handbook("2022-23-b-s-sc-in-geography-and-resource-management"),
      );
      const electiveD = geography.categories.find(
        ({ name }) => name === "Elective Courses (d)",
      );
      expect(electiveD?.unitsRequired).toBe(27);
      expect(electiveD?.members).toEqual(
        expect.arrayContaining(["GRMD1003", "GRMD4503", "URSP3800"]),
      );
    });
  },
);

describe("parseHandbookLeaf — Global Studies minor (real fixture)", () => {
  const skeleton = parseHandbookLeaf(fixture("handbook-global-studies-minor"));

  it("reads programme header", () => {
    expect(skeleton.title).toBe("Global Studies");
    expect(skeleton.programmeKind).toBe("minor");
    expect(skeleton.totalUnits).toBe(18);
  });

  it("parses explicit course counts and only derivable unit totals", () => {
    const [a, b] = skeleton.categories;
    expect(a).toMatchObject({ kind: "basket", pickN: 2, unitsRequired: 6 });
    expect(a.members).toContain("GLBS2101");
    expect(a.members).toHaveLength(9);
    expect(b).toMatchObject({ kind: "basket", pickN: 4, unitsRequired: null });
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
