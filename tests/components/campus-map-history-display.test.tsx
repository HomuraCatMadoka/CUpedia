// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CampusMapRevisionPage } from "@/components/campus-map/history-shell";
import type { CampusMapPlaceHistoryItem } from "@/lib/campus-map/fact-store";

const revision: CampusMapPlaceHistoryItem = {
  id: "00000000-0000-4000-8000-000000008291",
  placeId: "00000000-0000-4000-8000-000000008292",
  previousRevisionId: "00000000-0000-4000-8000-000000008293",
  status: "active",
  mergedIntoPlaceId: null,
  factSchemaVersion: 1,
  fieldMetadata: {},
  operation: "update",
  fieldDiff: {
    pinType: { before: "water", after: "printer", label: "类型" },
    capabilities: {
      before: ["print"],
      after: ["print", "scan"],
      label: "服务",
    },
    audience: {
      before: "public",
      after: "cuhk-member",
      label: "开放对象",
    },
  },
  actor: {
    id: "00000000-0000-4000-8000-000000008294",
    nickname: "地图贡献者",
  },
  changesetId: "00000000-0000-4000-8000-000000008295",
  comment: "更新地点资料",
  sourceSummary: "现场观察",
  publishedAt: new Date("2026-08-25T04:00:00.000Z"),
  createdAt: new Date("2026-08-25T04:00:00.000Z"),
  content: {
    visibility: "public",
    fact: {
      name: "科学馆打印点",
      pinType: "printer",
      capabilities: ["print", "scan"],
      gender: "unknown",
      wheelchairAccess: "unknown",
      audience: "cuhk-member",
      credentialRequirement: "campus-card",
      accessSchedule: { kind: "unknown" },
      reservationRequirement: "none",
      temporaryStatus: "normal",
      buildingId: "00000000-0000-4000-8000-000000008296",
      floorId: null,
      locationKind: "building",
      pointPrecision: null,
      longitude: null,
      latitude: null,
      coordinateCrs: null,
      observedAt: null,
      verifiedAt: null,
      provenance: [],
    },
  },
};

describe("Campus Map history display vocabulary", () => {
  it("renders controlled values through the shared display registry", () => {
    render(
      <CampusMapRevisionPage
        revision={{
          ...revision,
          schema: { version: 1, displayMetadata: {} },
        }}
      />,
    );

    expect(screen.getByText("饮水点")).toBeTruthy();
    expect(screen.getByText("打印服务")).toBeTruthy();
    expect(screen.getByText("打印、扫描")).toBeTruthy();
    expect(screen.getByText("中大成员")).toBeTruthy();
    expect(document.body.textContent).not.toContain("cuhk-member");
  });
});
