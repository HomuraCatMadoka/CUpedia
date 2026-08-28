import { describe, expect, it } from "vitest";

import { selectProfessorPortraitBackfillPeople } from "../../scripts/materialize-professor-portraits";
import type { ProfessorCardSource } from "@/lib/professor-card-source";

function source(imageUrl: string | null): ProfessorCardSource {
  return {
    source: "cuhk_department:cse",
    sourceKey: "person",
    profileUrl: "https://www.cse.cuhk.edu.hk/people/person/",
    profileVerifiedAt: "2026-08-01T00:00:00Z",
    appointmentKind: "regular",
    isCurrent: true,
    imageUrl,
  };
}

describe("professor portrait materialization selection", () => {
  it("applies the canary limit after excluding people without portrait candidates", () => {
    const people = Array.from({ length: 12 }, (_, index) => ({
      personId: `person-${index + 1}`,
    }));
    const sourcesByPerson = new Map(
      people.map(({ personId }, index) => [
        personId,
        [
          source(
            index < 8 ? null : `https://www.cse.cuhk.edu.hk/${personId}.jpg`,
          ),
        ],
      ]),
    );

    expect(
      selectProfessorPortraitBackfillPeople(people, sourcesByPerson, 2),
    ).toEqual([{ personId: "person-9" }, { personId: "person-10" }]);
  });
});
