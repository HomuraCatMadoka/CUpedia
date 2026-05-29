/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import {
  SidebarProvider,
  useSidebar,
} from "@/components/layout/sidebar-provider";

function StateProbe() {
  const { state } = useSidebar();
  return <span data-testid="state">{state}</span>;
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
});
