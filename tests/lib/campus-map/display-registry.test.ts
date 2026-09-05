import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  CAMPUS_MAP_CAPABILITIES,
  CAMPUS_MAP_PIN_TYPES_V1,
  CAMPUS_MAP_PLACE_TYPES,
  CAMPUS_MAP_PROVENANCE_KINDS,
  CAMPUS_MAP_TEMPORARY_STATUSES,
  CAMPUS_MAP_V2_GENDERS,
  CAMPUS_MAP_V2_WHEELCHAIR_ACCESS,
} from "@/lib/campus-map/controlled-values";
import {
  campusMapDisplayOptionLabel,
  campusMapFactFieldLabel,
  campusMapPlaceTypeLabel,
  CAMPUS_MAP_DISPLAY_REGISTRY,
  displayCampusMapFactValue,
} from "@/lib/campus-map/display-registry";
import { CAMPUS_MAP_EDIT_SCHEMA } from "@/lib/campus-map/edit-schema";

const optionContracts = {
  capabilities: CAMPUS_MAP_CAPABILITIES,
  gender: CAMPUS_MAP_V2_GENDERS,
  wheelchairAccess: CAMPUS_MAP_V2_WHEELCHAIR_ACCESS,
  temporaryStatus: CAMPUS_MAP_TEMPORARY_STATUSES,
  provenanceKind: CAMPUS_MAP_PROVENANCE_KINDS,
} as const;

describe("Campus Map display registry", () => {
  it("covers every controlled public value once", () => {
    expect(Object.keys(CAMPUS_MAP_DISPLAY_REGISTRY.placeTypes).sort()).toEqual(
      [...CAMPUS_MAP_PLACE_TYPES].sort(),
    );
    for (const [group, controlledValues] of Object.entries(optionContracts)) {
      const displayedValues = CAMPUS_MAP_DISPLAY_REGISTRY.options[
        group as keyof typeof optionContracts
      ].map((option) => option.value);
      expect(new Set(displayedValues)).toEqual(new Set(controlledValues));
      expect(displayedValues).toHaveLength(new Set(displayedValues).size);
    }
  });

  it("provides one vocabulary for fields, place types, and controlled values", () => {
    expect(campusMapFactFieldLabel("placeType")).toBe("地点类型");
    expect(campusMapPlaceTypeLabel("printer")).toBe("打印服务");
    expect(campusMapDisplayOptionLabel("audience", "cuhk-member")).toBe(
      "中大成员",
    );
    expect(campusMapDisplayOptionLabel("gender", "unknown")).toBe("未知");
    expect(campusMapDisplayOptionLabel("wheelchairAccess", "unknown")).toBe(
      "未知",
    );
    expect(campusMapDisplayOptionLabel("temporaryStatus", "unknown")).toBe(
      "未知",
    );
    expect(displayCampusMapFactValue("capabilities", ["print", "scan"])).toBe(
      "打印、扫描",
    );
    expect(displayCampusMapFactValue("futureField", "future-value")).toBe(
      "future-value",
    );
  });

  it("keeps the unchanged public browse UI on its legacy categories", () => {
    expect(CAMPUS_MAP_DISPLAY_REGISTRY.browseCategories).toEqual([
      "water",
      "toilet",
      "printer",
      "common-space",
      "classroom",
    ]);
    expect(new Set(CAMPUS_MAP_DISPLAY_REGISTRY.browseCategories)).toEqual(
      new Set(CAMPUS_MAP_PIN_TYPES_V1),
    );

    for (const file of [
      "browse-card-presentation.tsx",
      "place-detail.tsx",
      "history-shell.tsx",
    ]) {
      const readSurfaceSource = readFileSync(
        join(process.cwd(), "src/components/campus-map", file),
        "utf8",
      );
      expect(readSurfaceSource).not.toContain("edit-schema");
    }
  });

  it("keeps editor configuration limited to edit behavior", () => {
    expect(CAMPUS_MAP_EDIT_SCHEMA).not.toHaveProperty("options");
    for (const definition of Object.values(
      CAMPUS_MAP_EDIT_SCHEMA.fieldDefinitions,
    )) {
      expect(Object.keys(definition)).toEqual(["isValid"]);
    }
    for (const preset of CAMPUS_MAP_EDIT_SCHEMA.presets) {
      expect(preset).not.toHaveProperty("label");
      expect(preset).toHaveProperty("defaultName");
      expect(preset).toHaveProperty("fields");
      expect(preset).toHaveProperty("requiredFields");
    }
  });
});
