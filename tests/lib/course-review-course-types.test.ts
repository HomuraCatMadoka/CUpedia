import { describe, expect, it } from "vitest";

import { getCourseGenderRestriction } from "@/app/(main)/courses/course-types";

describe("getCourseGenderRestriction", () => {
  it("identifies PHED male- and female-only offerings", () => {
    expect(getCourseGenderRestriction("PHED", "For male only.")).toBe("male");
    expect(getCourseGenderRestriction("PHED", "For female only.")).toBe(
      "female",
    );
  });

  it("accepts the PHED1043 source typo", () => {
    expect(getCourseGenderRestriction("PHED", "For male olny.")).toBe("male");
  });

  it("leaves unrestricted PHED and non-PHED courses unlabelled", () => {
    expect(
      getCourseGenderRestriction("PHED", "Not for PESH Majors."),
    ).toBeNull();
    expect(getCourseGenderRestriction("ANTH", "For female only.")).toBeNull();
  });
});
