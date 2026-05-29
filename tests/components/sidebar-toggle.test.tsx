/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import { SidebarProvider } from "@/components/layout/sidebar-provider";
import { SidebarToggle } from "@/components/layout/sidebar-toggle";

function ssr(initialCollapsed: boolean) {
  return renderToString(
    <SidebarProvider initialCollapsed={initialCollapsed}>
      <SidebarToggle />
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
