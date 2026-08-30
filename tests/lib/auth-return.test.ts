import { describe, expect, it } from "vitest";

import { safeAuthReturnPath } from "@/lib/auth-return";

describe("authentication return path", () => {
  it("keeps a local Campus Map return and rejects external redirects", () => {
    expect(safeAuthReturnPath("/prototype/campus-map?v=1&task=create")).toBe(
      "/prototype/campus-map?v=1&task=create",
    );
    expect(safeAuthReturnPath("https://evil.example/path")).toBe("/");
    expect(safeAuthReturnPath("//evil.example/path")).toBe("/");
    expect(safeAuthReturnPath("/\\evil.example/path")).toBe("/");
  });
});
