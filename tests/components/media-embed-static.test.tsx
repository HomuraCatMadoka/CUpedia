/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import { KEYS } from "platejs";
import { WikiStaticContent } from "@/components/wiki/wiki-static-content";
import type { PlateValue } from "@/lib/plate-utils";

describe("WikiStaticContent media embed", () => {
  it("renders a YouTube embed as an iframe pointing at the embed URL", () => {
    const value = [
      {
        type: KEYS.mediaEmbed,
        url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        children: [{ text: "" }],
      },
    ] as PlateValue;

    const html = renderToString(<WikiStaticContent value={value} />);
    expect(html).toContain("<iframe");
    expect(html).toContain("youtube.com/embed/dQw4w9WgXcQ");
  });
});
