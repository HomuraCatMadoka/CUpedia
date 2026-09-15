/** @vitest-environment jsdom */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CampusMapCardActions } from "@/components/campus-map/card-actions";

const href =
  "/campus-map?v=1&scene=place&id=335c7b15-efb0-448c-ab2d-5b8a95617327&snap=peek";
function card(locateLabel: string | null = "定位所属建筑") {
  const onLocate = vi.fn();
  render(
    <CampusMapCardActions
      name="YIA 201"
      href={href}
      locateLabel={locateLabel}
      onLocate={onLocate}
    />,
  );
  return onLocate;
}
function sharingApis(
  share: unknown,
  writeText = vi.fn().mockResolvedValue(undefined),
) {
  Object.defineProperty(navigator, "share", {
    configurable: true,
    value: share,
  });
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
  return writeText;
}
afterEach(() => {
  cleanup();
  sharingApis(undefined);
});
describe("Campus Map card actions (#908)", () => {
  it("uses native sharing with the canonical target rather than incidental URL fields", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const copy = sharingApis(share);
    window.history.replaceState(null, "", "/campus-map?temporary=search");
    card();
    fireEvent.click(screen.getByRole("button", { name: "分享" }));
    await screen.findByText("分享完成");
    expect(share).toHaveBeenCalledWith({
      title: "YIA 201",
      url: new URL(href, window.location.origin).href,
    });
    expect(copy).not.toHaveBeenCalled();
  });
  it("copies the stable link when native sharing is unavailable", async () => {
    const copy = sharingApis(undefined);
    card();
    fireEvent.click(screen.getByRole("button", { name: "分享" }));
    await screen.findByText("链接已复制");
    expect(copy).toHaveBeenCalledWith(
      new URL(href, window.location.origin).href,
    );
  });
  it("reports a failed copy and offers the same readable link", async () => {
    sharingApis(undefined, vi.fn().mockRejectedValue(new Error("denied")));
    card();
    fireEvent.click(screen.getByRole("button", { name: "分享" }));
    await screen.findByText("分享失败，可打开稳定链接后复制地址");
    expect(
      screen.getByRole("link", { name: "稳定链接" }).getAttribute("href"),
    ).toBe(href);
    await waitFor(() =>
      expect(
        (screen.getByRole("button", { name: "分享" }) as HTMLButtonElement)
          .disabled,
      ).toBe(false),
    );
  });
  it("acknowledges cancelled native sharing without trying to copy", async () => {
    const copy = sharingApis(
      vi.fn().mockRejectedValue(new DOMException("cancelled", "AbortError")),
    );
    card();
    fireEvent.click(screen.getByRole("button", { name: "分享" }));
    await screen.findByText("已取消分享");
    expect(copy).not.toHaveBeenCalled();
  });
  it("locates through its scene callback and omits an unknown position action", () => {
    const locate = card();
    fireEvent.click(screen.getByRole("button", { name: "定位所属建筑" }));
    expect(locate).toHaveBeenCalledOnce();
    cleanup();
    card(null);
    expect(screen.queryByRole("button", { name: /定位/u })).toBeNull();
  });
});
