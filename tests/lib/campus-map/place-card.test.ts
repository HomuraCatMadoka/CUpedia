import { describe, expect, it } from "vitest";

import type { CampusMapRegularHours } from "@/db/schema";
import { projectCampusMapPlaceCard } from "@/lib/campus-map/place-card";

type CampusMapPlaceCardInput = Parameters<typeof projectCampusMapPlaceCard>[0];

function input(
  overrides: Partial<CampusMapPlaceCardInput> = {},
): CampusMapPlaceCardInput {
  return {
    placeType: "classroom",
    locationLabel: "李卓敏基本医学大楼",
    regularHours: null,
    officialActions: [],
    visitNote: null,
    capabilities: [],
    gender: null,
    wheelchairAccess: null,
    observedAt: null,
    verifiedAt: null,
    provenance: [],
    ...overrides,
  };
}

describe("Campus Map compact Place card (#879)", () => {
  it("keeps a classroom's location primary and moves other facts into details", () => {
    const card = projectCampusMapPlaceCard(
      input({
        visitNote: "请先查看最新安排。",
        wheelchairAccess: "yes",
      }),
    );

    expect(card.locationIsPrimary).toBe(true);
    expect(card.primaryFact).toBeNull();
    expect(card.detailFacts.map((fact) => fact.key)).toEqual([
      "visitNote",
      "wheelchairAccess",
    ]);
  });

  it("makes a pool's usual hours its one key fact without claiming live status", () => {
    const regularHours: CampusMapRegularHours = {
      timezone: "Asia/Hong_Kong",
      intervals: [
        {
          days: ["mon", "tue", "wed", "thu"],
          opensAt: "10:30",
          closesAt: "13:30",
        },
      ],
    };

    const card = projectCampusMapPlaceCard(
      input({
        placeType: "sports-facility",
        locationLabel: "室外位置",
        regularHours,
        visitNote: "学生入场 HK$5，只收八达通。",
      }),
    );

    expect(card.primaryFact).toEqual({
      key: "regularHours",
      label: "通常开放时间",
      value: "周一至周四 10:30–13:30",
    });
    expect(card.detailFacts).toMatchObject([{ key: "visitNote" }]);
    expect(JSON.stringify(card)).not.toMatch(/当前|营业中|实时/u);
  });

  it("preserves reviewed action order and exposes at most two safe official actions", () => {
    const card = projectCampusMapPlaceCard(
      input({
        placeType: "health-service",
        officialActions: [
          { label: "官方详情", url: "https://www.umso.cuhk.edu.hk/" },
          { label: "不安全", url: "javascript:alert(1)" },
          { label: "查询服务", url: "tel:+85239436439" },
          {
            label: "Book an appointment",
            url: "https://booking.umso.cuhk.edu.hk/booking/",
          },
        ],
      }),
    );

    expect(card.officialActions).toHaveLength(2);
    expect(card.officialActions.map((action) => action.label)).toEqual([
      "官方详情",
      "查询服务",
    ]);
    expect(card.officialActions[0]).toMatchObject({
      destination: "umso.cuhk.edu.hk",
    });
  });

  it("omits unknown facts while keeping known verification and source notes expandable", () => {
    const card = projectCampusMapPlaceCard(
      input({
        observedAt: "2026-09-01T10:00:00.000Z",
        verifiedAt: "2026-09-02T10:00:00.000Z",
        provenance: [
          {
            kind: "official",
            accessedOn: "2026-09-02",
            observedAt: null,
            hasLocationEvidence: true,
          },
        ],
      }),
    );

    expect(card.primaryFact).toBeNull();
    expect(card.detailFacts).toEqual([]);
    expect(card.verification).toEqual([
      "资料观察于 2026-09-01",
      "核对于 2026-09-02",
    ]);
    expect(card.sources).toEqual(["官方资料 · 查阅于 2026-09-02 · 含位置依据"]);
    expect(JSON.stringify(card)).not.toContain("未记录");
    expect(JSON.stringify(card)).not.toContain("未知");
  });

  it.each([new Date("2026-09-05T16:30:00.000Z"), "2026-09-05T16:30:00.000Z"])(
    "formats verification timestamps as Hong Kong dates",
    (verifiedAt) => {
      const card = projectCampusMapPlaceCard(input({ verifiedAt }));

      expect(card.verification).toEqual(["核对于 2026-09-06"]);
    },
  );
});
