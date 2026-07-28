/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";

import { EditConflictDialog } from "@/components/wiki/edit-conflict-dialog";

describe("EditConflictDialog", () => {
  it("shows structural fields alongside the body diff", () => {
    const html = renderToString(
      <EditConflictDialog
        fields={[
          {
            label: "URL 路径",
            mine: "mine",
            theirs: "theirs",
          },
        ]}
        mineText="my body"
        theirText="their body"
        saving={false}
        onCopy={vi.fn()}
        onDiscard={vi.fn()}
        onReturn={vi.fn()}
      />,
    );

    expect(html).toContain("页面属性冲突");
    expect(html).toContain("URL 路径");
    expect(html).toContain("theirs");
    expect(html).toContain("mine");
    expect(html).toContain("复制我的内容");
    expect(html).not.toContain("保留我的版本");
  });
});
