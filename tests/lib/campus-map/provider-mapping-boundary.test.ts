import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("Campus Map provider mapping boundary", () => {
  it("keeps authenticated command context on the server", async () => {
    const root = process.cwd();
    const action = await readFile(
      resolve(root, "src/lib/campus-map/provider-mapping-registry-actions.ts"),
      "utf8",
    );

    expect(action).toMatch(/^"use server";/);
    expect(action).toContain("getOptionalUser");
    expect(action).toContain("commandCampusMapProviderMapping");
  });

  it("makes the registry the only production owner of mapping rows", async () => {
    const root = process.cwd();
    const factStore = await readFile(
      resolve(root, "src/lib/campus-map/fact-store.ts"),
      "utf8",
    );
    const browseActions = await readFile(
      resolve(root, "src/lib/campus-map/browse-actions.ts"),
      "utf8",
    );

    expect(factStore).not.toContain("campusMapProviderMappings");
    expect(browseActions).toContain('from "./provider-mapping-registry"');

    const sourceFiles = (
      await Promise.all(
        [
          "src/app",
          "src/components",
          "src/lib/campus-map",
          "scripts",
          "e2e",
        ].map((path) => listSourceFiles(resolve(root, path))),
      )
    )
      .flat()
      .filter((path) => !path.endsWith("/provider-mapping-registry.ts"));
    for (const path of sourceFiles) {
      const source = await readFile(path, "utf8");
      expect(source, path).not.toMatch(
        /campusMapProviderMappings|campus_map_provider_mappings/,
      );
    }
  });
});

async function listSourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((entry) => {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) return listSourceFiles(path);
      return /\.(?:ts|tsx|mjs)$/.test(entry.name) ? [path] : [];
    }),
  );
  return files.flat();
}
