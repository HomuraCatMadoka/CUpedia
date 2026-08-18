import { describe, expect, it } from "vitest";
import {
  orderingHandoffFromMenuSource,
  parseOrderingHandoffUrl,
} from "@/lib/canteen-ordering-handoff";

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

describe("orderingHandoffFromMenuSource", () => {
  it("returns null without a store locator", () => {
    expect(orderingHandoffFromMenuSource(null)).toBeNull();
    expect(
      orderingHandoffFromMenuSource({
        provider: "pinme",
        externalStoreId: "  ",
      }),
    ).toBeNull();
  });

  it("uses the audited official URL for known PINME/Aigens/iCHEF stores", () => {
    expect(
      orderingHandoffFromMenuSource({
        provider: "pinme",
        externalStoreId: "4898",
      }),
    ).toEqual({
      provider: "pinme",
      url: "https://meal.pin2eat.com/store/4898/takeout",
    });
    expect(
      orderingHandoffFromMenuSource({
        provider: "aigens",
        externalStoreId: "112891",
      }),
    ).toEqual({
      provider: "aigens",
      url: "https://csd.order.place/home/store/112891?_aigens_source=scan&catMode=false&mode=prekiosk",
    });
    expect(
      orderingHandoffFromMenuSource({
        provider: "ichef",
        externalStoreId: "UQftKWxU",
      }),
    ).toEqual({
      provider: "ichef",
      url: "https://shop.ichefpos.com/store/UQftKWxU/instore/qrcode?tableName=VDE",
    });
  });

  it("builds a stable PINME takeout URL for other stores already in the DB", () => {
    expect(
      orderingHandoffFromMenuSource({
        provider: "pinme",
        externalStoreId: "7777",
      }),
    ).toEqual({
      provider: "pinme",
      url: "https://meal.pin2eat.com/store/7777/takeout",
    });
  });
});


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
