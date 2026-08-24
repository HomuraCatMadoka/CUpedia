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
      target: { value: "2026-08-25T14:30" },
    });
    fireEvent.click(screen.getByRole("button", { name: "使用现场观察来源" }));
    expect(onEvent.mock.calls.at(-1)?.[0]).toMatchObject({
      type: "CHANGE_SOURCES",
      sources: [
        {
          accessedOn: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
          observedAt: "2026-08-25T06:30:00.000Z",
        },
      ],
    });
  });
});
