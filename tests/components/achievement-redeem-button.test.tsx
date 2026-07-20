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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockRedeem, mockRefresh } = vi.hoisted(() => ({
  mockRedeem: vi.fn(),
  mockRefresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));
vi.mock("@/lib/achievement-actions", () => ({
  redeemProfessionalAchievement: (...args: unknown[]) => mockRedeem(...args),
}));

import { AchievementRedeemButton } from "@/components/courses/achievement-redeem-button";

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("AchievementRedeemButton", () => {
  it("asks for confirmation without exposing evidence courses", async () => {
    mockRedeem.mockResolvedValue({ id: "achievement-1" });
    render(<AchievementRedeemButton displayName="数学铜标" ruleId="rule-1" />);

    fireEvent.click(screen.getByRole("button", { name: "领取成就" }));
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    expect(screen.getByText("确认领取「数学铜标」？")).toBeTruthy();
    expect(screen.queryByText(/MATH1010/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "确认领取" }));
    await waitFor(() => expect(mockRedeem).toHaveBeenCalledWith("rule-1"));
    expect(mockRefresh).toHaveBeenCalled();
  });

  it("explains that an upgrade replaces the lower tier", () => {
    render(
      <AchievementRedeemButton
        displayName="数学银标"
        ruleId="rule-2"
        upgrade
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "升级成就" }));
    expect(screen.getByText("确认升级「数学银标」？")).toBeTruthy();
    expect(screen.getByText(/低一级成就会从展示中消失/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "确认升级" })).toBeTruthy();
  });
});
