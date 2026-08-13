import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  resolveCanteenIconSrc,
  resolveCanteenQrSrc,
} from "@/lib/canteen-assets";

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
