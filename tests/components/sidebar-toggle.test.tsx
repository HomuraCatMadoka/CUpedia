/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { SidebarProvider } from "@/components/layout/sidebar-provider";
import { SidebarToggle } from "@/components/layout/sidebar-toggle";
import { SidebarMobileToggle } from "@/components/layout/sidebar-mobile-toggle";
import { SIDEBAR_PREFERENCE_STORAGE_KEY } from "@/lib/sidebar-preference";

vi.mock("next/navigation", () => ({
  usePathname: () => "/wiki",
  useRouter: () => ({ push: vi.fn() }),
}));

function ssr(canEdit = false) {
  return renderToString(
    <SidebarProvider>
      <SidebarToggle canEdit={canEdit} />
    </SidebarProvider>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  window.matchMedia = vi.fn().mockReturnValue({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("SidebarToggle desktop rail", () => {
  it("hides the rail while the desktop page tree is expanded", () => {
    const html = ssr();
    expect(html).toContain("展开导航");
    expect(html).toContain("hidden");
    expect(html).toContain("md:hidden");
  });

  it("restores the collapsed rail from local storage", async () => {
    window.localStorage.setItem(SIDEBAR_PREFERENCE_STORAGE_KEY, "collapsed");
    render(
      <SidebarProvider>
        <SidebarToggle />
      </SidebarProvider>,
    );

    const rail = screen.getByRole("button", { name: "展开导航" }).parentElement;
    await waitFor(() => {
      expect(rail?.className).toContain("md:flex");
      expect(rail?.className).not.toContain("md:hidden");
    });
  });
});

describe("SidebarToggle mobile ownership (#316)", () => {
  it("does not claim client readiness in the server-rendered toggle", () => {
    const html = renderToString(
      <SidebarProvider>
        <SidebarMobileToggle />
      </SidebarProvider>,
    );
    expect(html).toContain('data-client-ready="false"');
  });

  it("marks the toggle ready after its click handler hydrates", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );
    render(
      <SidebarProvider>
        <SidebarMobileToggle />
      </SidebarProvider>,
    );
    expect(
      screen
        .getByRole("button", { name: "打开导航" })
        .getAttribute("data-client-ready"),
    ).toBe("true");
  });

  it("keeps the entire rail hidden below the desktop breakpoint", () => {
    const html = ssr(true);
    const rail = html.match(/<div[^>]*>\s*<button/)?.[0] ?? "";
    expect(rail).toContain("hidden");
    expect(rail).toContain("data-wiki-sidebar-collapsed-rail");
  });

  it("keeps the desktop new-page entry without adding a second mobile rail affordance", () => {
    const html = ssr(true);
    expect(html).toContain("新建页面");
    const button =
      html.match(/<button[^>]*aria-label="新建页面"[^>]*>/)?.[0] ?? "";
    expect(button).not.toContain("max-md:hidden");
  });

  it("omits the new-page button entirely when the user cannot edit", () => {
    expect(ssr(false)).not.toContain("新建页面");
  });
});
