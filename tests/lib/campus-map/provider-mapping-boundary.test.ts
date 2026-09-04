import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("Campus Map provider mapping boundary", () => {
  it("preloads exact mappings without making provider ids scene identity", async () => {
    const root = process.cwd();
    const factStore = await readFile(
      resolve(root, "src/lib/campus-map/fact-store.ts"),
      "utf8",
    );
    const browseActions = await readFile(
      resolve(root, "src/lib/campus-map/browse-actions.ts"),
      "utf8",
    );
    const runtime = await readFile(
      resolve(root, "src/components/campus-map/campus-map-runtime.tsx"),
      "utf8",
    );

    expect(factStore).not.toContain("campusMapProviderMappings");
    expect(browseActions).toContain("listCampusMapProviderMappings");
    expect(browseActions).toContain("loadCampusMapAmapHotspotMappings");
    expect(runtime).toContain("initialAmapHotspotMappings");
    expect(runtime).not.toMatch(
      /loadCampusMapAmapPoiCard|OPEN_PROVIDER_POI|provider-mapping-registry|commandCampusMapProviderMapping/,
    );
  });
});
