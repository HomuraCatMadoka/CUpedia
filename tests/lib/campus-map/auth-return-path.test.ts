import { describe, expect, it } from "vitest";

import { getCampusMapReturnPath } from "@/lib/campus-map/auth-return-path";

describe("Campus Map authentication return path", () => {
  it("keeps the requested nested path and query without its origin", () => {
    expect(
      getCampusMapReturnPath(
        "https://cupedia.org/campus-map/places/place-1?cursor=next-page",
      ),
    ).toBe("/campus-map/places/place-1?cursor=next-page");
  });
});
