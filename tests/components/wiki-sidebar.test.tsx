/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { SidebarProvider } from "@/components/layout/sidebar-provider";
import { WikiSidebar } from "@/components/layout/wiki-sidebar";

vi.mock("next/navigation", () => ({
  usePathname: () => "/wiki/guide",
  useRouter: () => ({ prefetch: () => {} }),
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

describe("WikiSidebar is tree-only (ADR 0010)", () => {
  it("renders the full page hierarchy from the pages prop", () => {
    const html = ssr({ pages: PAGES });
    expect(html).toContain("校园指南");
    expect(html).toContain("食堂攻略");
  });

  it("labels the navigation column and never renders TOC chrome", () => {
    // The per-page table of contents now lives in its own column on the read
    // page — the tree/TOC swap is gone, so the sidebar carries no "On this page".
    const html = ssr({ pages: PAGES });
    expect(html).toContain("Pages");
    expect(html).not.toContain("On this page");
  });

  it("renders an empty tree without crashing", () => {
    const html = ssr({ pages: [] });
    expect(html).toContain("Pages");
  });
});
