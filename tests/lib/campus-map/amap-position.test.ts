import { describe, expect, it } from "vitest";

import { providerPositionToWgs84 } from "@/lib/campus-map/amap-position";

describe("Campus Map AMap position adapter (#807)", () => {
  it("converts a provider position with the shared WGS84 offset", () => {
    const position = providerPositionToWgs84([114.225, 22.435], [0.01, 0.01]);

    expect(position[0]).toBeCloseTo(114.215, 12);
    expect(position[1]).toBeCloseTo(22.425, 12);
  });
});
