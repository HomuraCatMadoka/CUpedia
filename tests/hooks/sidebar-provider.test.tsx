/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { renderToString } from "react-dom/server";
import {
  SidebarProvider,
  useSidebar,
} from "@/components/layout/sidebar-provider";
import { SIDEBAR_PREFERENCE_STORAGE_KEY } from "@/lib/sidebar-preference";

function StateProbe() {
  const { state } = useSidebar();
  return <span data-testid="state">{state}</span>;
}

function ssr() {
  return renderToString(
    <SidebarProvider>
      <StateProbe />
    </SidebarProvider>,
  );
}

describe("SidebarProvider initial render", () => {
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

  it("uses a request-independent expanded server snapshot", () => {
    expect(ssr()).toContain(">expanded<");
  });

  it("does not read window during initial render", () => {
    // matchMedia is undefined in jsdom by default; render must not throw.
    expect(() => ssr()).not.toThrow();
  });

  it("restores the versioned desktop preference on the client", async () => {
    window.localStorage.setItem(SIDEBAR_PREFERENCE_STORAGE_KEY, "collapsed");

    render(
      <SidebarProvider>
        <StateProbe />
      </SidebarProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("state").textContent).toBe("collapsed");
    });
  });
});
