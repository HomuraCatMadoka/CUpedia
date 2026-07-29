/**
 * @vitest-environment jsdom
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { DanmakuBanner } from "@/components/home/danmaku-banner";

vi.mock("@/components/auth/contributor-setup-provider", () => ({
  useContributorSetup: () => ({
    ensureContributorSetup: vi.fn(),
  }),
}));

beforeAll(() => {
  global.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
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
});
