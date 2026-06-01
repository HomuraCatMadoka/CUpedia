/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import { SidebarProvider } from "@/components/layout/sidebar-provider";
import { SidebarToggle } from "@/components/layout/sidebar-toggle";

function ssr(initialCollapsed: boolean, canEdit = false) {
  return renderToString(
    <SidebarProvider initialCollapsed={initialCollapsed}>
      <SidebarToggle canEdit={canEdit} />
    </SidebarProvider>,
  );
}

describe("SidebarToggle first paint (mobile flash guard)", () => {
  it("renders the collapsed rail (md:hidden) even when expanded, so mobile shows the rail without JS", () => {
    const html = ssr(false);
    expect(html).toContain("展开导航");
    expect(html).toContain("md:hidden");
  });

  it("renders the rail on all breakpoints when collapsed (no md:hidden)", () => {
    const html = ssr(true);
    expect(html).toContain("展开导航");
    expect(html).not.toContain("md:hidden");
  });
});

describe("SidebarToggle mobile redundancy (#98)", () => {
  it("keeps the expand toggle as the no-JS affordance", () => {
    expect(ssr(true, true)).toContain("展开导航");
  });

  it("hides the redundant new-page button on mobile (max-md:hidden) — it duplicates the drawer entry", () => {
    const html = ssr(true, true);
    expect(html).toContain("新建页面");
    // The new-page anchor's own element must carry the mobile-hidden guard.
    const anchor = html.match(/<a[^>]*aria-label="新建页面"[^>]*>/)?.[0] ?? "";
    expect(anchor).toContain("max-md:hidden");
  });

  it("omits the new-page button entirely when the user cannot edit", () => {
    expect(ssr(true, false)).not.toContain("新建页面");
  });
});
