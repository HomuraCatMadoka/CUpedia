import { describe, expect, it } from "vitest";
import { parseOrderingHandoffUrl } from "@/lib/canteen-ordering-handoff";
import QRCode from "qrcode";

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

  it("can generate a self-contained QR image from the stable URL", async () => {
    const url = parseOrderingHandoffUrl(
      "https://meal.pin2eat.com/v2/package_store/pages/store/home?store_id=5500",
    );
    await expect(QRCode.toDataURL(url)).resolves.toMatch(
      /^data:image\/png;base64,/,
    );
  });
});
