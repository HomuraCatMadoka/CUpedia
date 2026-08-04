import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const files = ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"];

function checksum(file: string) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

describe("MapLibre worker assets", () => {
  it.each(files)(
    "keeps public/%s in sync with the installed package",
    (file) => {
      const bundled = path.join(
        process.cwd(),
        "node_modules/maplibre-gl/dist",
        file,
      );
      const published = path.join(
        process.cwd(),
        "public/vendor/maplibre",
        file,
      );

      expect(checksum(published)).toBe(checksum(bundled));
    },
  );
});
