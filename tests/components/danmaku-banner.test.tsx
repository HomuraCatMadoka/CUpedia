/**
 * @vitest-environment jsdom
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DanmakuBanner } from "@/components/home/danmaku-banner";

vi.mock("@/components/auth/contributor-setup-provider", () => ({
  useContributorSetup: () => ({
    ensureContributorSetup: vi.fn(async () => true),
  }),
}));

beforeAll(() => {
  global.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("DanmakuBanner", () => {
  it("renders a compact visible empty state", () => {
    render(<DanmakuBanner initialMessages={[]} viewer={{ kind: "guest" }} />);

    const emptyState = screen.getAllByText("暂无弹幕，来发第一条吧");
    expect(emptyState.length).toBeGreaterThan(0);
    expect(emptyState[0]?.parentElement?.className).toContain("h-24");
  });

  it("integrates the empty state into a borderless hero", () => {
    render(
      <DanmakuBanner
        initialMessages={[]}
        viewer={{ kind: "guest" }}
        title="校园正在聊"
        trackCount={3}
        appearance="hero"
      />,
    );

    const region = screen.getByRole("region", { name: "校园正在聊" });
    const layer = region.querySelector(".danmaku-track-layer");
    expect(
      screen.getAllByText("校园此刻很安静，来发第一条吧").length,
    ).toBeGreaterThan(0);
    expect(region.className).toContain("danmaku-hero");
    expect(layer?.className).toContain("danmaku-track-layer--hero");
    expect(layer?.className).not.toContain("border");
  });

  it("flies the sender's danmaku immediately after a successful post", async () => {
    const existing = Array.from({ length: 12 }, (_, i) => ({
      id: `old-${i}`,
      content: `旧弹幕${i}`,
      month: "2026-07",
      createdAt: new Date(`2026-07-01T0${Math.min(i, 9)}:00:00Z`),
    }));

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          message: {
            id: "new-1",
            content: "我刚发的",
            month: "2026-07",
            createdAt: "2026-07-31T05:00:00.000Z",
          },
        }),
      })),
    );

    render(
      <DanmakuBanner
        initialMessages={existing}
        initialFlyMessages={existing}
        viewer={{ kind: "member", userId: "u1", nickname: "测试" }}
        trackCount={3}
      />,
    );

    fireEvent.change(screen.getByLabelText("弹幕内容"), {
      target: { value: "我刚发的" },
    });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    await waitFor(() => {
      const live = document.querySelector(
        ".danmaku-track-layer [data-live-danmaku]",
      );
      expect(live?.textContent).toBe("我刚发的");
      expect(live?.getAttribute("style") ?? "").toMatch(
        /animation-delay:\s*0s/i,
      );
    });
  });
});
