import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const returning = vi.fn();
  const values = vi.fn(() => ({ returning }));
  const insert = vi.fn(() => ({ values }));
  return {
    insert,
    values,
    returning,
    requireAdmin: vi.fn(),
    revalidatePath: vi.fn(),
  };
});

vi.mock("@/db", () => ({ db: { insert: mocks.insert } }));
vi.mock("@/lib/auth-guard", () => ({
  requireAdmin: (...args: unknown[]) => mocks.requireAdmin(...args),
}));
vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => mocks.revalidatePath(...args),
}));

import { publishProductUpdate } from "@/lib/product-update-actions";
import type { ProductUpdateInput } from "@/lib/product-update-types";

const updateId = "00000000-0000-4000-a100-000000000001";
const input: ProductUpdateInput = {
  title: "课程测评新增教授查找",
  summary: "从课程页面快速查看相关教授与学生评价。",
  content: "这次更新让教授资料与课程评价更容易互相查找。",
  type: "feature",
  areas: ["courses"],
};

describe("publishProductUpdate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdmin.mockResolvedValue({ id: "admin-1", role: "admin" });
    mocks.returning.mockResolvedValue([{ id: updateId }]);
  });

  it("authenticates before publishing and revalidates public routes", async () => {
    await expect(publishProductUpdate(input)).resolves.toEqual({
      id: updateId,
    });

    expect(mocks.requireAdmin).toHaveBeenCalledOnce();
    expect(mocks.values).toHaveBeenCalledWith(
      expect.objectContaining({
        title: input.title,
        type: "feature",
        areas: ["courses"],
        createdBy: "admin-1",
        publishedAt: expect.any(Date),
      }),
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/updates");
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/updates/${updateId}`);
  });

  it("does not write invalid input", async () => {
    await expect(publishProductUpdate({ ...input, areas: [] })).rejects.toThrow(
      "请至少选择一个产品领域",
    );
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("does not validate or write when admin authorization fails", async () => {
    mocks.requireAdmin.mockRejectedValue(new Error("Admin access required"));

    await expect(publishProductUpdate(input)).rejects.toThrow(
      "Admin access required",
    );
    expect(mocks.insert).not.toHaveBeenCalled();
  });
});
