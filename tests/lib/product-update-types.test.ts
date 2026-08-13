import { describe, expect, it } from "vitest";

import { parseProductUpdateInput } from "@/lib/product-update-types";

const input = {
  title: "课程测评新增教授查找",
  summary: "从课程页面快速查看相关教授与学生评价。",
  content: "这次更新让教授资料与课程评价更容易互相查找。",
  type: "feature" as const,
  areas: ["courses"] as const,
};

describe("product update input", () => {
  it("normalizes user-facing copy and removes duplicate areas", () => {
    expect(
      parseProductUpdateInput({
        ...input,
        title: `  ${input.title}  `,
        areas: ["courses", "courses"],
      }),
    ).toEqual({ ...input, areas: ["courses"] });
  });

  it("requires at least one controlled product area", () => {
    expect(() => parseProductUpdateInput({ ...input, areas: [] })).toThrow(
      "请至少选择一个产品领域",
    );
    expect(() =>
      parseProductUpdateInput({
        ...input,
        areas: ["unknown"],
      } as never),
    ).toThrow("请选择有效的产品领域");
  });

  it("rejects uncontrolled update types", () => {
    expect(() =>
      parseProductUpdateInput({ ...input, type: "release" } as never),
    ).toThrow("请选择有效的更新类型");
  });
});
