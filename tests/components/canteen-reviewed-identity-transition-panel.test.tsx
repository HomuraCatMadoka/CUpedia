/**
 * @vitest-environment jsdom
 */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ execute: vi.fn() }));

vi.mock("@/lib/canteen-reviewed-identity-transition-actions", () => ({
  executeReviewedIdentityTransitionAction: (...args: unknown[]) =>
    mocks.execute(...args),
}));

import { CanteenReviewedIdentityTransitionPanel } from "@/components/admin/canteen-reviewed-identity-transition-panel";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const OPTIONS = [
  {
    key: "aigens-102830" as const,
    provider: "aigens" as const,
    externalStoreId: "102830",
    existingCount: 81,
    incomingCount: 154,
    canonicalizationCount: 53,
    mergeCount: 0,
    additionCount: 87,
    removalCount: 2,
  },
];

describe("CanteenReviewedIdentityTransitionPanel", () => {
  it("requires an exact source confirmation before execution", async () => {
    mocks.execute.mockResolvedValue({
      ok: true,
      execution: {
        sourceId: "source-1",
        transition: {
          status: "applied",
          itemCount: 154,
          createdCount: 87,
          updatedCount: 53,
          deactivatedCount: 2,
        },
        retry: {
          status: "unchanged",
          code: "MENU_SYNC_UNCHANGED",
          itemCount: 154,
        },
      },
    });
    render(<CanteenReviewedIdentityTransitionPanel options={OPTIONS} />);

    const button = screen.getByRole("button", { name: "应用并普通重试" });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("输入来源编号 102830 确认"), {
      target: { value: "102830" },
    });
    expect((button as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(button);

    await waitFor(() =>
      expect(mocks.execute).toHaveBeenCalledWith({
        key: "aigens-102830",
        confirmation: "102830",
      }),
    );
    expect((await screen.findByText(/转换已应用/)).textContent).toContain(
      "普通重试：unchanged（MENU_SYNC_UNCHANGED）",
    );
  });

  it("renders bounded stale diagnostics without provider details", async () => {
    mocks.execute.mockResolvedValue({
      ok: false,
      code: "MENU_IDENTITY_TRANSITION_STALE",
      diagnostic: {
        existingMatches: true,
        incomingMatches: false,
        currentSummary: {
          existingCount: 81,
          incomingCount: 67,
          missingIdentityCount: 53,
          newIdentityCount: 39,
          replacementCandidateCount: 0,
          canonicalizationCandidateCount: 53,
          mergeCandidateCount: 0,
          additionCount: 39,
          removalCount: 0,
          ambiguityCount: 0,
        },
        currentScope: {
          categoryCount: 13,
          groupCount: 24,
          categoryPeriodCodes: ["B"],
        },
      },
    });
    render(<CanteenReviewedIdentityTransitionPanel options={OPTIONS} />);

    fireEvent.change(screen.getByLabelText("输入来源编号 102830 确认"), {
      target: { value: "102830" },
    });
    fireEvent.click(screen.getByRole("button", { name: "应用并普通重试" }));

    const result = await screen.findByText(/MENU_IDENTITY_TRANSITION_STALE/);
    expect(result.textContent).toContain("现有投影 匹配");
    expect(result.textContent).toContain("供应商快照 不匹配");
    expect(result.textContent).toContain("当前现有 81 / 传入 67");
    expect(result.textContent).toContain("目录 13 类 / 24 组 / 时段 B");
    expect(result.textContent).not.toContain("private-menu.example");
  });
});
