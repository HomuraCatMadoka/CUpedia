/**
 * @vitest-environment jsdom
 */
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listPublicProductUpdates: vi.fn(),
  getPublicProductUpdate: vi.fn(),
}));

vi.mock("@/lib/product-update-queries", () => ({
  listPublicProductUpdates: mocks.listPublicProductUpdates,
  getPublicProductUpdate: mocks.getPublicProductUpdate,
}));

import ProductUpdateDetailPage from "@/app/(main)/updates/[id]/page";
import ProductUpdatesPage from "@/app/(main)/updates/page";

const update = {
  id: "00000000-0000-4000-a100-000000000001",
  title: "课程测评新增教授查找",
  summary: "从课程页面快速查看相关教授与学生评价。",
  content: "这次更新让教授资料与课程评价更容易互相查找。",
  type: "feature" as const,
  areas: ["courses"] as const,
  publishedAt: "2026-08-13T04:00:00.000Z",
};

describe("product updates public pages", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lists published updates with stable detail links", async () => {
    mocks.listPublicProductUpdates.mockResolvedValue([update]);
    render(await ProductUpdatesPage());

    expect(screen.getByRole("heading", { name: "产品更新" })).toBeTruthy();
    expect(screen.getByText("新功能")).toBeTruthy();
    expect(screen.getByText("课程")).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: /课程测评新增教授查找/ })
        .getAttribute("href"),
    ).toBe(`/updates/${update.id}`);
  });

  it("renders the full public update", async () => {
    mocks.getPublicProductUpdate.mockResolvedValue(update);
    render(
      await ProductUpdateDetailPage({
        params: Promise.resolve({ id: update.id }),
      }),
    );

    expect(screen.getByRole("heading", { name: update.title })).toBeTruthy();
    expect(screen.getByText(update.content)).toBeTruthy();
  });

  it("explains an unavailable permanent link", async () => {
    mocks.getPublicProductUpdate.mockResolvedValue(null);
    render(
      await ProductUpdateDetailPage({
        params: Promise.resolve({ id: update.id }),
      }),
    );

    expect(
      screen.getByRole("heading", { name: "产品更新不存在" }),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "返回全部产品更新" })
        .getAttribute("href"),
    ).toBe("/updates");
  });
});
