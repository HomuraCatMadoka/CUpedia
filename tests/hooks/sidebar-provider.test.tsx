/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import { fireEvent, render, screen } from "@testing-library/react";
import {
  SidebarProvider,
  useSidebar,
} from "@/components/layout/sidebar-provider";

function StateProbe() {
  const { state, activeSurface, openMobile, openSurface, closeSurface } =
    useSidebar();
  return (
    <>
      <span data-testid="state">{state}</span>
      <span data-testid="surface">{activeSurface ?? "closed"}</span>
      <button onClick={openMobile}>Wiki</button>
      <button onClick={() => openSurface("search")}>Search</button>
      <button onClick={() => closeSurface("wiki-navigation")}>
        Close wiki
      </button>
    </>
  );
}

function ssr(initialCollapsed: boolean) {
  return renderToString(
    <SidebarProvider initialCollapsed={initialCollapsed}>
      <StateProbe />
    </SidebarProvider>,
  );
}

describe("SidebarProvider initial render", () => {
  it("renders expanded on server when not collapsed", () => {
    expect(ssr(false)).toContain(">expanded<");
  });

  it("renders collapsed on server when initialCollapsed is true", () => {
    expect(ssr(true)).toContain(">collapsed<");
  });

  it("does not read window during initial render", () => {
    // matchMedia is undefined in jsdom by default; render must not throw.
    expect(() => ssr(true)).not.toThrow();
  });

  it("coordinates the Wiki Drawer with every Header surface", () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: () => ({
        matches: true,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }),
    });
    render(
      <SidebarProvider initialCollapsed={false}>
        <StateProbe />
      </SidebarProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Wiki" }));
    expect(screen.getByTestId("surface").textContent).toBe("wiki-navigation");
    expect(screen.getByTestId("state").textContent).toBe("mobile-open");

    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(screen.getByTestId("surface").textContent).toBe("search");
    expect(screen.getByTestId("state").textContent).toBe("collapsed");

    fireEvent.click(screen.getByRole("button", { name: "Close wiki" }));
    expect(screen.getByTestId("surface").textContent).toBe("search");
  });

  it("preserves the desktop sidebar state while Header surfaces change", () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: () => ({
        matches: false,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }),
    });
    render(
      <SidebarProvider initialCollapsed={false}>
        <StateProbe />
      </SidebarProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(screen.getByTestId("surface").textContent).toBe("search");
    expect(screen.getByTestId("state").textContent).toBe("expanded");

    fireEvent.click(screen.getByRole("button", { name: "Close wiki" }));
    expect(screen.getByTestId("surface").textContent).toBe("search");
    expect(screen.getByTestId("state").textContent).toBe("expanded");
  });
});
