/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { SidebarProvider } from "@/components/layout/sidebar-provider";
import { WikiSidebar } from "@/components/layout/wiki-sidebar";

vi.mock("next/navigation", () => ({
  usePathname: () => "/wiki/guide",
}));

const PAGES = [
  { id: "1", slug: "guide", title: "校园指南", parentId: null },
  { id: "2", slug: "guide/canteen", title: "食堂攻略", parentId: "1" },
];

function ssr(props: Parameters<typeof WikiSidebar>[0]) {
  return renderToString(
    <SidebarProvider initialCollapsed={false}>
      <WikiSidebar {...props} />
    </SidebarProvider>,
  );
}

describe("WikiSidebar tree/TOC branches (#136)", () => {
  it("renders the TOC without a pages prop — read pages omit the tree from the payload", () => {
    const html = ssr({
      currentPage: { title: "食堂攻略", slug: "guide/canteen" },
      headings: [{ id: "h1", text: "营业时间", level: 2 }],
    });
    expect(html).toContain("On this page");
    expect(html).toContain("营业时间");
    expect(html).not.toContain("校园指南");
  });

  it("renders the tree when pages are provided and there are no headings", () => {
    const html = ssr({
      pages: PAGES,
      currentPage: { title: "食堂攻略", slug: "guide/canteen" },
      headings: [],
    });
    expect(html).toContain("校园指南");
    expect(html).toContain("食堂攻略");
    expect(html).not.toContain("On this page");
  });

  it("renders the plain tree for index-style pages (no currentPage)", () => {
    const html = ssr({ pages: PAGES });
    expect(html).toContain("校园指南");
  });
});
