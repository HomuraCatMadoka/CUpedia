/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { SidebarProvider } from "@/components/layout/sidebar-provider";
import { WikiSidebar } from "@/components/layout/wiki-sidebar";

vi.mock("next/navigation", () => ({
  usePathname: () => "/wiki/1",
  useRouter: () => ({ prefetch: () => {} }),
}));

const PAGES = [
  {
    id: "1",
    title: "校园指南",
    icon: "🏫",
    parentId: null,
  },
  {
    id: "2",
    title: "食堂攻略",
    icon: null,
    parentId: "1",
  },
];

function ssr(props: Parameters<typeof WikiSidebar>[0]) {
  return renderToString(
    <SidebarProvider>
      <WikiSidebar {...props} />
    </SidebarProvider>,
  );
}

describe("WikiSidebar is tree-only (ADR 0010)", () => {
  it("collapses child pages by default", () => {
    const html = ssr({ pages: PAGES });
    expect(html).toContain("校园指南");
    expect(html).not.toContain("食堂攻略");
    expect(html).toContain("🏫");
    expect(html).toContain('href="/wiki/1"');
    expect(html).not.toContain('href="/wiki/guide"');
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
