import { describe, it, expect } from "vitest";
import { buildBreadcrumb } from "@/lib/breadcrumb";

type TreePage = {
  id: string;
  slug: string;
  title: string;
  parentId: string | null;
};

const pages: TreePage[] = [
  { id: "1", slug: "guide", title: "CU 全港觅食指南⭐⭐⭐", parentId: null },
  { id: "2", slug: "guide/late-night", title: "后半夜觅食", parentId: "1" },
  {
    id: "3",
    slug: "guide/late-night/tips",
    title: "小贴士",
    parentId: "2",
  },
  { id: "4", slug: "canteen", title: "校内觅食", parentId: null },
];

describe("buildBreadcrumb", () => {
  it("returns empty array for root page", () => {
    expect(buildBreadcrumb(pages, "guide")).toEqual([]);
  });

  it("returns parent chain for nested page", () => {
    expect(buildBreadcrumb(pages, "guide/late-night")).toEqual([
      { slug: "guide", title: "CU 全港觅食指南⭐⭐⭐" },
    ]);
  });

  it("returns full ancestor chain for deeply nested page", () => {
    expect(buildBreadcrumb(pages, "guide/late-night/tips")).toEqual([
      { slug: "guide", title: "CU 全港觅食指南⭐⭐⭐" },
      { slug: "guide/late-night", title: "后半夜觅食" },
    ]);
  });

  it("returns empty array for unknown slug", () => {
    expect(buildBreadcrumb(pages, "nonexistent")).toEqual([]);
  });
});
