import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { WikiChildPages } from "@/components/wiki/wiki-child-pages";

describe("WikiChildPages", () => {
  it("renders custom icons and a document fallback", () => {
    const html = renderToString(
      <WikiChildPages
        pages={[
          { id: "with-icon", title: "有图标", icon: "📚" },
          { id: "without-icon", title: "无图标", icon: null },
        ]}
      />,
    );

    expect(html).toContain("📚");
    expect(html).toContain('href="/wiki/with-icon"');
    expect(html).toContain('href="/wiki/without-icon"');
    expect(html.match(/data-testid="wiki-child-page-icon"/g)).toHaveLength(2);
    expect(html).toContain("<svg");
  });
});
