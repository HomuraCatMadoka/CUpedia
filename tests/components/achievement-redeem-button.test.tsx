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

    fireEvent.click(screen.getByRole("button", { name: "点亮称号" }));
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    expect(screen.getByText("确认点亮「数学铜标」？")).toBeTruthy();
    expect(screen.queryByText(/MATH1010/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "确认点亮" }));
    await waitFor(() => expect(mockRedeem).toHaveBeenCalledWith("rule-1"));
    expect(mockRefresh).toHaveBeenCalled();
  });
});
