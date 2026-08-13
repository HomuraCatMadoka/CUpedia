import { describe, expect, it } from "vitest";
import { parseOrderingHandoffUrl } from "@/lib/canteen-ordering-handoff";

describe("parseOrderingHandoffUrl", () => {
  it("preserves stable provider context", () => {
    expect(
      parseOrderingHandoffUrl(
        "https://shop.ichefpos.com/store/UQftKWxU/instore/ordering?tableName=VDE",
      ),
    ).toBe(
      "https://shop.ichefpos.com/store/UQftKWxU/instore/ordering?tableName=VDE",
    );
  });

  it("rejects session and payment URLs", () => {
    expect(() =>
      parseOrderingHandoffUrl(
        "https://shop.ichefpos.com/checkout?sessionUuid=temporary",
      ),
    ).toThrow("EPHEMERAL_ORDERING_HANDOFF_URL");
  });
});
