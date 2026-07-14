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

describe("SidebarToggle desktop rail", () => {
  it("hides the rail while the desktop page tree is expanded", () => {
    const html = ssr(false);
    expect(html).toContain("展开导航");
    expect(html).toContain("hidden");
    expect(html).toContain("md:hidden");
  });

  it("renders the collapsed rail at the desktop breakpoint", () => {
    const html = ssr(true);
    expect(html).toContain("展开导航");
    expect(html).toContain("md:flex");
    expect(html).not.toContain("md:hidden");
  });
});

describe("SidebarToggle mobile ownership (#316)", () => {
  it("keeps the entire rail hidden below the desktop breakpoint", () => {
    const html = ssr(true, true);
    const rail = html.match(/<div[^>]*>\s*<button/)?.[0] ?? "";
    expect(rail).toContain("hidden");
    expect(rail).toContain("md:flex");
  });

  it("keeps the desktop new-page entry without adding a second mobile rail affordance", () => {
    const html = ssr(true, true);
    expect(html).toContain("新建页面");
    const anchor = html.match(/<a[^>]*aria-label="新建页面"[^>]*>/)?.[0] ?? "";
    expect(anchor).not.toContain("max-md:hidden");
  });

  it("omits the new-page button entirely when the user cannot edit", () => {
    expect(ssr(true, false)).not.toContain("新建页面");
  });
});
