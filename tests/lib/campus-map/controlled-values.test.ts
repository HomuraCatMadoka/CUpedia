import { describe, expect, it } from "vitest";

import {
  CAMPUS_MAP_AUDIENCES,
  CAMPUS_MAP_CAPABILITIES,
  CAMPUS_MAP_COORDINATE_CONVERSION_METHODS,
  CAMPUS_MAP_CREDENTIAL_REQUIREMENTS,
  CAMPUS_MAP_GENDERS,
  CAMPUS_MAP_PIN_TYPES,
  CAMPUS_MAP_PROVENANCE_KINDS,
  CAMPUS_MAP_RESERVATION_REQUIREMENTS,
  CAMPUS_MAP_RIGHTS_STATUSES,
  CAMPUS_MAP_SOURCE_COORDINATE_CRS,
  CAMPUS_MAP_TEMPORARY_STATUSES,
  CAMPUS_MAP_WHEELCHAIR_ACCESS,
} from "@/lib/campus-map/controlled-values";
import { CAMPUS_MAP_PUBLISH_CONTROLLED_VALUES } from "@/lib/campus-map/publish-contract";

describe("Campus Map controlled values", () => {
  it("shares one client-safe runtime source with the publish snapshot codec", () => {
    expect(CAMPUS_MAP_PUBLISH_CONTROLLED_VALUES).toEqual({
      pinType: CAMPUS_MAP_PIN_TYPES,
      capability: CAMPUS_MAP_CAPABILITIES,
      gender: CAMPUS_MAP_GENDERS,
      wheelchairAccess: CAMPUS_MAP_WHEELCHAIR_ACCESS,
      audience: CAMPUS_MAP_AUDIENCES,
      credentialRequirement: CAMPUS_MAP_CREDENTIAL_REQUIREMENTS,
      reservationRequirement: CAMPUS_MAP_RESERVATION_REQUIREMENTS,
      temporaryStatus: CAMPUS_MAP_TEMPORARY_STATUSES,
      provenanceKind: CAMPUS_MAP_PROVENANCE_KINDS,
      rightsStatus: CAMPUS_MAP_RIGHTS_STATUSES,
      sourceCoordinateCrs: CAMPUS_MAP_SOURCE_COORDINATE_CRS,
      coordinateConversionMethod: CAMPUS_MAP_COORDINATE_CONVERSION_METHODS,
    });
  });
});
