/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import { WikiRenderer } from "@/components/wiki/wiki-renderer";
import { WikiStaticContent } from "@/components/wiki/wiki-static-content";
import type { PlateValue } from "@/lib/plate-utils";

const commented: PlateValue = [
  {
    type: "p",
    children: [
      { text: "Hello " },
      { text: "world", comment: true, comment_c1: true },
    ],
  },
] as PlateValue;

describe("WikiRenderer static read path", () => {
  it("renders body text via Plate static (no editable contenteditable)", () => {
    const html = renderToString(
      <WikiRenderer pageId="p1">
        <WikiStaticContent value={commented} />
      </WikiRenderer>,
    );
    expect(html).toContain("Hello");
    expect(html).toContain("world");
    // Static render must not emit the editable surface.
    expect(html).not.toContain("contenteditable");
    expect(html).not.toContain('role="textbox"');
  });

  it("draws the inline comment highlight", () => {
    const html = renderToString(
      <WikiRenderer pageId="p1">
        <WikiStaticContent value={commented} />
      </WikiRenderer>,
    );
    expect(html).toContain("border-yellow-400");
  });
});
