/**
 * @vitest-environment jsdom
 */
import Link from "next/link";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { CanteenShell } from "@/components/canteen/canteen-shell";

describe("CanteenShell announcement", () => {
  it("shows announcement under the title when set", () => {
    render(
      <CanteenShell
        title="善衡书院食堂"
        announcement="外带加一块钱 · 随餐饮品加三块钱"
      >
        <div>弹幕区</div>
      </CanteenShell>,
    );

    expect(screen.getByRole("heading", { name: "善衡书院食堂" })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe(
      "外带加一块钱 · 随餐饮品加三块钱",
    );
    expect(screen.getByText("弹幕区")).toBeTruthy();
  });

  it("hides announcement when empty", () => {
    render(
      <CanteenShell title="善衡书院食堂" announcement={null}>
        <div>弹幕区</div>
      </CanteenShell>,
    );

    expect(screen.queryByRole("status")).toBeNull();
  });

  it("shows action on the same row as the title", () => {
    render(
      <CanteenShell
        title="山城食记"
        brandTitle
        action={<Link href="/canteen/shit-rank">每日💩堂榜</Link>}
      >
        <div>列表</div>
      </CanteenShell>,
    );

    expect(screen.getByRole("link", { name: "每日💩堂榜" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "山城食记" })).toBeTruthy();
  });

  it("keeps the page title before visually promoted live content in the DOM", () => {
    render(
      <CanteenShell
        title="善衡书院食堂"
        topContent={
          <section aria-label="弹幕">
            <h2>弹幕</h2>
          </section>
        }
      >
        <div>菜单</div>
      </CanteenShell>,
    );

    const title = screen.getByRole("heading", {
      level: 1,
      name: "善衡书院食堂",
    });
    const liveHeading = screen.getByRole("heading", {
      level: 2,
      name: "弹幕",
    });

    expect(
      title.compareDocumentPosition(liveHeading) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("compacts location and announcement beside the detail title", () => {
    render(
      <CanteenShell
        title="演示食堂"
        subtitle="演示区域 A"
        announcement="外带加 $1 · 随餐饮品加 $3"
        topContent={<div>弹幕</div>}
      >
        <div>菜单</div>
      </CanteenShell>,
    );

    const status = screen.getByRole("status");
    expect(status.classList.contains("canteen-detail-meta")).toBe(true);
    expect(status.textContent).toContain("演示区域 A");
    expect(status.textContent).toContain("外带加 $1 · 随餐饮品加 $3");
  });
});
