import { describe, expect, it } from "vitest";

import {
  CAMPUS_MAP_CAPABILITIES,
  CAMPUS_MAP_COORDINATE_CONVERSION_METHODS,
  CAMPUS_MAP_PIN_TYPES_V1,
  CAMPUS_MAP_PLACE_TYPES,
  CAMPUS_MAP_PROVENANCE_KINDS,
  CAMPUS_MAP_RIGHTS_STATUSES,
  CAMPUS_MAP_SOURCE_COORDINATE_CRS,
  CAMPUS_MAP_V2_GENDERS,
  CAMPUS_MAP_V2_WHEELCHAIR_ACCESS,
} from "@/lib/campus-map/controlled-values";
import { CAMPUS_MAP_PUBLISH_CONTROLLED_VALUES } from "@/lib/campus-map/publish-contract";

describe("Campus Map controlled values", () => {
  it("shares one client-safe runtime source with the publish snapshot codec", () => {
    expect(CAMPUS_MAP_PUBLISH_CONTROLLED_VALUES).toEqual({
      placeType: CAMPUS_MAP_PLACE_TYPES,
      capability: CAMPUS_MAP_CAPABILITIES,
      gender: CAMPUS_MAP_V2_GENDERS,
      wheelchairAccess: CAMPUS_MAP_V2_WHEELCHAIR_ACCESS,
      provenanceKind: CAMPUS_MAP_PROVENANCE_KINDS,
      rightsStatus: CAMPUS_MAP_RIGHTS_STATUSES,
      sourceCoordinateCrs: CAMPUS_MAP_SOURCE_COORDINATE_CRS,
      coordinateConversionMethod: CAMPUS_MAP_COORDINATE_CONVERSION_METHODS,
    });
    expect(CAMPUS_MAP_PIN_TYPES_V1).toEqual([
      "toilet",
      "water",
      "printer",
      "common-space",
      "classroom",
    ]);
  });
});
