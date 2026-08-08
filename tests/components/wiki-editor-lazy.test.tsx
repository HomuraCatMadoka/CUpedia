/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/dynamic", async () => {
  const React = await import("react");
  return {
    default: () =>
      function FakeWikiEditor(props: {
        userId?: string;
        pageId?: string;
        draftMode?: boolean;
      }) {
        const [mountedIdentity] = React.useState(
          `${props.userId}:${props.pageId}:${props.draftMode ? "draft" : "page"}`,
        );
        const [localEditCount, setLocalEditCount] = React.useState(0);
        return React.createElement(
          "div",
          null,
          React.createElement(
            "div",
            { "data-testid": "mounted-editor-identity" },
            mountedIdentity,
          ),
          React.createElement(
            "button",
            {
              onClick: () => setLocalEditCount((count) => count + 1),
              type: "button",
            },
            `Local edits: ${localEditCount}`,
          ),
        );
      },
  };
});

import { WikiEditorLazy } from "@/components/wiki/wiki-editor-lazy";

describe("WikiEditorLazy", () => {
  it("remounts the editor when the Page ID changes", () => {
    const onSubmit = vi.fn(async () => ({}));
    const { rerender } = render(
      <WikiEditorLazy
        mode="edit"
        userId="user-1"
        pageId="page-a"
        onSubmit={onSubmit}
      />,
    );

    rerender(
      <WikiEditorLazy
        mode="edit"
        userId="user-1"
        pageId="page-b"
        onSubmit={onSubmit}
      />,
    );

    expect(screen.getByTestId("mounted-editor-identity").textContent).toBe(
      "user-1:page-b:page",
    );
  });

  it("remounts the editor when the User changes", () => {
    const onSubmit = vi.fn(async () => ({}));
    const { rerender } = render(
      <WikiEditorLazy
        mode="edit"
        userId="user-1"
        pageId="page-a"
        onSubmit={onSubmit}
      />,
    );

    rerender(
      <WikiEditorLazy
        mode="edit"
        userId="user-2"
        pageId="page-a"
        onSubmit={onSubmit}
      />,
    );

    expect(screen.getByTestId("mounted-editor-identity").textContent).toBe(
      "user-2:page-a:page",
    );
  });

  it("remounts the editor when a Page changes between public and private", () => {
    const onSubmit = vi.fn(async () => ({}));
    const { rerender } = render(
      <WikiEditorLazy
        mode="edit"
        userId="user-1"
        pageId="page-a"
        onSubmit={onSubmit}
      />,
    );

    rerender(
      <WikiEditorLazy
        mode="edit"
        draftMode
        userId="user-1"
        pageId="page-a"
        onSubmit={onSubmit}
      />,
    );

    expect(screen.getByTestId("mounted-editor-identity").textContent).toBe(
      "user-1:page-a:draft",
    );
  });

  it("preserves local editor state when server props refresh for the same identity", () => {
    const firstSubmit = vi.fn(async () => ({}));
    const nextSubmit = vi.fn(async () => ({}));
    const { rerender } = render(
      <WikiEditorLazy
        mode="edit"
        userId="user-1"
        pageId="page-a"
        initialTitle="Server v4"
        expectedVersion={4}
        onSubmit={firstSubmit}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Local edits: 0" }));

    rerender(
      <WikiEditorLazy
        mode="edit"
        userId="user-1"
        pageId="page-a"
        initialTitle="Server v5"
        expectedVersion={5}
        onSubmit={nextSubmit}
      />,
    );

    expect(screen.getByRole("button", { name: "Local edits: 1" })).toBeTruthy();
  });
});
