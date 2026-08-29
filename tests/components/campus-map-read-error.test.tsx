// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import CampusMapReadError from "@/app/(main)/campus-map/error";
import { CampusMapHistoryPage } from "@/components/campus-map/history-shell";

describe("Campus Map history unavailable state (#719)", () => {
  it("shows a safe retry state without exposing database details", () => {
    render(<CampusMapReadError reset={vi.fn()} />);

    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("暂时无法读取 Campus Map 历史");
    expect(alert.textContent).not.toMatch(/postgres|database|drizzle|sql/i);
    expect(
      screen.getByRole("button", { name: "重试" }).hasAttribute("disabled"),
    ).toBe(false);
  });
});

describe("Campus Map paginated history lifecycle (#719)", () => {
  it("keeps the canonical merged head when an older page has no head item", () => {
    const survivorId = "00000000-0000-4000-8000-000000007200";
    render(
      <CampusMapHistoryPage
        placeId="00000000-0000-4000-8000-000000007192"
        mapHref="/campus-map?v=1"
        head={{
          revisionId: "00000000-0000-4000-8000-000000007198",
          status: "merged",
          visibility: "public",
          mergedIntoPlaceId: survivorId,
          name: "已合并地点",
        }}
        items={[]}
        nextHref={null}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "已合并地点的编辑记录" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "返回地图" }).getAttribute("href"),
    ).toBe("/campus-map?v=1");
    expect(
      screen.getByRole("link", { name: "地点详情" }).getAttribute("href"),
    ).toBe("/campus-map/places/00000000-0000-4000-8000-000000007192");
    expect(
      screen.getByRole("link", { name: "保留地点" }).getAttribute("href"),
    ).toBe(`/campus-map/places/${survivorId}`);
    expect(
      screen.queryByText("按时间查看地点名称、类型和位置的修改。"),
    ).toBeNull();
    expect(screen.queryByText("查看这个地点过去的公开修改。")).toBeNull();
  });

  it("shows the Changeset explanation and safe source summary on revisions", () => {
    render(
      <CampusMapHistoryPage
        placeId="00000000-0000-4000-8000-000000007192"
        mapHref="/campus-map?v=1"
        head={null}
        items={[
          {
            id: "00000000-0000-4000-8000-000000007198",
            placeId: "00000000-0000-4000-8000-000000007192",
            previousRevisionId: null,
            status: "active",
            mergedIntoPlaceId: null,
            factSchemaVersion: 1,
            fieldMetadata: {},
            operation: "create",
            fieldDiff: {},
            actor: {
              id: "00000000-0000-4000-8000-000000007191",
              nickname: "地图贡献者",
            },
            changesetId: "00000000-0000-4000-8000-000000007193",
            comment: "建立饮水点",
            sourceSummary: "现场观察",
            publishedAt: new Date("2026-08-20T01:00:00Z"),
            createdAt: new Date("2026-08-20T01:00:00Z"),
            content: {
              visibility: "redacted",
            },
          },
        ]}
        nextHref={null}
      />,
    );

    expect(screen.getByText("建立饮水点")).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "地点的编辑记录" }),
    ).toBeTruthy();
    expect(document.body.textContent).not.toContain("地点 00000000");
    expect(screen.getByText("来源摘要：现场观察")).toBeTruthy();
    expect(
      screen.getByText(
        (_content, element) =>
          element?.tagName === "P" &&
          element.textContent ===
            "Changeset：00000000-0000-4000-8000-000000007193",
      ),
    ).toBeTruthy();
  });
});
