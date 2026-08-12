import { describe, expect, it } from "vitest";
import { resolveCanteenOrderUrl } from "@/lib/canteen-order-urls";
import {
  resolveCanteenIconSrc,
  resolveCanteenQrSrc,
} from "@/lib/canteen-assets";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import { afterEach } from "vitest";

const qrDir = path.join(process.cwd(), "public", "assets", "canteen-qr");
const iconDir = path.join(process.cwd(), "public", "assets", "canteen-icons");
const testId = "__vitest-canteen-asset__";

afterEach(() => {
  for (const dir of [qrDir, iconDir]) {
    for (const ext of ["png", "webp", "jpg"]) {
      try {
        rmSync(path.join(dir, `${testId}.${ext}`));
      } catch {
        /* missing */
      }
    }
  }
});

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

  it("resolves ichef, ebeneezers, Cafe Tolo, CU CAFE, and The Green links", () => {
    expect(resolveCanteenOrderUrl("mc-can")).toBe(
      "https://shop.ichefpos.com/store/UQftKWxU/instore/qrcode?tableName=VDE",
    );
    expect(resolveCanteenOrderUrl("Ebeneezer's")).toBe(
      "https://www.ebeneezers.com/",
    );
    expect(
      resolveCanteenOrderUrl("9539dbf3-3f22-4749-b532-e42357e0be96"),
    ).toBe("https://www.ebeneezers.com/");
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

  it("prefers the first matching key", () => {
    expect(resolveCanteenOrderUrl("missing", "ws-can")).toBe(
      "https://meal.pin2eat.com/store/4898/takeout",
    );
  });
});

describe("canteen asset paths", () => {
  it("returns null when no asset exists", () => {
    expect(resolveCanteenQrSrc(testId)).toBeNull();
    expect(resolveCanteenIconSrc(testId)).toBeNull();
  });

  it("rejects path traversal ids", () => {
    expect(resolveCanteenQrSrc("../evil")).toBeNull();
    expect(resolveCanteenIconSrc("a/b")).toBeNull();
  });

  it("resolves QR and icon files under public/assets", () => {
    mkdirSync(qrDir, { recursive: true });
    mkdirSync(iconDir, { recursive: true });
    writeFileSync(path.join(qrDir, `${testId}.webp`), Buffer.from("fake"));
    writeFileSync(path.join(iconDir, `${testId}.png`), Buffer.from("fake"));
    expect(resolveCanteenQrSrc(testId)).toBe(
      `/assets/canteen-qr/${testId}.webp`,
    );
    expect(resolveCanteenIconSrc(testId)).toBe(
      `/assets/canteen-icons/${testId}.png`,
    );
  });
});
