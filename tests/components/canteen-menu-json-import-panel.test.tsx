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
import { CanteenMenuJsonImportPanel } from "@/components/admin/canteen-menu-json-import-panel";

const { mockPreview, mockApply, mockRefresh } = vi.hoisted(() => ({
  mockPreview: vi.fn(),
  mockApply: vi.fn(),
  mockRefresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

vi.mock("@/lib/canteen-admin-actions", () => ({
  previewMenuSyncFromJson: (...args: unknown[]) => mockPreview(...args),
  applyMenuSyncFromJson: (...args: unknown[]) => mockApply(...args),
}));

const JSON_INPUT = JSON.stringify({
  source: "order-place:102830",
  items: [{ externalKey: "42:lunch", name: "凍奶茶" }],
});

beforeEach(() => {
  mockPreview.mockReset();
  mockApply.mockReset();
  mockRefresh.mockReset();
});

afterEach(cleanup);

describe("CanteenMenuJsonImportPanel", () => {
  it("previews a snapshot before applying the same JSON", async () => {
    const plan = {
      source: "order-place:102830",
      actions: [
        {
          action: "create",
          itemId: null,
          externalKey: "42:lunch",
          name: "凍奶茶",
          changedFields: ["all"],
        },
      ],
      conflicts: [],
      unchanged: 0,
    };
    mockPreview.mockResolvedValue(plan);
    mockApply.mockResolvedValue(plan);
    render(<CanteenMenuJsonImportPanel canteenId="canteen-1" />);

    const applyButton = screen.getByRole("button", { name: "应用同步" });
    expect((applyButton as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: JSON_INPUT },
    });
    fireEvent.click(screen.getByRole("button", { name: "预览同步" }));

    await waitFor(() =>
      expect(mockPreview).toHaveBeenCalledWith("canteen-1", JSON_INPUT),
    );
    expect(screen.getByText(/新增 1/)).toBeTruthy();
    await waitFor(() =>
      expect((applyButton as HTMLButtonElement).disabled).toBe(false),
    );

    fireEvent.click(applyButton);
    await waitFor(() =>
      expect(mockApply).toHaveBeenCalledWith("canteen-1", JSON_INPUT),
    );
    expect(mockRefresh).toHaveBeenCalled();
  });

  it("keeps apply disabled when preview reports a conflict", async () => {
    mockPreview.mockResolvedValue({
      source: "order-place:102830",
      actions: [],
      conflicts: [
        {
          externalKey: "42:lunch",
          name: "凍奶茶",
          reason: "AMBIGUOUS_LEGACY_MATCH",
          candidateIds: ["a", "b"],
        },
      ],
      unchanged: 0,
    });
    render(<CanteenMenuJsonImportPanel canteenId="canteen-1" />);
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: JSON_INPUT },
    });
    fireEvent.click(screen.getByRole("button", { name: "预览同步" }));

    expect(await screen.findByText(/旧菜匹配不唯一/)).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "应用同步" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });
});
