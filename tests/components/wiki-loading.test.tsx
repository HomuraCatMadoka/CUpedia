/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import Loading from "@/app/(main)/wiki/[...slug]/loading";

describe("wiki read-page loading skeleton (#137, ADR 0010)", () => {
  const html = renderToString(<Loading />);

  it("announces the loading state to assistive tech", () => {
    expect(html).toContain('role="status"');
    expect(html).toContain("加载中");
  });

  it("skeletons only the content column — the sidebar is persistent in wiki/layout, above this Suspense boundary", () => {
    // The tree lives in wiki/layout.tsx now, outside this segment's Suspense, so
    // the fallback must not re-reserve a sidebar-width column — that would double
    // up beside the still-rendered rail/nav and shift the content on resolve.
    expect(html).not.toContain("--sidebar-width");
    expect(html).toContain("flex-1");
  });

  it("shows placeholder content bars (animated skeleton)", () => {
    expect(html).toContain("animate-pulse");
  });
});
