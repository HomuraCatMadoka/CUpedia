import { describe, expect, it } from "vitest";

import {
  canonicalizeCampusMapUuid,
  isCampusMapUuid,
  isCanonicalCampusMapUuid,
} from "@/lib/campus-map/canonical-uuid";

describe("Campus Map UUID identity", () => {
  it("normalizes accepted external UUID input once", () => {
    const upper = "0198F4C6-88F4-7E52-88C3-E570808C9A73";

    expect(isCampusMapUuid(upper)).toBe(true);
    expect(canonicalizeCampusMapUuid(upper)).toBe(
      "0198f4c6-88f4-7e52-88c3-e570808c9a73",
    );
  });

  it("distinguishes canonical identity from merely parseable input", () => {
    expect(
      isCanonicalCampusMapUuid("0198f4c6-88f4-7e52-88c3-e570808c9a73"),
    ).toBe(true);
    expect(
      isCanonicalCampusMapUuid("0198F4C6-88F4-7E52-88C3-E570808C9A73"),
    ).toBe(false);
  });

  it("leaves non-UUID values unchanged during command normalization", () => {
    expect(canonicalizeCampusMapUuid("not-a-uuid")).toBe("not-a-uuid");
    expect(canonicalizeCampusMapUuid(null)).toBeNull();
    expect(isCampusMapUuid("not-a-uuid")).toBe(false);
  });
});
