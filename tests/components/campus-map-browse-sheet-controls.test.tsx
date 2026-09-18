/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CampusMapBrowseSheetControls } from "@/components/campus-map/browse-sheet-controls";
import type { CampusMapBrowseSheetSnap } from "@/lib/campus-map/scene-kernel";

const captureDescriptor = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  "setPointerCapture",
);
let naturalHeight = 600;

beforeEach(() => {
  naturalHeight = 600;
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal(
    "PointerEvent",
    class extends MouseEvent {
      readonly pointerId = 1;
      readonly isPrimary = true;
    },
  );
  Object.defineProperty(HTMLElement.prototype, "setPointerCapture", {
    configurable: true,
    value: vi.fn(),
  });
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    function (this: HTMLElement) {
      const height =
        this.dataset.panel !== undefined
          ? Number.parseFloat(
              this.style.getPropertyValue("--campus-map-drag-height"),
            ) || 360
          : this.dataset.natural !== undefined
            ? naturalHeight
            : this.dataset.header !== undefined
              ? 160
              : 44;
      return {
        x: 0,
        y: 0,
        width: 390,
        height,
        top: 0,
        left: 0,
        right: 390,
        bottom: height,
        toJSON() {},
      };
    },
  );
  Object.defineProperty(window, "innerHeight", {
    configurable: true,
    value: 800,
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  if (captureDescriptor)
    Object.defineProperty(
      HTMLElement.prototype,
      "setPointerCapture",
      captureDescriptor,
    );
  else delete (HTMLElement.prototype as Partial<HTMLElement>).setPointerCapture;
});

function sheet() {
  const onSnap = vi.fn();
  function Sheet() {
    const [snap, setSnap] = useState<CampusMapBrowseSheetSnap>("peek");
    return (
      <main>
        <section data-campus-map-panel data-panel>
          <article>
            <div>
              <CampusMapBrowseSheetControls
                snap={snap}
                onSnap={(next) => {
                  onSnap(next);
                  setSnap(next);
                }}
              >
                <header data-header>地点名称与固定操作</header>
                <div id="campus-map-card-details" data-campus-map-card-scroll>
                  <div data-natural>详细信息</div>
                </div>
              </CampusMapBrowseSheetControls>
            </div>
          </article>
        </section>
      </main>
    );
  }
  const view = render(<Sheet />);
  return {
    onSnap,
    panel: view.container.querySelector<HTMLElement>("[data-panel]")!,
  };
}

describe("Campus Map browse sheet controls (#908)", () => {
  it("fits a short card without adding controls that make it overflow", () => {
    naturalHeight = 190;
    sheet();
    expect(screen.queryByRole("button", { name: "展开详情" })).toBeNull();
  });

  it("offers every snap without requiring a drag gesture", () => {
    const { onSnap } = sheet();
    fireEvent.click(screen.getByRole("button", { name: "展开详情" }));
    fireEvent.click(screen.getByRole("button", { name: "收起" }));
    fireEvent.click(screen.getByRole("button", { name: "完全展开" }));
    fireEvent.click(screen.getByRole("button", { name: "收起" }));
    fireEvent.click(screen.getByRole("button", { name: "收起" }));
    expect(onSnap.mock.calls.map(([snap]) => snap)).toEqual([
      "full",
      "half",
      "full",
      "half",
      "peek",
    ]);
  });

  it("opens the actual facility list from the explicit details action", () => {
    const { onSnap } = sheet();
    fireEvent.click(screen.getByRole("button", { name: "展开详情" }));
    expect(onSnap).toHaveBeenCalledExactlyOnceWith("full");
  });

  it("keeps focus in the card when an activated expand or collapse control disappears", () => {
    sheet();
    const expand = screen.getByRole("button", { name: "展开详情" });
    expand.focus();
    fireEvent.click(expand);
    const handle = screen.getByRole("button", { name: "拖动或点击展开卡片" });
    expect(document.activeElement).toBe(handle);
    fireEvent.click(screen.getByRole("button", { name: "收起" }));
    const collapse = screen.getByRole("button", { name: "收起" });
    collapse.focus();
    fireEvent.click(collapse);
    expect(document.activeElement).toBe(handle);
  });

  it("commits one drag snap and ignores its generated click", () => {
    const { onSnap, panel } = sheet();
    const handle = screen.getByRole("button", { name: "拖动或点击展开卡片" });
    fireEvent.pointerDown(handle, { clientY: 600, button: 0 });
    fireEvent.pointerMove(handle, { clientY: 320 });
    expect(panel.style.getPropertyValue("--campus-map-drag-height")).toBe(
      "640px",
    );
    fireEvent.pointerUp(handle, { clientY: 320 });
    fireEvent.click(handle, { detail: 1 });
    expect(onSnap).toHaveBeenCalledExactlyOnceWith("full");
    expect(panel.style.getPropertyValue("--campus-map-drag-height")).toBe("");
  });

  it("cancels a drag without changing scene state and keeps keyboard activation available", () => {
    const { onSnap, panel } = sheet();
    const handle = screen.getByRole("button", { name: "拖动或点击展开卡片" });
    fireEvent.pointerDown(handle, { clientY: 600, button: 0 });
    fireEvent.pointerMove(handle, { clientY: 320 });
    fireEvent.pointerCancel(handle);
    expect(onSnap).not.toHaveBeenCalled();
    expect(panel.style.getPropertyValue("--campus-map-drag-height")).toBe("");
    fireEvent.click(handle, { detail: 0 });
    expect(onSnap).toHaveBeenCalledExactlyOnceWith("half");
  });
});
