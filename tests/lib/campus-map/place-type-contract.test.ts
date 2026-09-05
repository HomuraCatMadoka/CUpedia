import { describe, expect, it } from "vitest";

import { CAMPUS_MAP_FACT_SCHEMA_V2 } from "@/db/schema";
import { CAMPUS_MAP_PLACE_TYPES } from "@/lib/campus-map/controlled-values";
import { CAMPUS_MAP_EDIT_SCHEMA } from "@/lib/campus-map/edit-schema";
import {
  CAMPUS_MAP_APPLICABLE_FACT_FIELDS_V2,
  CAMPUS_MAP_REQUIRED_FACT_FIELDS_V2,
} from "@/lib/campus-map/place-type-contract";

describe("Campus Map V2 Place-type contract", () => {
  it("keeps persistence and editor applicability derived from one contract", () => {
    for (const placeType of CAMPUS_MAP_PLACE_TYPES) {
      const applicable = [...CAMPUS_MAP_APPLICABLE_FACT_FIELDS_V2[placeType]];
      const persisted = CAMPUS_MAP_FACT_SCHEMA_V2.placeTypes[placeType];
      const editor = CAMPUS_MAP_EDIT_SCHEMA.presets.find(
        (preset) => preset.placeType === placeType,
      );

      expect(editor, placeType).toBeDefined();
      expect(persisted.applicableFields).toEqual(applicable);
      expect(persisted.requiredFields).toEqual([
        ...CAMPUS_MAP_REQUIRED_FACT_FIELDS_V2,
      ]);
      expect(
        editor?.fields.filter((field) => field !== "sources").sort(),
      ).toEqual(applicable.sort());
      expect(editor?.requiredFields).toEqual([
        ...CAMPUS_MAP_REQUIRED_FACT_FIELDS_V2,
        "sources",
      ]);
    }
  });
});
