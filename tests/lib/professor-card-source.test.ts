import { describe, expect, it } from "vitest";

import {
  isProfessorCardEligible,
  selectProfessorImages,
  selectProfessorDepartmentSource,
  selectProfessorProfile,
  type ProfessorCardSource,
} from "@/lib/professor-card-source";

function source(
  values: Partial<ProfessorCardSource> = {},
): ProfessorCardSource {
  return {
    source: "cuhk_department:cse-faculty",
    sourceKey: "cse-person",
    profileUrl: "https://www.cse.cuhk.edu.hk/people/person/",
    profileVerifiedAt: "2026-08-05T00:00:00Z",
    appointmentKind: "regular",
    isCurrent: true,
    imageUrl: "https://www.cse.cuhk.edu.hk/people/person.jpg",
    ...values,
  };
}

describe("professor card source selection", () => {
  it("creates cards only for official course instructors", () => {
    expect(isProfessorCardEligible("official", true)).toBe(true);
    expect(isProfessorCardEligible("unverified", true)).toBe(false);
    expect(isProfessorCardEligible("official", false)).toBe(false);
  });

  it("prefers a verified department profile over Research Portal", () => {
    expect(
      selectProfessorProfile("https://research.cuhk.edu.hk/person/", [
        source(),
      ]),
    ).toEqual({
      kind: "department",
      url: "https://www.cse.cuhk.edu.hk/people/person/",
    });
  });

  it("selects a regular appointment deterministically", () => {
    expect(
      selectProfessorProfile("https://research.cuhk.edu.hk/person/", [
        source({
          source: "cuhk_department:physics-honorary",
          sourceKey: "honorary",
          profileUrl: "https://wp.phy.cuhk.edu.hk/honorary/person/",
          appointmentKind: "emeritus",
        }),
        source(),
      ]),
    ).toEqual({
      kind: "department",
      url: "https://www.cse.cuhk.edu.hk/people/person/",
    });
  });

  it("returns the selected department source for card metadata", () => {
    const regular = source({ sourceKey: "regular" });
    expect(
      selectProfessorDepartmentSource([
        source({ sourceKey: "honorary", appointmentKind: "honorary" }),
        regular,
      ]),
    ).toBe(regular);
  });

  it("does not let an unknown appointment outrank an explicit emeritus role", () => {
    const emeritus = source({
      sourceKey: "current",
      appointmentKind: "emeritus",
    });
    expect(
      selectProfessorDepartmentSource([
        source({ sourceKey: "legacy", appointmentKind: null }),
        emeritus,
      ]),
    ).toBe(emeritus);
  });

  it("falls back to Research Portal when the department link is unusable", () => {
    expect(
      selectProfessorProfile("https://research.cuhk.edu.hk/person/", [
        source({ profileVerifiedAt: null }),
        source({ isCurrent: false }),
      ]),
    ).toEqual({
      kind: "research_portal",
      url: "https://research.cuhk.edu.hk/person/",
    });
  });

  it("orders department and Portal portraits as runtime fallbacks", () => {
    const portal = source({
      source: "cuhk_research_portal",
      sourceKey: "portal-person",
      profileUrl: "https://research.cuhk.edu.hk/en/persons/person/",
      imageUrl: "https://research.cuhk.edu.hk/files-asset/123/photo.jpg/",
    });
    expect(selectProfessorImages([source(), portal])).toEqual([
      "https://www.cse.cuhk.edu.hk/people/person.jpg",
      portal.imageUrl,
    ]);
    expect(selectProfessorImages([source({ imageUrl: null }), portal])).toEqual(
      [portal.imageUrl],
    );
  });

  it("deduplicates identical department and Portal portraits", () => {
    const imageUrl = "https://research.cuhk.edu.hk/files-asset/123/photo.jpg/";
    expect(
      selectProfessorImages([
        source({ imageUrl }),
        source({
          source: "cuhk_research_portal",
          sourceKey: "portal-person",
          imageUrl,
        }),
      ]),
    ).toEqual([imageUrl]);
  });

  it("returns null when neither official profile is usable", () => {
    expect(selectProfessorProfile(null, [])).toBeNull();
  });
});
