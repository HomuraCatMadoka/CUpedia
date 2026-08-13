import { describe, expect, it } from "vitest";
import { resolveCanteenOrderUrl } from "@/lib/canteen-order-urls";

describe("canteen order urls", () => {
  it("returns null when no mapping exists", () => {
    expect(resolveCanteenOrderUrl("unknown-canteen")).toBeNull();
  });

  it("resolves pin-me takeout links by canteen name", () => {
    expect(resolveCanteenOrderUrl("ws-can")).toBe(
      "https://meal.pin2eat.com/store/4898/takeout",
    );
    expect(resolveCanteenOrderUrl("uc-can")).toBe(
      "https://meal.pin2eat.com/store/5198/takeout",
    );
    expect(resolveCanteenOrderUrl("na-can")).toBe(
      "https://meal.pin2eat.com/store/5500/takeout",
    );
  });

  it("resolves the configured non-Pin-Me links", () => {
    expect(resolveCanteenOrderUrl("mc-can")).toBe(
      "https://shop.ichefpos.com/store/UQftKWxU/instore/qrcode?tableName=VDE",
    );
    expect(resolveCanteenOrderUrl("Ebeneezer's")).toBe(
      "https://www.ebeneezers.com/",
    );
    expect(resolveCanteenOrderUrl("9539dbf3-3f22-4749-b532-e42357e0be96")).toBe(
      "https://www.ebeneezers.com/",
    );
    expect(resolveCanteenOrderUrl("Cafe Tolo")).toBe(
      "https://meal.pin2eat.com/v2/package_store/pages/store/home?store_id=4899#index",
    );
    expect(resolveCanteenOrderUrl("CU CAFE")).toBe(
      "https://csd.order.place/home/store/112891?_aigens_source=scan&catMode=false&mode=prekiosk",
    );
    expect(resolveCanteenOrderUrl("The Green")).toBe(
      "https://meal.pin2eat.com/v2/package_store/pages/store/home?store_id=5581",
    );
  });

  it("uses the first configured key", () => {
    expect(resolveCanteenOrderUrl("missing", "ws-can")).toBe(
      "https://meal.pin2eat.com/store/4898/takeout",
    );
  });
});
