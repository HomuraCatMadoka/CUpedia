/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  publishProductUpdate: vi.fn(),
  push: vi.fn(),
}));

vi.mock("@/lib/product-update-actions", () => ({
  publishProductUpdate: mocks.publishProductUpdate,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));

import { ProductUpdatePublishForm } from "@/components/admin/product-update-publish-form";

describe("ProductUpdatePublishForm", () => {
  it("shows the immediate publication contract and controlled choices", () => {
    render(<ProductUpdatePublishForm />);

    expect(screen.getByText("确认后立即发布")).toBeTruthy();
    expect(screen.getByText("不会发送站内通知")).toBeTruthy();
    expect(screen.getByLabelText("新功能")).toBeTruthy();
    expect(screen.getByLabelText("课程")).toBeTruthy();
  });

  it("surfaces server validation errors inline", async () => {
    mocks.publishProductUpdate.mockResolvedValue({
      ok: false,
      error: "请至少选择一个产品领域",
    });
    render(<ProductUpdatePublishForm />);

    fireEvent.change(screen.getByLabelText("标题"), {
      target: { value: "课程测评新增教授查找" },
    });
    fireEvent.change(screen.getByLabelText("摘要"), {
      target: { value: "从课程页面快速查看相关教授与学生评价。" },
    });
    fireEvent.change(screen.getByLabelText("正文"), {
      target: { value: "更新正文" },
    });
    fireEvent.click(screen.getByRole("button", { name: "确认并发布" }));

    expect((await screen.findByRole("alert")).textContent).toBe(
      "请至少选择一个产品领域",
    );
  });
});
