/**
 * @vitest-environment jsdom
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CanteenMenuSyncHealth } from "@/components/admin/canteen-menu-sync-health";
import type { AdminCanteenMenuSourceHealth } from "@/lib/canteen-menu-sync-health";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const NOW = new Date("2026-08-14T04:00:00.000Z");

const SOURCE: AdminCanteenMenuSourceHealth = {
  id: "source-1",
  canteenId: "canteen-1",
  canteenName: "開心軒茶社",
  provider: "pinme",
  externalOwnerId: null,
  externalStoreId: "5203",
  enabled: true,
  managedItemCount: 0,
  manualItemCount: 2,
  legacyTakeoverAt: null,
  lastAttemptAt: new Date("2026-08-14T03:00:00Z"),
  lastSuccessAt: null,
  lastErrorCode: "UPSTREAM_HTTP_503",
  hasOverdueRun: false,
  recentRuns: [
    {
      id: "run-1",
      status: "running",
      itemCount: null,
      createdCount: null,
      updatedCount: null,
      deactivatedCount: null,
      errorCode: null,
      startedAt: new Date("2026-08-14T03:00:00Z"),
      completedAt: null,
    },
  ],
};

describe("CanteenMenuSyncHealth", () => {
  it("renders independent rollout facts without treating an older error as the latest attempt outcome", () => {
    render(<CanteenMenuSyncHealth sources={[SOURCE]} evaluatedAt={NOW} />);

    expect(screen.getByRole("heading", { name: "菜单同步健康" })).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "開心軒茶社" }).getAttribute("href"),
    ).toBe("/admin/canteens/canteen-1");
    expect(screen.getByText("pinme:5203")).toBeTruthy();
    expect(screen.getByText("从未成功")).toBeTruthy();
    expect(screen.getByText("存在手工菜品")).toBeTruthy();
    expect(screen.getByText(/UPSTREAM_HTTP_503/)).toBeTruthy();
    expect(screen.queryByText("最近尝试失败")).toBeNull();
    expect(screen.queryByText(/private|token/i)).toBeNull();
  });

  it("shows a source that has never attempted synchronization", () => {
    render(
      <CanteenMenuSyncHealth
        evaluatedAt={NOW}
        sources={[
          {
            ...SOURCE,
            lastAttemptAt: null,
            lastSuccessAt: null,
            lastErrorCode: null,
            manualItemCount: 0,
            recentRuns: [],
          },
        ]}
      />,
    );

    expect(screen.getByText("从未同步")).toBeTruthy();
    expect(screen.queryByText("从未成功")).toBeNull();
    expect(screen.getByText("最近尝试").nextSibling?.textContent).toBe("—");
    expect(screen.getByText("暂无同步记录。")).toBeTruthy();
  });

  it("shows no warning for a recently successful enabled source", () => {
    render(
      <CanteenMenuSyncHealth
        evaluatedAt={NOW}
        sources={[
          {
            ...SOURCE,
            manualItemCount: 0,
            lastSuccessAt: new Date("2026-08-14T02:59:00Z"),
            lastErrorCode: null,
            recentRuns: [
              {
                ...SOURCE.recentRuns[0],
                status: "unchanged",
                completedAt: new Date("2026-08-14T03:00:02Z"),
              },
            ],
          },
        ]}
      />,
    );

    expect(screen.getByText("未发现风险")).toBeTruthy();
    expect(screen.queryByText("从未成功")).toBeNull();
    expect(screen.queryByText("最近尝试失败")).toBeNull();
  });

  it("does not claim no risk when a recent success is followed by an error", () => {
    render(
      <CanteenMenuSyncHealth
        evaluatedAt={NOW}
        sources={[
          {
            ...SOURCE,
            manualItemCount: 0,
            lastSuccessAt: new Date("2026-08-14T02:59:00Z"),
            recentRuns: [
              {
                ...SOURCE.recentRuns[0],
                status: "failed",
                errorCode: "UPSTREAM_HTTP_503",
                completedAt: new Date("2026-08-14T03:00:02Z"),
              },
            ],
          },
        ]}
      />,
    );

    expect(screen.getByText("最近同步存在错误")).toBeTruthy();
    expect(screen.queryByText("未发现风险")).toBeNull();
    expect(screen.queryByText("最近尝试失败")).toBeNull();
  });

  it("shows stale, failed, and overdue facts independently", () => {
    render(
      <CanteenMenuSyncHealth
        evaluatedAt={NOW}
        sources={[
          {
            ...SOURCE,
            manualItemCount: 0,
            lastSuccessAt: new Date("2026-08-10T03:00:00Z"),
            hasOverdueRun: true,
            recentRuns: [
              {
                ...SOURCE.recentRuns[0],
                status: "failed",
                errorCode: "UPSTREAM_HTTP_503",
                completedAt: new Date("2026-08-14T03:00:02Z"),
              },
            ],
          },
        ]}
      />,
    );

    expect(screen.getByText("超过 48 小时未成功")).toBeTruthy();
    expect(screen.getByText("失败")).toBeTruthy();
    expect(screen.queryByText("最近尝试失败")).toBeNull();
    expect(screen.getByText("任务运行超过 5 分钟")).toBeTruthy();
    expect(screen.queryByText("从未成功")).toBeNull();
  });

  it("keeps disabled sources factual without rollout warnings", () => {
    render(
      <CanteenMenuSyncHealth
        evaluatedAt={NOW}
        sources={[
          {
            ...SOURCE,
            enabled: false,
            hasOverdueRun: true,
          },
        ]}
      />,
    );

    expect(screen.getByText("已停用")).toBeTruthy();
    expect(screen.getByText("不参与同步")).toBeTruthy();
    expect(screen.queryByText("从未成功")).toBeNull();
    expect(screen.queryByText("任务运行超过 5 分钟")).toBeNull();
  });

  it("explains when no menu sources exist", () => {
    render(<CanteenMenuSyncHealth sources={[]} evaluatedAt={NOW} />);
    expect(screen.getByText("尚未配置菜单来源。")).toBeTruthy();
  });
});
