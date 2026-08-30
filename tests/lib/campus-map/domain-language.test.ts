import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const identitySources = [
  "src/lib/campus-map/scene-kernel.ts",
  "src/lib/campus-map/scene-codec.ts",
  "src/lib/campus-map/scene-semantics.ts",
  "src/lib/campus-map/scene-driver.ts",
  "src/components/campus-map/campus-map-runtime.tsx",
];

describe("Campus Map domain language", () => {
  it("uses Place rather than Facility for canonical identity", () => {
    for (const path of identitySources) {
      const source = readFileSync(path, "utf8");
      expect(source, path).not.toMatch(/\bfacilityId\b/);
      expect(source, path).not.toMatch(/kind:\s*"facility"/);
      expect(source, path).not.toContain(
        "type Facility = CampusMapBrowsePlace",
      );
    }
  });
});
