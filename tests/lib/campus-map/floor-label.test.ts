import { describe, expect, it } from "vitest";

import {
  CAMPUS_MAP_FLOOR_LABEL_TRIM_CHARACTERS,
  campusMapFloorLabelError,
  campusMapFloorDisplayLabel,
  isCampusMapFloorEvidenceSource,
  normalizeCampusMapFloorLabel,
} from "@/lib/campus-map/floor-label";

describe("Campus Map Floor labels", () => {
  it("trims display labels without inventing aliases in JavaScript", () => {
    expect(normalizeCampusMapFloorLabel("  LG1  ")).toBe("LG1");
    for (const whitespace of CAMPUS_MAP_FLOOR_LABEL_TRIM_CHARACTERS) {
      expect(
        normalizeCampusMapFloorLabel(`${whitespace}LG1${whitespace}`),
      ).toBe("LG1");
      expect(campusMapFloorLabelError(whitespace)).toBe("floor-label-required");
    }
  });

  it("never treats provider candidates as Floor evidence", () => {
    expect(isCampusMapFloorEvidenceSource({ kind: "provider-candidate" })).toBe(
      false,
    );
    expect(isCampusMapFloorEvidenceSource({ kind: "field-observation" })).toBe(
      true,
    );
  });

  it("rejects blank, invalid, and oversized labels", () => {
    expect(campusMapFloorLabelError("   ")).toBe("floor-label-required");
    expect(campusMapFloorLabelError("G\u0000")).toBe("floor-label-invalid");
    expect(campusMapFloorLabelError("层".repeat(22))).toBe(
      "floor-label-too-long",
    );
    expect(campusMapFloorLabelError("1/F")).toBeNull();
  });
});

it("formats numeric floors without changing their saved identity", () => {
  expect(campusMapFloorDisplayLabel("2")).toBe("2 楼");
  expect(campusMapFloorDisplayLabel("G")).toBe("地下（G）");
  expect(campusMapFloorDisplayLabel("LG1")).toBe("LG1");
  expect(campusMapFloorDisplayLabel("1/F")).toBe("1/F");
});
