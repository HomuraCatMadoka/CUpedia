/**
 * @vitest-environment jsdom
 */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => children,
  DialogContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogTitle: ({ children }: { children: React.ReactNode }) => (
    <h2>{children}</h2>
  ),
}));

import { CommandSearchDialog } from "@/components/layout/command-search-dialog";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("CommandSearchDialog", () => {
  it("labels the Wiki scope and moves through initial, loading, empty, and result states", async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ results: [] }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [{ id: "page-1", title: "Dining on Campus" }],
        }),
      });
    const onOpenChange = vi.fn();
    render(<CommandSearchDialog open onOpenChange={onOpenChange} />);

    const input = screen.getByRole("combobox", { name: "搜索百科页面" });
    expect(screen.getByText("输入至少 2 个字符，搜索百科页面")).toBeTruthy();

    fireEvent.change(input, { target: { value: "xx" } });
    expect(screen.getByText("搜索中...")).toBeTruthy();
    expect(await screen.findByText("未找到结果")).toBeTruthy();

    fireEvent.change(input, { target: { value: "Dining" } });
    const result = await screen.findByRole("option", {
      name: "Dining on Campus",
    });
    fireEvent.click(result);

    expect(push).toHaveBeenCalledWith("/wiki/page-1");
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("distinguishes request failures and supports retry", async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: false, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ results: [] }) });
    render(<CommandSearchDialog open onOpenChange={vi.fn()} />);

    fireEvent.change(screen.getByRole("combobox", { name: "搜索百科页面" }), {
      target: { value: "Dining" },
    });

    expect((await screen.findByRole("alert")).textContent).toContain(
      "搜索失败，请重试",
    );
    fireEvent.click(screen.getByRole("button", { name: "重试" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("未找到结果")).toBeTruthy();
  });
});
