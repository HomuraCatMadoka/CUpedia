// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
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
});
