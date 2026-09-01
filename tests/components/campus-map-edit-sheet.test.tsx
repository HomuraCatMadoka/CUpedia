// @vitest-environment jsdom

import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CampusMapEditSheet } from "@/components/campus-map/edit-sheet";
import {
  createCampusMapEditDraft,
  transitionCampusMapEdit,
  type CampusMapEditSession,
} from "@/lib/campus-map/edit-session";
import type { CampusMapPublishFactInput } from "@/lib/campus-map/publish-contract";
import type { CampusMapFactSchema } from "@/lib/campus-map/fact-store";
import type { CampusMapBrowseBuilding } from "@/lib/campus-map/browse-projection";

const placeId = "20000000-0000-4000-8000-000000000001";
const revisionId = "30000000-0000-4000-8000-000000000001";
const changesetId = "40000000-0000-4000-8000-000000000001";
const buildingId = "50000000-0000-4000-8000-000000000001";
const floorId = "60000000-0000-4000-8000-000000000001";

const buildings: CampusMapBrowseBuilding[] = [
  {
    buildingId,
    name: "科学馆",
    englishName: "Science Centre",
    code: "SC",
    aliases: [],
    anchor: { longitude: 114.209, latitude: 22.419, crs: "wgs84" },
    floors: [
      { floorId, displayLabel: "1/F", sortOrder: 1 },
      {
        floorId: "60000000-0000-4000-8000-000000000002",
        displayLabel: "2/F",
        sortOrder: 2,
      },
    ],
    placeIds: [],
    selectionTarget: { kind: "building", buildingId },
  },
];

afterEach(() => vi.useRealTimers());

function draft() {
  return createCampusMapEditDraft({
    mode: "add",
    idempotencyKey: "10000000-0000-4000-8000-000000000001",
  });
}

describe("Campus Map single-page edit Sheet", () => {
  it("keeps a building-required Add focused on building and optional floor", () => {
    const session = transitionCampusMapEdit(null, {
      type: "START_FACILITY_ADD",
      idempotencyKey: "10000000-0000-4000-8000-000000000001",
      entry: {
        kind: "building",
        locationDisplay: {
          buildingId,
          buildingName: "科学馆",
          floorId,
          floorLabel: "1/F",
        },
      },
    }).session!;

    render(
      <CampusMapEditSheet
        session={session}
        centerPosition={[114.209, 22.419]}
        buildings={buildings}
        onEvent={vi.fn()}
      />,
    );

    const buildingGroup = screen.getByRole("group", { name: "所属建筑" });
    expect(buildingGroup).toBeTruthy();
    expect(screen.getByRole("heading", { name: "新增设施" })).toBeTruthy();
    expect(within(buildingGroup).getByText("科学馆")).toBeTruthy();
    expect(within(buildingGroup).getByText("1/F")).toBeTruthy();
    expect(within(buildingGroup).queryByText(/已从建筑卡片带入/)).toBeNull();
    expect(screen.queryByRole("combobox", { name: "建筑" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "更改所属建筑或楼层" }));
    expect(
      (screen.getByRole("combobox", { name: "建筑" }) as HTMLSelectElement)
        .value,
    ).toBe(buildingId);
    expect(
      (screen.getByRole("combobox", { name: "楼层" }) as HTMLSelectElement)
        .value,
    ).toBe(floorId);
    expect(screen.queryByRole("radio", { name: "室外" })).toBeNull();
    expect(screen.queryByRole("radio", { name: "建筑内" })).toBeNull();
    expect(screen.queryByRole("button", { name: "修改位置" })).toBeNull();
  });

  it("keeps publish available so a missing building can be explained and focused", () => {
    const onEvent = vi.fn();
    const session = transitionCampusMapEdit(null, {
      type: "START_FACILITY_ADD",
      idempotencyKey: "10000000-0000-4000-8000-000000000001",
      entry: { kind: "global" },
    }).session!;

    render(
      <CampusMapEditSheet
        session={session}
        centerPosition={[114.209, 22.419]}
        buildings={buildings}
        onEvent={onEvent}
      />,
    );

    const publish = screen.getByRole("button", { name: "发布设施" });
    expect((publish as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(publish);
    expect(onEvent).toHaveBeenLastCalledWith({
      type: "REPORT_LOCAL_ERROR",
      field: "buildingId",
    });
  });

  it("asks for a replacement when a restored building no longer exists", () => {
    const staleSession = transitionCampusMapEdit(null, {
      type: "START_FACILITY_ADD",
      idempotencyKey: "10000000-0000-4000-8000-000000000001",
      entry: {
        kind: "building",
        locationDisplay: {
          buildingId: "missing-building",
          buildingName: "旧科学馆",
          floorId: null,
          floorLabel: null,
        },
      },
    }).session!;

    render(
      <CampusMapEditSheet
        session={staleSession}
        centerPosition={[114.209, 22.419]}
        buildings={buildings}
        onEvent={vi.fn()}
      />,
    );

    expect(screen.getByRole("alert").textContent).toContain(
      "原建筑不可用，请重新选择",
    );
    expect(
      (screen.getByRole("combobox", { name: "建筑" }) as HTMLSelectElement)
        .value,
    ).toBe("");
  });

  it("keeps one form mounted while Add moves from placing to editing", () => {
    const onEvent = vi.fn();
    const placing: CampusMapEditSession = {
      status: "placing",
      draft: {
        ...draft(),
        placementCandidate: {
          longitude: 114.2101,
          latitude: 22.4198,
          crs: "wgs84",
          precision: "approximate",
          method: "pointer",
        },
      },
    };
    const view = render(
      <CampusMapEditSheet
        session={placing}
        centerPosition={[114.2101, 22.4198]}
        placeContext={{
          status: "resolved",
          context: {
            providerPosition: {
              longitude: 114.2125,
              latitude: 22.4172,
              crs: "gcj02",
            },
            label: "科学馆",
            address: "香港中文大学中央大道",
            providerPoiId: "B0FFHYPOTHETICAL",
            distanceMeters: 18,
          },
        }}
        onEvent={onEvent}
      />,
    );
    expect(
      screen.queryByRole("textbox", { name: "设施名称或编号" }),
    ).toBeNull();
    expect(
      screen.getByText("114.210100, 22.419800 · WGS84 · 约略"),
    ).toBeTruthy();
    expect(screen.getByText("高德地图地点：科学馆")).toBeTruthy();
    expect(screen.getByText("高德地图参考：香港中文大学中央大道")).toBeTruthy();
    expect(screen.queryByRole("radio", { name: "饮水点" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "使用此位置" }));
    expect(onEvent).toHaveBeenLastCalledWith({
      type: "CONFIRM_POSITION",
      position: placing.draft.placementCandidate,
    });

    view.rerender(
      <CampusMapEditSheet
        session={{
          status: "editing",
          draft: {
            ...placing.draft,
            fact: {
              ...placing.draft.fact,
              location: {
                kind: "outdoor-point",
                longitude: 114.2101,
                latitude: 22.4198,
                crs: "wgs84",
                precision: "approximate",
              },
            },
          },
        }}
        centerPosition={[114.2101, 22.4198]}
        onEvent={onEvent}
      />,
    );
    expect(screen.getByRole("group", { name: "设施类型" })).toBeTruthy();
    expect(
      screen.getByRole("textbox", { name: "设施名称或编号" }),
    ).toBeTruthy();
  });

  it("keeps the confirmed Add Sheet to location, facility type, and publish", () => {
    render(
      <CampusMapEditSheet
        session={{
          status: "editing",
          draft: {
            ...draft(),
            fact: {
              ...draft().fact,
              location: {
                kind: "outdoor-point",
                longitude: 114.208792,
                latitude: 22.421904,
                crs: "wgs84",
                precision: "approximate",
              },
            },
          },
        }}
        centerPosition={[114.208792, 22.421904]}
        onEvent={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { name: "新增设施" })).toBeTruthy();
    expect(
      screen.queryByText("位置已确定。选择设施类型后即可发布。"),
    ).toBeNull();
    expect(screen.getByRole("group", { name: "设施类型" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "修改位置" })).toBeTruthy();
    expect(
      screen.getByRole("textbox", { name: "设施名称或编号" }),
    ).toBeTruthy();
    expect(screen.queryByText("资料依据")).toBeNull();
    expect(
      screen
        .getByRole("button", { name: "更多信息" })
        .getAttribute("aria-expanded"),
    ).toBe("false");
    expect(screen.queryByRole("group", { name: "开放与使用条件" })).toBeNull();
    expect(screen.getByRole("button", { name: "发布设施" })).toBeTruthy();
  });

  it("sends the active schema required fields to the pure publish transition", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-26T04:00:00Z"));
    const onEvent = vi.fn();
    const factSchema = {
      version: 1,
      definition: {
        fields: {},
        pinTypes: {
          toilet: { applicableFields: [], requiredFields: [] },
          water: { applicableFields: [], requiredFields: [] },
          printer: {
            applicableFields: ["name", "pinType", "capabilities", "location"],
            requiredFields: ["name", "pinType", "capabilities", "location"],
          },
          "common-space": { applicableFields: [], requiredFields: [] },
          classroom: { applicableFields: [], requiredFields: [] },
        },
      },
      displayMetadata: {},
    } as unknown as CampusMapFactSchema;

    render(
      <CampusMapEditSheet
        session={{
          status: "editing",
          draft: {
            ...draft(),
            fact: {
              ...draft().fact,
              pinType: "printer",
              location: {
                kind: "outdoor-point",
                longitude: 114.2,
                latitude: 22.4,
                crs: "wgs84",
                precision: "approximate",
              },
            },
          },
        }}
        centerPosition={[114.2, 22.4]}
        factSchema={factSchema}
        onEvent={onEvent}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "发布设施" }));

    expect(onEvent).toHaveBeenLastCalledWith({
      type: "REQUEST_PUBLISH",
      accessedOn: "2026-08-26",
      requiredFields: ["name", "pinType", "capabilities", "location"],
    });
  });

  it("shows the canonical access fields that apply to the active schema", () => {
    const factSchema = {
      version: 1,
      definition: {
        fields: {},
        pinTypes: {
          toilet: { applicableFields: [], requiredFields: [] },
          water: {
            applicableFields: [
              "name",
              "pinType",
              "capabilities",
              "audience",
              "credentialRequirement",
              "accessSchedule",
              "reservationRequirement",
              "temporaryStatus",
              "location",
            ],
            requiredFields: ["name", "pinType", "capabilities", "location"],
          },
          printer: { applicableFields: [], requiredFields: [] },
          "common-space": { applicableFields: [], requiredFields: [] },
          classroom: { applicableFields: [], requiredFields: [] },
        },
      },
      displayMetadata: {},
    } as unknown as CampusMapFactSchema;

    render(
      <CampusMapEditSheet
        session={{
          status: "editing",
          localError: "capabilities",
          draft: {
            ...draft(),
            fact: {
              ...draft().fact,
              location: {
                kind: "outdoor-point",
                longitude: 114.2,
                latitude: 22.4,
                crs: "wgs84",
                precision: "approximate",
              },
            },
          },
        }}
        centerPosition={[114.2, 22.4]}
        factSchema={factSchema}
        onEvent={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "更多信息" }));
    expect(screen.getByRole("combobox", { name: "开放对象" })).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "凭证要求" })).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "开放时间" })).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "预约要求" })).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "临时状态" })).toBeTruthy();
  });

  it("maps editable names and controlled access conditions to one fact event", () => {
    const onEvent = vi.fn();
    const session: CampusMapEditSession = {
      status: "editing",
      draft: {
        ...draft(),
        fact: {
          ...draft().fact,
          location: {
            kind: "outdoor-point",
            longitude: 114.2,
            latitude: 22.4,
            crs: "wgs84",
            precision: "approximate",
          },
        },
      },
    };
    render(
      <CampusMapEditSheet
        session={session}
        centerPosition={[114.2, 22.4]}
        onEvent={onEvent}
      />,
    );

    fireEvent.change(screen.getByRole("textbox", { name: "设施名称或编号" }), {
      target: { value: "科学馆 1/F 东翼饮水机" },
    });
    expect(onEvent).toHaveBeenLastCalledWith({
      type: "CHANGE_FACT",
      fact: {
        ...session.draft.fact,
        name: "科学馆 1/F 东翼饮水机",
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "更多信息" }));
    fireEvent.change(screen.getByRole("combobox", { name: "开放对象" }), {
      target: { value: "cuhk-member" },
    });
    expect(onEvent).toHaveBeenLastCalledWith({
      type: "CHANGE_FACT",
      fact: {
        ...session.draft.fact,
        audience: "cuhk-member",
      },
    });
  });

  it("lets contributors remove an extra weekly access interval", () => {
    const onEvent = vi.fn();
    const firstInterval = {
      days: ["mon" as const],
      opensAt: "09:00",
      closesAt: "12:00",
    };
    const session: CampusMapEditSession = {
      status: "editing",
      draft: {
        ...draft(),
        fact: {
          ...draft().fact,
          location: {
            kind: "outdoor-point",
            longitude: 114.2,
            latitude: 22.4,
            crs: "wgs84",
            precision: "approximate",
          },
          accessSchedule: {
            kind: "weekly",
            timezone: "Asia/Hong_Kong",
            intervals: [
              firstInterval,
              {
                days: ["fri"],
                opensAt: "13:00",
                closesAt: "18:00",
              },
            ],
          },
        },
      },
    };

    render(
      <CampusMapEditSheet
        session={session}
        centerPosition={[114.2, 22.4]}
        onEvent={onEvent}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "移除时段 2" }));
    expect(onEvent).toHaveBeenLastCalledWith({
      type: "CHANGE_FACT",
      fact: {
        ...session.draft.fact,
        accessSchedule: {
          kind: "weekly",
          timezone: "Asia/Hong_Kong",
          intervals: [firstInterval],
        },
      },
    });
  });

  it("maps explicit building-only, Floor, and outdoor choices without using provider candidates", () => {
    const onEvent = vi.fn();
    const outdoorFact = {
      ...draft().fact,
      location: {
        kind: "outdoor-point" as const,
        longitude: 114.209,
        latitude: 22.419,
        crs: "wgs84" as const,
        precision: "approximate" as const,
      },
    };
    const initialSession: CampusMapEditSession = {
      status: "editing",
      draft: { ...draft(), fact: outdoorFact },
    };
    const view = render(
      <CampusMapEditSheet
        session={initialSession}
        centerPosition={[114.209, 22.419]}
        buildings={buildings}
        placeContext={{
          status: "resolved",
          context: {
            providerPosition: {
              longitude: 114.209,
              latitude: 22.419,
              crs: "gcj02",
            },
            label: "高德科学馆候选",
            address: "中央大道",
            providerPoiId: "provider-only",
            distanceMeters: 3,
          },
        }}
        onEvent={onEvent}
      />,
    );

    expect(onEvent).not.toHaveBeenCalled();
    expect(screen.getByText("高德候选：")).toBeTruthy();
    expect(screen.getByText("高德科学馆候选")).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: "建筑内" }));
    expect(onEvent).toHaveBeenLastCalledWith({
      type: "CHOOSE_LOCATION_KIND",
      kind: "indoor",
    });
    const pendingSession = transitionCampusMapEdit(initialSession, {
      type: "CHOOSE_LOCATION_KIND",
      kind: "indoor",
    }).session!;
    view.rerender(
      <CampusMapEditSheet
        session={pendingSession}
        centerPosition={[114.209, 22.419]}
        buildings={buildings}
        placeContext={{
          status: "resolved",
          context: {
            providerPosition: {
              longitude: 114.209,
              latitude: 22.419,
              crs: "gcj02",
            },
            label: "高德科学馆候选",
            address: "中央大道",
            providerPoiId: "provider-only",
            distanceMeters: 3,
          },
        }}
        onEvent={onEvent}
      />,
    );
    fireEvent.change(screen.getByRole("combobox", { name: "建筑" }), {
      target: { value: buildingId },
    });
    expect(onEvent).toHaveBeenLastCalledWith({
      type: "CHANGE_FACT",
      fact: {
        ...outdoorFact,
        buildingId,
        floorId: null,
        location: { kind: "building" },
      },
      locationDisplay: {
        buildingId,
        buildingName: "科学馆",
        floorId: null,
        floorLabel: null,
      },
    });

    const buildingFact = {
      ...outdoorFact,
      buildingId,
      floorId: null,
      location: { kind: "building" as const },
    };
    view.rerender(
      <CampusMapEditSheet
        session={{
          status: "editing",
          draft: {
            ...draft(),
            fact: buildingFact,
            locationDisplay: {
              buildingId,
              buildingName: "科学馆",
              floorId: null,
              floorLabel: null,
            },
          },
        }}
        centerPosition={[114.209, 22.419]}
        buildings={buildings}
        onEvent={onEvent}
      />,
    );
    fireEvent.change(screen.getByRole("combobox", { name: "楼层" }), {
      target: { value: floorId },
    });
    expect(onEvent).toHaveBeenLastCalledWith({
      type: "CHANGE_FACT",
      fact: {
        ...buildingFact,
        floorId,
        location: { kind: "floor" },
      },
      locationDisplay: {
        buildingId,
        buildingName: "科学馆",
        floorId,
        floorLabel: "1/F",
      },
    });

    fireEvent.click(screen.getByRole("radio", { name: "室外" }));
    expect(onEvent).toHaveBeenLastCalledWith({
      type: "CHOOSE_LOCATION_KIND",
      kind: "outdoor",
    });
  });

  it("shows a newly confirmed outdoor fact after an indoor draft is repositioned", () => {
    const onEvent = vi.fn();
    const outdoorFact = {
      ...draft().fact,
      location: {
        kind: "outdoor-point" as const,
        longitude: 114.209,
        latitude: 22.419,
        crs: "wgs84" as const,
        precision: "approximate" as const,
      },
    };
    const initialSession: CampusMapEditSession = {
      status: "editing",
      draft: { ...draft(), fact: outdoorFact },
    };
    const view = render(
      <CampusMapEditSheet
        session={initialSession}
        centerPosition={[114.209, 22.419]}
        buildings={buildings}
        onEvent={onEvent}
      />,
    );

    fireEvent.click(screen.getByRole("radio", { name: "建筑内" }));
    view.rerender(
      <CampusMapEditSheet
        session={
          transitionCampusMapEdit(initialSession, {
            type: "CHOOSE_LOCATION_KIND",
            kind: "indoor",
          }).session!
        }
        centerPosition={[114.209, 22.419]}
        buildings={buildings}
        onEvent={onEvent}
      />,
    );
    fireEvent.change(screen.getByRole("combobox", { name: "建筑" }), {
      target: { value: buildingId },
    });

    const buildingFact = {
      ...outdoorFact,
      buildingId,
      floorId: null,
      location: { kind: "building" as const },
    };
    view.rerender(
      <CampusMapEditSheet
        session={{
          status: "editing",
          draft: {
            ...draft(),
            fact: buildingFact,
            locationDisplay: {
              buildingId,
              buildingName: "科学馆",
              floorId: null,
              floorLabel: null,
            },
          },
        }}
        centerPosition={[114.209, 22.419]}
        buildings={buildings}
        onEvent={onEvent}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "修改位置" }));

    view.rerender(
      <CampusMapEditSheet
        session={{
          status: "editing",
          draft: {
            ...draft(),
            fact: {
              ...buildingFact,
              buildingId: null,
              floorId: null,
              location: {
                kind: "outdoor-point",
                longitude: 114.21,
                latitude: 22.42,
                crs: "wgs84",
                precision: "precise",
              },
            },
            locationDisplay: null,
          },
        }}
        centerPosition={[114.21, 22.42]}
        buildings={buildings}
        onEvent={onEvent}
      />,
    );

    expect(
      (screen.getByRole("radio", { name: "室外" }) as HTMLInputElement).checked,
    ).toBe(true);
    expect(screen.queryByRole("combobox", { name: "建筑" })).toBeNull();
  });

  it("routes a pending indoor location through the session owner and accessible validation", () => {
    const onEvent = vi.fn();
    const outdoorFact = {
      ...draft().fact,
      name: "准备改到室内的饮水机",
      location: {
        kind: "outdoor-point" as const,
        longitude: 114.209,
        latitude: 22.419,
        crs: "wgs84" as const,
        precision: "approximate" as const,
      },
    };
    const cleanEditDraft = createCampusMapEditDraft({
      mode: "edit",
      idempotencyKey: "10000000-0000-4000-8000-000000000001",
      placeId,
      baseRevisionId: revisionId,
      fact: outdoorFact,
    });
    const view = render(
      <CampusMapEditSheet
        session={{
          status: "editing",
          draft: cleanEditDraft,
        }}
        centerPosition={[114.209, 22.419]}
        buildings={buildings}
        onEvent={onEvent}
      />,
    );

    fireEvent.click(screen.getByRole("radio", { name: "建筑内" }));
    expect(onEvent).toHaveBeenLastCalledWith({
      type: "CHOOSE_LOCATION_KIND",
      kind: "indoor",
    });
    const pendingSession = transitionCampusMapEdit(
      { status: "editing", draft: cleanEditDraft },
      { type: "CHOOSE_LOCATION_KIND", kind: "indoor" },
    ).session!;
    view.rerender(
      <CampusMapEditSheet
        session={pendingSession}
        centerPosition={[114.209, 22.419]}
        buildings={buildings}
        onEvent={onEvent}
      />,
    );
    expect(screen.getByText("建筑内位置")).toBeTruthy();
    expect(screen.queryByText("地图坐标")).toBeNull();
    const publish = screen.getByRole("button", { name: "发布修改" });
    expect(publish).not.toHaveProperty("disabled", true);
    fireEvent.click(publish);
    expect(onEvent).toHaveBeenLastCalledWith({
      type: "REQUEST_PUBLISH",
      accessedOn: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    });

    view.rerender(
      <CampusMapEditSheet
        session={{
          ...pendingSession,
          localError: "buildingId",
        }}
        centerPosition={[114.209, 22.419]}
        buildings={buildings}
        onEvent={onEvent}
      />,
    );
    const building = screen.getByRole("combobox", { name: "建筑" });
    expect(building.getAttribute("aria-invalid")).toBe("true");
    const describedBy = building.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy!)?.textContent).toContain(
      "请选择建筑",
    );
  });

  it("offers a retry instead of an unusable indoor form when the Building directory fails", () => {
    const onRetryBuildings = vi.fn();
    const cleanEditDraft = createCampusMapEditDraft({
      mode: "edit",
      idempotencyKey: "10000000-0000-4000-8000-000000000001",
      placeId,
      baseRevisionId: revisionId,
      fact: {
        ...draft().fact,
        location: {
          kind: "outdoor-point",
          longitude: 114.209,
          latitude: 22.419,
          crs: "wgs84",
          precision: "approximate",
        },
      },
    });
    const pendingSession = transitionCampusMapEdit(
      { status: "editing", draft: cleanEditDraft },
      { type: "CHOOSE_LOCATION_KIND", kind: "indoor" },
    ).session!;

    render(
      <CampusMapEditSheet
        session={pendingSession}
        centerPosition={[114.209, 22.419]}
        buildingDirectoryStatus="error"
        onRetryBuildings={onRetryBuildings}
        onEvent={vi.fn()}
      />,
    );

    expect(
      (screen.getByRole("combobox", { name: "建筑" }) as HTMLSelectElement)
        .disabled,
    ).toBe(true);
    expect(
      (screen.getByRole("combobox", { name: "楼层" }) as HTMLSelectElement)
        .disabled,
    ).toBe(true);
    expect(
      (screen.getByRole("button", { name: "发布修改" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "重新加载建筑" }));
    expect(onRetryBuildings).toHaveBeenCalledTimes(1);
  });

  it("keeps refresh and retry feedback visible beside cached Buildings", () => {
    const onRetryBuildings = vi.fn();
    const session = transitionCampusMapEdit(null, {
      type: "START_FACILITY_ADD",
      idempotencyKey: "10000000-0000-4000-8000-000000000001",
      entry: { kind: "global" },
    }).session!;
    const view = render(
      <CampusMapEditSheet
        session={session}
        centerPosition={[114.209, 22.419]}
        buildings={buildings}
        buildingDirectoryStatus="refreshing"
        onRetryBuildings={onRetryBuildings}
        onEvent={vi.fn()}
      />,
    );

    expect(screen.getByRole("status").textContent).toContain(
      "正在读取建筑目录",
    );

    view.rerender(
      <CampusMapEditSheet
        session={session}
        centerPosition={[114.209, 22.419]}
        buildings={buildings}
        buildingDirectoryStatus="error"
        onRetryBuildings={onRetryBuildings}
        onEvent={vi.fn()}
      />,
    );

    expect(screen.getByRole("alert").textContent).toContain("建筑目录载入失败");
    fireEvent.click(screen.getByRole("button", { name: "重新加载建筑" }));
    expect(onRetryBuildings).toHaveBeenCalledTimes(1);
    expect(
      (screen.getByRole("combobox", { name: "建筑" }) as HTMLSelectElement)
        .disabled,
    ).toBe(false);
  });

  it("expands access details when a session update adds meaningful values", () => {
    const baseDraft = draft();
    const session: CampusMapEditSession = {
      status: "editing",
      draft: {
        ...baseDraft,
        fact: {
          ...baseDraft.fact,
          location: {
            kind: "outdoor-point",
            longitude: 114.209,
            latitude: 22.419,
            crs: "wgs84",
            precision: "approximate",
          },
        },
      },
    };
    const view = render(
      <CampusMapEditSheet
        session={session}
        centerPosition={[114.209, 22.419]}
        onEvent={vi.fn()}
      />,
    );

    expect(
      screen
        .getByRole("button", { name: "更多信息" })
        .getAttribute("aria-expanded"),
    ).toBe("false");

    view.rerender(
      <CampusMapEditSheet
        session={{
          ...session,
          draft: {
            ...session.draft,
            idempotencyKey: "10000000-0000-4000-8000-000000000002",
            fact: { ...session.draft.fact, audience: "cuhk-member" },
          },
        }}
        centerPosition={[114.209, 22.419]}
        onEvent={vi.fn()}
      />,
    );

    expect(
      screen
        .getByRole("button", { name: "更多信息" })
        .getAttribute("aria-expanded"),
    ).toBe("true");
    expect(screen.getByRole("group", { name: "开放与使用条件" })).toBeTruthy();
  });

  it("keeps the edit heading programmatically focusable", () => {
    render(
      <CampusMapEditSheet
        session={{
          status: "editing",
          draft: {
            ...draft(),
            fact: {
              ...draft().fact,
              location: {
                kind: "outdoor-point",
                longitude: 114.207113,
                latitude: 22.420126,
                crs: "wgs84",
                precision: "approximate",
              },
            },
          },
        }}
        centerPosition={[114.207113, 22.420126]}
        onEvent={vi.fn()}
      />,
    );

    const heading = screen.getByRole("heading", { name: "新增设施" });
    heading.focus();
    expect(document.activeElement).toBe(heading);
    expect(heading.getAttribute("tabindex")).toBe("-1");
    expect(heading.className).toContain("focus-visible:outline-none");
    expect(heading.className).toContain("focus-visible:border-l-2");
  });

  it("exposes every place type as one accessible radio group", () => {
    render(
      <CampusMapEditSheet
        session={{
          status: "editing",
          draft: {
            ...draft(),
            fact: {
              ...draft().fact,
              location: {
                kind: "outdoor-point",
                longitude: 114.2,
                latitude: 22.4,
                crs: "wgs84",
                precision: "approximate",
              },
            },
          },
        }}
        centerPosition={[114.2, 22.4]}
        onEvent={vi.fn()}
      />,
    );

    const typeGroup = screen.getByRole("group", { name: "设施类型" });
    expect(typeGroup.querySelectorAll('input[type="radio"]')).toHaveLength(5);
    for (const label of ["饮水点", "洗手间", "打印服务", "公共空间", "课室"]) {
      expect(screen.getByRole("radio", { name: label })).toBeTruthy();
    }
    expect(typeGroup.getAttribute("tabindex")).toBe("-1");
    expect(screen.queryByText(/Changeset 说明/)).toBeNull();
  });

  it("delegates place-type changes to the edit-session transition", () => {
    const onEvent = vi.fn();
    render(
      <CampusMapEditSheet
        session={{
          status: "editing",
          draft: {
            ...draft(),
            fact: {
              ...draft().fact,
              location: {
                kind: "outdoor-point",
                longitude: 114.2,
                latitude: 22.4,
                crs: "wgs84",
                precision: "approximate",
              },
            },
          },
        }}
        centerPosition={[114.2, 22.4]}
        onEvent={onEvent}
      />,
    );

    fireEvent.click(screen.getByRole("radio", { name: "洗手间" }));

    expect(onEvent).toHaveBeenLastCalledWith({
      type: "CHANGE_PIN_TYPE",
      pinType: "toilet",
    });
  });

  it("attributes a POI-only Geocoder result to 高德", () => {
    render(
      <CampusMapEditSheet
        session={{ status: "placing", draft: draft() }}
        centerPosition={[114.2, 22.4]}
        placeContext={{
          status: "resolved",
          context: {
            providerPosition: {
              longitude: 114.202,
              latitude: 22.402,
              crs: "gcj02",
            },
            label: "邵逸夫堂",
            address: null,
            providerPoiId: "shaw-college-hall",
            distanceMeters: 14,
          },
        }}
        onEvent={vi.fn()}
      />,
    );

    expect(screen.getByText("高德地图地点：邵逸夫堂")).toBeTruthy();
    expect(screen.queryByText(/附近地点/)).toBeNull();
  });

  it.each([
    ["rate-limited", "高德地图查询较频繁，仍可使用此位置"],
    ["transient-error", "暂时无法查询高德地图参考，仍可使用此位置"],
    ["permanent-error", "高德地图参考不可用，仍可使用此位置"],
    ["empty", "高德地图未找到附近地点，仍可使用此位置"],
  ] as const)("keeps the candidate usable after %s", (status, message) => {
    render(
      <CampusMapEditSheet
        session={{ status: "placing", draft: draft() }}
        centerPosition={[114.2, 22.4]}
        placeContext={
          status === "rate-limited"
            ? { status, retryAfterSeconds: 30 }
            : { status }
        }
        onEvent={vi.fn()}
      />,
    );

    expect(screen.getByText(message)).toBeTruthy();
    expect(
      (
        screen.getByRole("button", {
          name: "使用此位置",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
    expect(
      screen.queryByRole("textbox", { name: "设施名称或编号" }),
    ).toBeNull();
  });

  it("starts a fresh publish attempt when editing a transient failure", () => {
    const onEvent = vi.fn();
    const session: CampusMapEditSession = {
      status: "temporarily-unavailable",
      draft: {
        ...draft(),
        fact: {
          ...draft().fact,
          location: {
            kind: "outdoor-point",
            longitude: 114.2,
            latitude: 22.4,
            crs: "wgs84",
            precision: "approximate",
          },
        },
      },
    };
    render(
      <CampusMapEditSheet
        session={session}
        centerPosition={[114.2, 22.4]}
        onEvent={onEvent}
      />,
    );

    fireEvent.click(screen.getByRole("radio", { name: "洗手间" }));

    expect(onEvent).toHaveBeenLastCalledWith({
      type: "CHANGE_PIN_TYPE",
      pinType: "toilet",
      idempotencyKey: expect.any(String),
    });
    expect(onEvent.mock.calls.at(-1)?.[0].idempotencyKey).not.toBe(
      session.draft.idempotencyKey,
    );
  });

  it("shows a retryable failure without internal recovery language", () => {
    const onEvent = vi.fn();
    render(
      <CampusMapEditSheet
        session={{ status: "temporarily-unavailable", draft: draft() }}
        centerPosition={[114.2, 22.4]}
        onEvent={onEvent}
      />,
    );

    expect(screen.getByRole("status").textContent).toContain(
      "你的修改已保存在这个浏览器中，可以稍后重试。",
    );
    expect(document.body.textContent).not.toMatch(
      /receipt|idempotency|发布识别码|安全重试/i,
    );
    fireEvent.click(screen.getByRole("button", { name: "重试发布" }));
    expect(onEvent).toHaveBeenCalledOnce();
    expect(onEvent).toHaveBeenCalledWith({ type: "RETRY_PUBLISH" });
  });

  it("gives a non-retryable permission failure one next step", () => {
    const onEvent = vi.fn();
    render(
      <CampusMapEditSheet
        session={{
          status: "forbidden",
          forbiddenCode: "actor-banned",
          draft: draft(),
        }}
        centerPosition={[114.2, 22.4]}
        onEvent={onEvent}
      />,
    );

    expect(screen.getAllByRole("button", { name: "继续编辑" })).toHaveLength(1);
    expect(screen.queryByRole("button", { name: /重试/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "继续编辑" }));
    expect(onEvent).toHaveBeenCalledWith({ type: "CONTINUE_EDITING" });
  });

  it("presents an unknown result with one plain-language primary action", () => {
    const onEvent = vi.fn();
    render(
      <CampusMapEditSheet
        session={{
          status: "publish-unknown",
          publishFeedbackReason: "reconciliation-unavailable",
          draft: draft(),
        }}
        centerPosition={[114.2, 22.4]}
        onEvent={onEvent}
      />,
    );

    const panel = screen.getByRole("status");
    expect(panel.textContent).toContain("正在确认发布结果");
    expect(panel.textContent).toContain("你的修改已经保留");
    expect(
      screen.getAllByRole("button", { name: "检查发布结果" }),
    ).toHaveLength(1);
    expect(document.body.textContent).not.toMatch(
      /receipt|idempotency|发布识别码|安全重试/i,
    );

    fireEvent.click(screen.getByRole("button", { name: "检查发布结果" }));
    expect(onEvent).toHaveBeenCalledOnce();
    expect(onEvent).toHaveBeenCalledWith({ type: "CHECK_PUBLISH_RESULT" });
  });

  it.each([
    ["identity-mismatch", "当前账号与原发布账号不同"],
    ["identity-unavailable", "暂时无法确认当前登录状态"],
  ] as const)("hides draft details for %s", (reason, message) => {
    render(
      <CampusMapEditSheet
        session={{
          status: "publish-identity",
          publishFeedbackReason: reason,
          draft: {
            ...draft(),
            fact: { ...draft().fact, name: "绝不能显示的私有草稿" },
          },
        }}
        centerPosition={[114.2, 22.4]}
        onEvent={vi.fn()}
      />,
    );

    expect(screen.getByRole("status").textContent).toContain(message);
    expect(document.body.textContent).not.toContain("绝不能显示的私有草稿");
    expect(screen.queryByRole("radio", { name: "饮水点" })).toBeNull();
    expect(screen.queryByRole("button", { name: /重试发布/ })).toBeNull();
  });

  it("does not offer a recovery bypass when locking is unavailable", () => {
    const reason = "receipt-lock-unavailable" as const;
    render(
      <CampusMapEditSheet
        session={{
          status: "publish-recovery-unavailable",
          publishFeedbackReason: reason,
          draft: draft(),
        }}
        centerPosition={[114.2, 22.4]}
        onEvent={vi.fn()}
      />,
    );

    expect(screen.getByRole("status").textContent).toContain(
      "当前浏览器无法安全恢复这次发布",
    );
    expect(screen.getAllByRole("button", { name: "继续编辑" })).toHaveLength(1);
    expect(screen.queryByRole("button", { name: /重试|检查/ })).toBeNull();
  });

  it.each([
    [
      "retryable",
      { status: "temporarily-unavailable", draft: draft() },
      "重试发布",
    ],
    [
      "non-retryable",
      {
        status: "forbidden",
        forbiddenCode: "actor-banned",
        draft: draft(),
      },
      "继续编辑",
    ],
    [
      "rate-limited",
      {
        status: "rate-limited",
        retryAfter: 30,
        rateScope: "actor",
        draft: draft(),
      },
      "再次发布",
    ],
  ] as const)(
    "hides the fixed publish footer for %s feedback",
    (_, session, action) => {
      render(
        <CampusMapEditSheet
          session={session}
          centerPosition={[114.2, 22.4]}
          onEvent={vi.fn()}
        />,
      );

      expect(screen.getByRole("button", { name: action })).toBeTruthy();
      expect(screen.queryByRole("button", { name: "发布设施" })).toBeNull();
    },
  );

  it("does not render the removed publish receipt page", () => {
    const session: CampusMapEditSession = {
      status: "published",
      draft: draft(),
      receipt: { placeId, revisionId, changesetId },
    };
    const { container } = render(
      <CampusMapEditSheet
        session={session}
        centerPosition={[114.2, 22.4]}
        onEvent={vi.fn()}
      />,
    );

    expect(container.innerHTML).toBe("");
    expect(screen.queryByText("PUBLISHED")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("keeps server warning identity out of the user-facing acknowledgement", () => {
    const fingerprint = "a".repeat(64);
    const session: CampusMapEditSession = {
      status: "warning",
      draft: draft(),
      warnings: [
        {
          code: "possible-duplicate",
          fingerprint,
          anchor: { changeIndex: 0, field: "name" },
        },
      ],
    };
    render(
      <CampusMapEditSheet
        session={session}
        centerPosition={[114.2, 22.4]}
        onEvent={vi.fn()}
      />,
    );

    expect(screen.getByRole("alert").textContent).toContain(
      "附近可能已有相似设施",
    );
    expect(screen.getByRole("alert").textContent).not.toContain(
      "possible-duplicate",
    );
    expect(screen.getByRole("alert").textContent).not.toContain(fingerprint);
    expect(screen.getByRole("button", { name: "确认并发布" })).toBeTruthy();
  });

  it("uses ordinary language for unknown and transitional server errors", () => {
    const session = {
      status: "editing",
      draft: draft(),
      serverErrors: [
        {
          code: "invalid-place-id",
          anchor: { changeIndex: 0, field: "placeId" },
        },
        {
          code: "internal-opaque-code",
          anchor: { changeIndex: 0, field: "name" },
        },
      ],
    } as CampusMapEditSession;
    render(
      <CampusMapEditSheet
        session={session}
        centerPosition={[114.2, 22.4]}
        onEvent={vi.fn()}
      />,
    );

    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("这个地点暂时无法发布");
    expect(alert.textContent).toContain("服务器暂时无法接受这项资料");
    expect(alert.textContent).not.toContain("Place");
    expect(alert.textContent).not.toContain("invalid-place-id");
    expect(alert.textContent).not.toContain("internal-opaque-code");
  });

  it.each([
    ["fact-name-required", "请填写能辨认这处设施的名称或编号。"],
    ["fact-name-invalid", "名称含有无法保存的字符，请删除后重试。"],
    ["fact-name-too-long", "名称过长，请缩短后重试。"],
  ])("shows accurate top and field feedback for %s", (code, message) => {
    const session = {
      status: "editing",
      localError: "name",
      draft: draft(),
      serverErrors: [
        {
          code,
          anchor: { changeIndex: 0, field: "name" },
        },
      ],
    } as CampusMapEditSession;
    render(
      <CampusMapEditSheet
        session={session}
        centerPosition={[114.2, 22.4]}
        onEvent={vi.fn()}
      />,
    );

    expect(screen.getByRole("alert").textContent).toContain(message);
    const name = document.querySelector<HTMLInputElement>(
      'input[name="campus-map-place-name"]',
    )!;
    const describedBy = name.getAttribute("aria-describedby");
    expect(document.getElementById(describedBy!)?.textContent).toContain(
      message,
    );
  });

  it.each([
    ["", "请填写能辨认这处设施的名称或编号。"],
    ["名称\u0000", "名称含有无法保存的字符，请删除后重试。"],
    ["你".repeat(81), "名称过长，请缩短后重试。"],
  ])("shows accurate local top and field feedback for %j", (name, message) => {
    const session = {
      status: "editing",
      localError: "name",
      draft: { ...draft(), fact: { ...draft().fact, name } },
    } as CampusMapEditSession;
    render(
      <CampusMapEditSheet
        session={session}
        centerPosition={[114.2, 22.4]}
        onEvent={vi.fn()}
      />,
    );

    expect(screen.getByRole("alert").textContent).toContain(message);
    const input = document.querySelector<HTMLInputElement>(
      'input[name="campus-map-place-name"]',
    )!;
    const describedBy = input.getAttribute("aria-describedby");
    expect(document.getElementById(describedBy!)?.textContent).toContain(
      message,
    );
  });

  it("keeps provenance controls out while exposing canonical access controls", () => {
    const onEvent = vi.fn();
    const session: CampusMapEditSession = {
      status: "editing",
      draft: {
        ...draft(),
        fact: {
          ...draft().fact,
          location: {
            kind: "outdoor-point",
            longitude: 114.2,
            latitude: 22.4,
            crs: "wgs84",
            precision: "approximate",
          },
        },
      },
    };
    render(
      <CampusMapEditSheet
        session={session}
        centerPosition={[114.2, 22.4]}
        onEvent={onEvent}
      />,
    );

    expect(screen.queryByLabelText("现场观察时间（香港时间）")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "更多信息" }));
    expect(screen.getByRole("combobox", { name: "开放时间" })).toBeTruthy();
    expect(screen.queryByText("资料依据")).toBeNull();
    expect(onEvent).not.toHaveBeenCalled();
  });

  it("rejects blank keyboard coordinates instead of treating them as zero", () => {
    render(
      <CampusMapEditSheet
        session={{ status: "placing", draft: draft() }}
        centerPosition={[114.2, 22.4]}
        onEvent={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "输入坐标" }));
    const useCoordinates = screen.getByRole("button", {
      name: "使用输入坐标",
    }) as HTMLButtonElement;
    fireEvent.change(screen.getByRole("textbox", { name: "经度（WGS84）" }), {
      target: { value: "" },
    });
    expect(useCoordinates.disabled).toBe(true);
    fireEvent.change(screen.getByRole("textbox", { name: "经度（WGS84）" }), {
      target: { value: "114.2" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "纬度（WGS84）" }), {
      target: { value: "   " },
    });
    expect(useCoordinates.disabled).toBe(true);
  });

  it("does not resurrect removed source controls for an old local error", () => {
    const session: CampusMapEditSession = {
      status: "editing",
      localError: "sources",
      draft: {
        ...draft(),
        fact: {
          ...draft().fact,
          location: {
            kind: "outdoor-point",
            longitude: 114.2,
            latitude: 22.4,
            crs: "wgs84",
            precision: "approximate",
          },
        },
      },
    };

    render(
      <CampusMapEditSheet
        session={session}
        centerPosition={[114.2, 22.4]}
        onEvent={vi.fn()}
      />,
    );

    expect(document.querySelector('[data-edit-field="sources"]')).toBeNull();
    expect(screen.queryByLabelText("现场观察时间（香港时间）")).toBeNull();
  });

  it("keeps unrelated access controls collapsed for an old local error", () => {
    const session: CampusMapEditSession = {
      status: "editing",
      localError: "capabilities",
      draft: {
        ...draft(),
        fact: {
          ...draft().fact,
          pinType: "printer",
          location: {
            kind: "outdoor-point",
            longitude: 114.2,
            latitude: 22.4,
            crs: "wgs84",
            precision: "approximate",
          },
        },
      },
    };

    render(
      <CampusMapEditSheet
        session={session}
        centerPosition={[114.2, 22.4]}
        onEvent={vi.fn()}
      />,
    );

    expect(
      document.querySelector('[data-edit-field="capabilities"]'),
    ).toBeNull();
    expect(
      screen
        .getByRole("button", { name: "更多信息" })
        .getAttribute("aria-expanded"),
    ).toBe("false");
    expect(screen.queryByRole("group", { name: "开放与使用条件" })).toBeNull();
  });

  it("makes the map location row programmatically focusable", () => {
    const session: CampusMapEditSession = {
      status: "editing",
      localError: "location",
      draft: {
        ...draft(),
        fact: {
          ...draft().fact,
          location: {
            kind: "outdoor-point",
            longitude: 114.2,
            latitude: 22.4,
            crs: "wgs84",
            precision: "approximate",
          },
        },
      },
    };

    render(
      <CampusMapEditSheet
        session={session}
        centerPosition={[114.2, 22.4]}
        onEvent={vi.fn()}
      />,
    );

    const locationTarget = document.querySelector<HTMLElement>(
      '[data-edit-field="location"]',
    );
    expect(locationTarget?.getAttribute("tabindex")).toBe("-1");
    locationTarget?.focus();
    expect(document.activeElement).toBe(locationTarget);
  });

  it("shows forbidden results as a permission state, not field validation", () => {
    const session = {
      status: "forbidden",
      forbiddenCode: "actor-banned",
      draft: draft(),
    } as unknown as CampusMapEditSession;

    render(
      <CampusMapEditSheet
        session={session}
        centerPosition={[114.2, 22.4]}
        onEvent={vi.fn()}
      />,
    );

    expect(screen.getByRole("alert").textContent).toContain("账号已被封禁");
    expect(screen.queryByText(/服务器未接受这项资料/)).toBeNull();
    expect(screen.queryByRole("button", { name: "发布设施" })).toBeNull();
  });

  it("labels a canonical precise outdoor location honestly", () => {
    const session: CampusMapEditSession = {
      status: "editing",
      draft: {
        ...draft(),
        fact: {
          ...draft().fact,
          location: {
            kind: "outdoor-point",
            longitude: 114.20801,
            latitude: 22.41966,
            crs: "wgs84",
            precision: "precise",
          },
        },
      },
    };

    render(
      <CampusMapEditSheet
        session={session}
        centerPosition={[114.20801, 22.41966]}
        onEvent={vi.fn()}
      />,
    );

    expect(screen.getByText("WGS84 · 精确位置")).toBeTruthy();
    expect(screen.queryByText(/WGS84 · 约略/)).toBeNull();
  });

  it("keeps an access validation target visible and focusable", () => {
    const session: CampusMapEditSession = {
      status: "editing",
      localError: "accessSchedule",
      draft: {
        ...draft(),
        fact: {
          ...draft().fact,
          location: {
            kind: "outdoor-point",
            longitude: 114.2,
            latitude: 22.4,
            crs: "wgs84",
            precision: "approximate",
          },
        },
      },
    };

    const view = render(
      <CampusMapEditSheet
        session={session}
        centerPosition={[114.2, 22.4]}
        onEvent={vi.fn()}
      />,
    );

    expect(screen.getByRole("combobox", { name: "开放时间" })).toBeTruthy();
    expect(
      document.querySelector('[data-edit-field="accessSchedule"]'),
    ).toBeTruthy();
    fireEvent.focus(screen.getByRole("combobox", { name: "开放时间" }));
    view.rerender(
      <CampusMapEditSheet
        session={{ ...session, localError: undefined }}
        centerPosition={[114.2, 22.4]}
        onEvent={vi.fn()}
      />,
    );
    expect(screen.getByRole("group", { name: "开放与使用条件" })).toBeTruthy();
  });

  it("uses reposition wording for an Edit placement", () => {
    const session: CampusMapEditSession = {
      status: "placing",
      draft: createCampusMapEditDraft({
        mode: "edit",
        placeId,
        baseRevisionId: revisionId,
        idempotencyKey: "10000000-0000-4000-8000-000000000002",
        fact: {
          ...draft().fact,
          location: {
            kind: "outdoor-point",
            longitude: 114.2,
            latitude: 22.4,
            crs: "wgs84",
            precision: "approximate",
          },
        },
      }),
    };

    render(
      <CampusMapEditSheet
        session={session}
        centerPosition={[114.2, 22.4]}
        onEvent={vi.fn()}
      />,
    );

    expect(
      screen.getByText("拖动地图或轻点地点名称，选择新的设施位置。"),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "使用此位置" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "确认新位置" })).toBeNull();
    expect(screen.queryByText(/要添加的地点/)).toBeNull();
  });

  it("starts every conflict attempt with a fresh explicit selection", () => {
    const baseDraft = draft();
    const currentFact = {
      ...baseDraft.fact,
      name: "最新版",
      location: {
        kind: "outdoor-point" as const,
        longitude: 114.2,
        latitude: 22.4,
        crs: "wgs84" as const,
        precision: "approximate" as const,
      },
    };
    const first: CampusMapEditSession = {
      status: "conflict",
      draft: {
        ...baseDraft,
        fact: { ...currentFact, name: "我的版本" },
      },
      conflict: { kind: "current", currentRevisionId: revisionId, currentFact },
    };
    const view = render(
      <CampusMapEditSheet
        session={first}
        centerPosition={[114.2, 22.4]}
        onEvent={vi.fn()}
      />,
    );
    const keepName = screen.getByLabelText("保留我的名称");
    fireEvent.click(keepName);
    expect(keepName).toHaveProperty("checked", true);

    view.rerender(
      <CampusMapEditSheet
        session={{
          ...first,
          draft: { ...first.draft, idempotencyKey: changesetId },
          conflict: {
            kind: "current",
            currentRevisionId: changesetId,
            currentFact,
          },
        }}
        centerPosition={[114.2, 22.4]}
        onEvent={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("保留我的名称")).toHaveProperty(
      "checked",
      false,
    );
  });

  it("keeps building, floor, and geometry atomic when preserving a conflict position", () => {
    const onEvent = vi.fn();
    const baseDraft = draft();
    const mine = {
      ...baseDraft.fact,
      buildingId: null,
      floorId: null,
      location: {
        kind: "outdoor-point" as const,
        longitude: 114.21,
        latitude: 22.42,
        crs: "wgs84" as const,
        precision: "approximate" as const,
      },
    };
    const buildingId = "50000000-0000-4000-8000-000000000001";
    const floorId = "60000000-0000-4000-8000-000000000001";
    const currentFact = {
      ...baseDraft.fact,
      buildingId,
      floorId,
      location: { kind: "floor" as const },
    };
    const session: CampusMapEditSession = {
      status: "conflict",
      draft: { ...baseDraft, fact: mine },
      conflict: {
        kind: "current",
        currentRevisionId: revisionId,
        currentFact,
        currentLocationDisplay: {
          buildingId,
          buildingName: "科学馆",
          floorId,
          floorLabel: "1/F",
        },
      },
    };
    render(
      <CampusMapEditSheet
        session={session}
        centerPosition={[114.2, 22.4]}
        onEvent={onEvent}
      />,
    );

    expect(screen.getAllByLabelText("保留我的位置")).toHaveLength(1);
    fireEvent.click(screen.getByLabelText("保留我的位置"));
    fireEvent.click(screen.getByRole("button", { name: "按以上选择继续" }));

    expect(onEvent).toHaveBeenLastCalledWith({
      type: "CONTINUE_FROM_CONFLICT",
      idempotencyKey: expect.any(String),
      fact: expect.objectContaining({
        buildingId: null,
        floorId: null,
        location: mine.location,
      }),
    });
    expect(
      screen.getByText("我的：114.210000, 22.420000 · WGS84 · 约略"),
    ).toBeTruthy();
    expect(screen.getByText("最新：科学馆 · 1/F")).toBeTruthy();
    expect(document.body.textContent).not.toContain(buildingId);
    expect(document.body.textContent).not.toContain(floorId);
  });

  it("describes conflict values to screen readers and formats observation time", () => {
    const baseDraft = draft();
    const location: CampusMapPublishFactInput["location"] = {
      kind: "outdoor-point",
      longitude: 114.2,
      latitude: 22.4,
      crs: "wgs84",
      precision: "approximate",
    };
    const mine = {
      ...baseDraft.fact,
      location,
      observedAt: "2026-08-25T04:00:00.000Z",
    };
    const currentFact = {
      ...mine,
      observedAt: "2026-08-25T05:30:00.000Z",
    };
    render(
      <CampusMapEditSheet
        session={{
          status: "conflict",
          draft: { ...baseDraft, fact: mine },
          conflict: {
            kind: "current",
            currentRevisionId: revisionId,
            currentFact,
          },
        }}
        centerPosition={[114.2, 22.4]}
        onEvent={vi.fn()}
      />,
    );

    const checkbox = screen.getByRole("checkbox", {
      name: "保留我的观察时间",
    });
    const describedBy = checkbox.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    const description = describedBy
      ?.split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent)
      .join(" ");
    expect(description).toContain("我的：2026年8月25日 12:00（香港时间）");
    expect(description).toContain("最新：2026年8月25日 13:30（香港时间）");
    expect(description).not.toContain("2026-08-25T04:00:00.000Z");
  });

  it("blocks an indoor placement conflict when canonical labels are unavailable", () => {
    const baseDraft = draft();
    const mine = {
      ...baseDraft.fact,
      location: {
        kind: "outdoor-point" as const,
        longitude: 114.21,
        latitude: 22.42,
        crs: "wgs84" as const,
        precision: "approximate" as const,
      },
    };
    const currentFact = {
      ...baseDraft.fact,
      buildingId: "50000000-0000-4000-8000-000000000001",
      floorId: "60000000-0000-4000-8000-000000000001",
      location: { kind: "floor" as const },
    };
    render(
      <CampusMapEditSheet
        session={{
          status: "conflict",
          draft: { ...baseDraft, fact: mine },
          conflict: {
            kind: "current",
            currentRevisionId: revisionId,
            currentFact,
          },
        }}
        centerPosition={[114.2, 22.4]}
        onEvent={vi.fn()}
      />,
    );

    expect(screen.getByText("无法安全比较最新位置")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "采用最新资料" })).toBeNull();
    expect(screen.queryByRole("button", { name: "按以上选择继续" })).toBeNull();
  });

  it("keeps a changed place type and its dependent fields atomic", () => {
    const onEvent = vi.fn();
    const baseDraft = draft();
    const location: CampusMapPublishFactInput["location"] = {
      kind: "outdoor-point",
      longitude: 114.2,
      latitude: 22.4,
      crs: "wgs84",
      precision: "approximate",
    };
    const mine: CampusMapPublishFactInput = {
      ...baseDraft.fact,
      pinType: "printer",
      capabilities: ["print"],
      gender: "unknown",
      location,
    };
    const currentFact: CampusMapPublishFactInput = {
      ...baseDraft.fact,
      pinType: "toilet",
      capabilities: [],
      gender: "female",
      location,
    };
    const session: CampusMapEditSession = {
      status: "conflict",
      draft: { ...baseDraft, fact: mine },
      conflict: { kind: "current", currentRevisionId: revisionId, currentFact },
    };
    render(
      <CampusMapEditSheet
        session={session}
        centerPosition={[114.2, 22.4]}
        onEvent={onEvent}
      />,
    );

    expect(screen.getAllByLabelText("保留我的地点类型及相关资料")).toHaveLength(
      1,
    );
    expect(screen.queryByLabelText("保留我的服务能力")).toBeNull();
    expect(screen.queryByLabelText("保留我的性别属性")).toBeNull();
    fireEvent.click(screen.getByLabelText("保留我的地点类型及相关资料"));
    fireEvent.click(screen.getByRole("button", { name: "按以上选择继续" }));

    expect(onEvent).toHaveBeenLastCalledWith({
      type: "CONTINUE_FROM_CONFLICT",
      idempotencyKey: expect.any(String),
      fact: expect.objectContaining({
        pinType: "printer",
        capabilities: ["print"],
        gender: "unknown",
      }),
    });
    expect(screen.getByText("我的：打印服务 · 服务：打印")).toBeTruthy();
    expect(screen.getByText("最新：洗手间 · 性别：女")).toBeTruthy();
  });

  it("keeps an unavailable conflict non-publishable without rendering rebase actions", () => {
    const session: CampusMapEditSession = {
      status: "conflict",
      draft: {
        ...draft(),
        mode: "edit",
        placeId,
        baseRevisionId: revisionId,
        baselineFact: {
          ...draft().fact,
          location: {
            kind: "outdoor-point",
            longitude: 114.2,
            latitude: 22.4,
            crs: "wgs84",
            precision: "approximate",
          },
        },
        fact: {
          ...draft().fact,
          name: "仍保留的草稿",
          location: {
            kind: "outdoor-point",
            longitude: 114.2,
            latitude: 22.4,
            crs: "wgs84",
            precision: "approximate",
          },
        },
      },
      conflict: { kind: "unavailable" },
    };

    render(
      <CampusMapEditSheet
        session={session}
        centerPosition={[114.2, 22.4]}
        onEvent={vi.fn()}
      />,
    );

    expect(screen.getByRole("alert").textContent).toContain(
      "无法读取地点的最新版本",
    );
    expect(screen.queryByRole("button", { name: "采用最新资料" })).toBeNull();
    expect(screen.queryByRole("button", { name: "按以上选择继续" })).toBeNull();
    expect(screen.queryByRole("button", { name: "发布修改" })).toBeNull();
  });
});
