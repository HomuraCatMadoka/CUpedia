import { describe, expect, it } from "vitest";

import {
  parseFoodlePendingIntent,
  safeFoodleLoginReturnPath,
} from "@/lib/food-map/pending-intent";

describe("Foodle authentication interruption", () => {
  it("round-trips only a recent restaurant decision and active scope", () => {
    const intent = {
      version: 1 as const,
      restaurantId: "sht-mock-meal",
      decision: "saved" as const,
      budget: 20 as const,
      stationId: "SHT" as const,
      createdAt: "2026-08-04T08:00:00.000Z",
    };

    expect(
      parseFoodlePendingIntent(
        JSON.stringify(intent),
        new Date("2026-08-04T08:10:00.000Z"),
      ),
    ).toEqual(intent);
    expect(
      parseFoodlePendingIntent(
        JSON.stringify(intent),
        new Date("2026-08-05T08:10:00.000Z"),
      ),
    ).toBeNull();
    expect(
      parseFoodlePendingIntent(
        JSON.stringify({ ...intent, restaurantId: "foreign" }),
        new Date("2026-08-04T08:10:00.000Z"),
      ),
    ).toBeNull();
  });

  it("allows a local return path without allowing an open redirect", () => {
    expect(safeFoodleLoginReturnPath("/food-map")).toBe("/food-map");
    expect(safeFoodleLoginReturnPath("https://evil.example/steal")).toBe("/");
    expect(safeFoodleLoginReturnPath("//evil.example/steal")).toBe("/");
    expect(safeFoodleLoginReturnPath("/food-map-impersonation")).toBe("/");
    expect(safeFoodleLoginReturnPath("javascript:alert(1)")).toBe("/");
    expect(safeFoodleLoginReturnPath(null)).toBe("/");
  });
});
