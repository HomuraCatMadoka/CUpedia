/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import Loading from "@/app/(main)/wiki/[...slug]/loading";

describe("wiki read-page loading skeleton (#137)", () => {
  const html = renderToString(<Loading />);

  it("announces the loading state to assistive tech", () => {
    expect(html).toContain('role="status"');
    expect(html).toContain("加载中");
  });

  it("reserves the sidebar column so the content does not shift when it resolves", () => {
    expect(html).toContain("--sidebar-width");
  });

  it("shows placeholder content bars (animated skeleton)", () => {
    expect(html).toContain("animate-pulse");
  });
});
