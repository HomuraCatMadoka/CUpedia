// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CampusMapEditSheet } from "@/components/campus-map/edit-sheet";
import {
  createCampusMapEditDraft,
  type CampusMapEditSession,
} from "@/lib/campus-map/edit-session";

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
    const nameInput = screen.getByRole("textbox", { name: "地点名称" });
    expect(screen.getByText("高德识别 · 科学馆")).toBeTruthy();
    expect(screen.getByRole("radio", { name: "饮水点" })).toBeTruthy();

    fireEvent.change(nameInput, { target: { value: "科学馆饮水点" } });
    expect(onEvent).toHaveBeenLastCalledWith({
      type: "CHANGE_FACT",
      fact: expect.objectContaining({
        name: "科学馆饮水点",
        location: null,
      }),
    });
    fireEvent.click(screen.getByRole("button", { name: "继续填写" }));
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

    fireEvent.click(screen.getByRole("button", { name: "其他定位方式" }));
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

    expect(
      document
        .querySelector('[data-edit-field="location"]')
        ?.getAttribute("tabindex"),
    ).toBe("-1");
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
      conflict: { currentRevisionId: revisionId, currentFact },
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
            ...first.conflict!,
            currentRevisionId: changesetId,
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
});
