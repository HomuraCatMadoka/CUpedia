import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const routeRoot = join(process.cwd(), "src/app/(main)/campus-map");

function sourceFiles(path: string): string[] {
  return readdirSync(path).flatMap((name) => {
    const child = join(path, name);
    return statSync(child).isDirectory()
      ? sourceFiles(child)
      : child.endsWith(".ts") || child.endsWith(".tsx")
        ? [child]
        : [];
  });
}

describe("Campus Map public history read seam (#719)", () => {
  it("keeps routes away from Drizzle rows and schema joins", () => {
    const source = sourceFiles(routeRoot)
      .map((file) => readFileSync(file, "utf8"))
      .join("\n");

    expect(source).not.toMatch(/from ["']drizzle-orm/);
    expect(source).not.toMatch(/from ["']@\/db/);
    expect(source).not.toMatch(/from ["']@\/db\/schema/);
    expect(source).toContain("getCampusMapPlaceHistory");
    expect(source).toContain("getCampusMapPlaceRevision");
    expect(source).toContain("getCampusMapChangeset");
    expect(source).toContain("listCampusMapChangesets");
  });
});
