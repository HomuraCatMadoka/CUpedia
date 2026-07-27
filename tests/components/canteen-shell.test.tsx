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
});
