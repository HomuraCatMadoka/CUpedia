// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CampusMapEditSheet } from "@/components/campus-map/edit-sheet";
import {
  createCampusMapEditDraft,
  type CampusMapEditSession,
} from "@/lib/campus-map/edit-session";
import type { CampusMapPublishFactInput } from "@/lib/campus-map/publish-contract";

const placeId = "20000000-0000-4000-8000-000000000001";
const revisionId = "30000000-0000-4000-8000-000000000001";
const changesetId = "40000000-0000-4000-8000-000000000001";

function draft() {
  return createCampusMapEditDraft({
    mode: "add",
    idempotencyKey: "10000000-0000-4000-8000-000000000001",
  });
}

describe("Campus Map single-page edit Sheet", () => {
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
    const nameInput = screen.getByLabelText("地点名称");
    expect(screen.queryByRole("textbox", { name: "地点名称" })).toBeNull();
    expect(screen.getByText("科学馆")).toBeTruthy();
    expect(screen.getByText("高德参考 · 香港中文大学中央大道")).toBeTruthy();
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
    expect(screen.getByRole("textbox", { name: "地点名称" })).toBe(nameInput);
  });

  it("keeps programmatic heading focus visible for keyboard users", () => {
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

    const heading = screen.getByRole("heading", { name: "添加地点" });
    heading.focus();
    expect(document.activeElement).toBe(heading);
    expect(heading.getAttribute("tabindex")).toBe("-1");
    expect(heading.className).toContain("focus-visible:ring-2");
  });

  it("keeps every place type discoverable without a hidden horizontal scroller", () => {
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

    const typeGroup = screen.getByRole("group", { name: "地点类型" });
    const choices = typeGroup.querySelector("div");
    expect(choices?.className).toContain("grid-cols-2");
    expect(choices?.className).not.toContain("overflow-x-auto");
    expect(
      screen.getByRole("radio", { name: "课室" }).closest("label")?.className,
    ).toContain("col-span-2");
    expect(typeGroup.getAttribute("tabindex")).toBe("-1");
    expect(typeGroup.className).toContain("focus-visible:ring-2");
    expect(screen.queryByText(/Changeset 说明/)).toBeNull();
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

    expect(screen.getByText("邵逸夫堂")).toBeTruthy();
    expect(screen.getByText("高德参考 · 附近地点")).toBeTruthy();
  });

  it.each([
    ["rate-limited", "地址查询较频繁，仍可使用此位置"],
    ["transient-error", "暂时无法识别地址，仍可使用此位置"],
    ["permanent-error", "地址服务不可用，仍可使用此位置"],
    ["empty", "高德未找到附近地点，仍可使用此位置"],
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
    expect(screen.queryByRole("textbox", { name: "地点名称" })).toBeNull();
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

    fireEvent.change(screen.getByRole("textbox", { name: "地点名称" }), {
      target: { value: "修改后重新发布" },
    });

    expect(onEvent).toHaveBeenLastCalledWith({
      type: "CHANGE_FACT",
      fact: expect.objectContaining({ name: "修改后重新发布" }),
      idempotencyKey: expect.any(String),
    });
    expect(onEvent.mock.calls.at(-1)?.[0].idempotencyKey).not.toBe(
      session.draft.idempotencyKey,
    );
  });

  it("shows only #719 Place, Changeset, and History links on the receipt", () => {
    const session: CampusMapEditSession = {
      status: "published",
      draft: draft(),
      receipt: { placeId, revisionId, changesetId },
    };
    render(
      <CampusMapEditSheet
        session={session}
        centerPosition={[114.2, 22.4]}
        onEvent={vi.fn()}
      />,
    );

    expect(screen.getAllByRole("link").map((link) => link.textContent)).toEqual(
      ["查看 Place", "查看此次 Changeset", "查看 History"],
    );
    expect(document.body.textContent).not.toMatch(
      /discussion|Map Note|请求复核/i,
    );
  });

  it("renders only server-issued warning identity and a fresh acknowledgement action", () => {
    const fingerprint = "a".repeat(64);
    const session: CampusMapEditSession = {
      status: "warning",
      draft: draft(),
      warnings: [
        {
          code: "duplicate-candidate",
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
      "duplicate-candidate",
    );
    expect(screen.getByRole("alert").textContent).toContain(fingerprint);
    expect(
      screen.getByRole("button", { name: "我已确认，重新发布" }),
    ).toBeTruthy();
  });

  it("creates editable weekly hours and honest observation timestamps", () => {
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
    fireEvent.click(screen.getByRole("button", { name: "添加资料来源" }));

    fireEvent.change(screen.getByLabelText("现场观察时间（香港时间）"), {
      target: { value: "" },
    });
    fireEvent.click(screen.getByRole("button", { name: "使用现场观察来源" }));
    expect(onEvent.mock.calls.at(-1)?.[0]).toEqual({
      type: "REPORT_LOCAL_ERROR",
      field: "sourceObservedAt",
    });

    fireEvent.change(screen.getByLabelText("开放时间"), {
      target: { value: "weekly" },
    });
    expect(onEvent.mock.calls.at(-1)?.[0]).toMatchObject({
      type: "CHANGE_FACT",
      fact: {
        accessSchedule: {
          kind: "weekly",
          timezone: "Asia/Hong_Kong",
          intervals: [{ opensAt: "09:00", closesAt: "17:00" }],
        },
      },
    });

    fireEvent.change(screen.getByLabelText("现场观察时间（香港时间）"), {
      target: { value: "2026-08-24T14:30" },
    });
    fireEvent.click(screen.getByRole("button", { name: "使用现场观察来源" }));
    expect(onEvent.mock.calls.at(-1)?.[0]).toMatchObject({
      type: "CHANGE_SOURCES",
      sources: [
        {
          accessedOn: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
          observedAt: "2026-08-24T06:30:00.000Z",
        },
      ],
    });
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

  it("expands and exposes a real focus target when source validation fails", () => {
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

    const sourceTarget = document.querySelector<HTMLElement>(
      '[data-edit-field="sources"]',
    );
    expect(sourceTarget?.tagName).toBe("BUTTON");
    expect(sourceTarget?.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByLabelText("现场观察时间（香港时间）")).toBeTruthy();
  });

  it("expands optional details and exposes capabilities as a focus target", () => {
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
    ).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "更多资料" })
        .getAttribute("aria-expanded"),
    ).toBe("true");
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
    expect(locationTarget?.className).toContain("focus-visible:ring-2");
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
    expect(
      (
        screen.getByRole("button", {
          name: "发布新地点",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
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

    expect(screen.getByText("精确位置")).toBeTruthy();
    expect(screen.queryByText("约略位置")).toBeNull();
  });

  it("reveals optional fields when local validation targets one", () => {
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

    render(
      <CampusMapEditSheet
        session={session}
        centerPosition={[114.2, 22.4]}
        onEvent={vi.fn()}
      />,
    );

    expect(
      screen
        .getByRole("button", { name: "更多资料" })
        .getAttribute("aria-expanded"),
    ).toBe("true");
    expect(screen.getByRole("combobox", { name: "开放时间" })).toBeTruthy();
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

    expect(screen.getByText("移动地图，让图钉对准地点的新位置。")).toBeTruthy();
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
    expect(
      screen.getByRole("button", { name: "发布修改" }).hasAttribute("disabled"),
    ).toBe(true);
  });
});
