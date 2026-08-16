/**
 * @vitest-environment jsdom
 */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/script", () => ({
  default: () => null,
}));

import { AmapCampusPrototype } from "@/components/campus-map/amap-campus-prototype";

beforeEach(() => {
  vi.restoreAllMocks();
  window.history.replaceState(null, "", "/prototype/campus-map");
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        configured: true,
        key: "test-key",
        securityCode: "test-code",
      }),
    }),
  );
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
});

afterEach(() => {
  cleanup();
  document
    .querySelectorAll("script[data-amap-campus]")
    .forEach((script) => script.remove());
  vi.unstubAllGlobals();
});

async function selectScienceCentre() {
  const search = screen.getByPlaceholderText("搜索建筑");
  fireEvent.change(search, { target: { value: "科学馆" } });
  fireEvent.submit(search.closest("form")!);
  const result = await screen.findByRole("button", { name: /科学馆/ });
  fireEvent.click(result);
  await screen.findByRole("heading", { name: "科学馆" });
}

describe("AmapCampusPrototype", () => {
  it("hydrates a canonical facility deep link through the scene driver", async () => {
    window.history.replaceState(
      null,
      "",
      "/prototype/campus-map?v=1&scene=facility&id=library-gf-water&snap=peek",
    );

    render(<AmapCampusPrototype initialSearch={window.location.search} />);

    const heading = await screen.findByRole("heading", { name: "饮水机" });
    expect(heading.parentElement?.textContent).toContain("大学图书馆 · G/F");
    expect(window.location.search).toBe(
      "?v=1&scene=facility&id=library-gf-water&snap=peek",
    );
    expect(window.history.state).toEqual({
      campusMapScene: true,
      version: 1,
      depth: 0,
    });
  });

  it("gives the AMap-owned container an explicit full-size parent", async () => {
    const { container } = render(<AmapCampusPrototype />);
    const canvas = container.querySelector("#amap-campus-canvas");

    expect(canvas?.classList.contains("h-full")).toBe(true);
    expect(canvas?.classList.contains("w-full")).toBe(true);
    expect(canvas?.parentElement?.classList.contains("absolute")).toBe(true);
    expect(canvas?.parentElement?.classList.contains("inset-0")).toBe(true);
    await waitFor(() => expect(fetch).toHaveBeenCalled());
  });

  it("inserts the AMap script after browser configuration loads", async () => {
    render(<AmapCampusPrototype />);

    await waitFor(() => {
      const script = document.querySelector<HTMLScriptElement>(
        "script[data-amap-campus]",
      );
      expect(script).not.toBeNull();
      expect(script?.src).toContain("https://webapi.amap.com/maps?v=2.0");
    });
  });

  it("shows a fail-closed state when AMap browser credentials are missing", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        configured: false,
        key: "",
        securityCode: "",
      }),
    } as Response);

    render(<AmapCampusPrototype />);

    expect(
      await screen.findByRole("heading", { name: "高德地图配置缺失" }),
    ).not.toBeNull();
    expect(document.querySelector("script[data-amap-campus]")).toBeNull();
  });

  it("retries from a fail-closed state when the AMap SDK script fails", async () => {
    render(<AmapCampusPrototype />);
    const script = await waitFor(() => {
      const value = document.querySelector<HTMLScriptElement>(
        "script[data-amap-campus]",
      );
      expect(value).not.toBeNull();
      return value!;
    });

    fireEvent.error(script);

    expect(
      await screen.findByRole("heading", { name: "高德地图加载失败" }),
    ).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "重新加载高德地图" }));

    await waitFor(() => {
      const replacement = document.querySelector<HTMLScriptElement>(
        "script[data-amap-campus]",
      );
      expect(replacement).not.toBeNull();
      expect(replacement).not.toBe(script);
    });
  });

  it("pushes semantic selections and replaces floor filter history", async () => {
    const push = vi.spyOn(window.history, "pushState");
    const replace = vi.spyOn(window.history, "replaceState");
    render(<AmapCampusPrototype initialSearch={window.location.search} />);

    await selectScienceCentre();
    expect(push).toHaveBeenCalledTimes(1);
    expect(window.location.search).toContain(
      "scene=building&id=science-centre",
    );

    const floor = screen.getByRole("button", { name: "LG/F" });
    floor.focus();
    fireEvent.click(floor);
    expect(push).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalled();
    expect(window.location.search).toContain("floor=LG");
    expect(document.activeElement).toBe(floor);

    fireEvent.click(screen.getByRole("button", { name: "洗手间公众可达" }));
    await screen.findByRole("heading", { name: "洗手间" });
    expect(push).toHaveBeenCalledTimes(2);
    expect(window.location.search).toContain(
      "scene=facility&id=science-lg-toilet",
    );
    expect(window.location.search).toContain("snap=peek");
  });

  it("uses browser history for facility back and hydrates the building", async () => {
    render(<AmapCampusPrototype initialSearch={window.location.search} />);
    await selectScienceCentre();
    fireEvent.click(screen.getByRole("button", { name: "洗手间公众可达" }));
    await screen.findByRole("heading", { name: "洗手间" });

    fireEvent.click(screen.getByRole("button", { name: "返回建筑" }));
    await screen.findByRole("heading", { name: "科学馆" });
    expect(window.location.search).not.toContain("scene=facility");

    await act(async () => {
      window.history.forward();
    });
    await screen.findByRole("heading", { name: "洗手间" });
    expect(window.location.search).toContain(
      "scene=facility&id=science-lg-toilet",
    );
  });

  it("canonicalizes a mismatched facility deep link to its real building", async () => {
    window.history.replaceState(
      null,
      "",
      "/prototype/campus-map?building=science-centre&facility=library-gf-water&panel=full",
    );
    render(<AmapCampusPrototype initialSearch={window.location.search} />);

    const heading = await screen.findByRole("heading", { name: "饮水机" });
    expect(heading.parentElement?.textContent).toContain("大学图书馆 · G/F");
    await waitFor(() => {
      expect(window.location.search).toBe(
        "?v=1&scene=facility&id=library-gf-water&snap=full",
      );
    });
  });

  it("returns a filtered facility deep link to its category in one action", async () => {
    const push = vi.spyOn(window.history, "pushState");
    render(
      <AmapCampusPrototype initialSearch="?category=toilet&building=wmy&facility=wmy-5f-toilet&floor=5&amenity=toilet&panel=peek" />,
    );
    await screen.findByRole("heading", { name: "洗手间" });
    const before = push.mock.calls.length;

    fireEvent.click(
      screen.getByRole("button", { name: "洗手间", pressed: false }),
    );

    expect(
      await screen.findByRole("heading", { name: "2 栋建筑有洗手间" }),
    ).not.toBeNull();
    expect(window.location.search).toContain("scene=category&id=toilet");
    expect(window.location.search).not.toContain("scene=facility");
    expect(push.mock.calls.length - before).toBe(1);

    await act(async () => {
      window.history.back();
    });
    expect(
      await screen.findByRole("heading", { name: "洗手间" }),
    ).not.toBeNull();

    await act(async () => {
      window.history.forward();
    });
    expect(
      await screen.findByRole("heading", { name: "2 栋建筑有洗手间" }),
    ).not.toBeNull();
  });

  it("replaces history when switching category filters", async () => {
    const push = vi.spyOn(window.history, "pushState");
    const replace = vi.spyOn(window.history, "replaceState");
    render(<AmapCampusPrototype initialSearch="?category=toilet&panel=peek" />);
    await screen.findByRole("heading", { name: "2 栋建筑有洗手间" });
    const pushesBefore = push.mock.calls.length;
    const replacesBefore = replace.mock.calls.length;

    fireEvent.click(screen.getByRole("button", { name: "饮水机" }));

    expect(
      await screen.findByRole("heading", { name: "2 栋建筑有饮水机" }),
    ).not.toBeNull();
    expect(push.mock.calls.length).toBe(pushesBefore);
    expect(replace.mock.calls.length - replacesBefore).toBe(1);
  });

  it("keeps a direct facility deep-link building fallback reversible", async () => {
    const push = vi.spyOn(window.history, "pushState");
    render(
      <AmapCampusPrototype initialSearch="?category=toilet&building=wmy&facility=wmy-5f-toilet&floor=5&amenity=toilet&panel=peek" />,
    );
    await screen.findByRole("heading", { name: "洗手间" });
    const before = push.mock.calls.length;

    fireEvent.click(screen.getByRole("button", { name: "返回建筑" }));

    expect(
      await screen.findByRole("heading", { name: "伍何曼原楼" }),
    ).not.toBeNull();
    expect(push.mock.calls.length - before).toBe(1);
  });

  it("labels building-level facility positions without claiming indoor precision", async () => {
    render(
      <AmapCampusPrototype initialSearch="?building=wmy&facility=wmy-5f-toilet&floor=5&panel=peek" />,
    );

    expect(
      await screen.findByText("建筑内位置 · 尚无室内精确坐标"),
    ).not.toBeNull();
    expect(screen.getByRole("button", { name: "定位所属建筑" })).not.toBeNull();
  });

  it("closes with Escape and restores focus to the search result trigger", async () => {
    render(<AmapCampusPrototype />);
    const search = screen.getByPlaceholderText("搜索建筑");
    fireEvent.change(search, { target: { value: "科学馆" } });
    fireEvent.submit(search.closest("form")!);
    const result = await screen.findByRole("button", { name: /科学馆/ });
    fireEvent.click(result);
    await screen.findByRole("heading", { name: "科学馆" });

    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() =>
      expect(screen.queryByRole("heading", { name: "科学馆" })).toBeNull(),
    );
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: /科学馆/ }),
    );
  });

  it("returns focus to the map when dismissing a non-search selection", async () => {
    render(
      <AmapCampusPrototype initialSearch="?v=1&scene=building&id=science-centre&snap=peek" />,
    );
    await screen.findByRole("heading", { name: "科学馆" });
    fireEvent.click(screen.getByRole("button", { name: "关闭地点详情" }));

    await waitFor(() => {
      expect(document.activeElement).toBe(
        document.querySelector("#amap-campus-canvas"),
      );
    });
  });

  it("writes one history entry per selection in Strict Mode", async () => {
    const push = vi.spyOn(window.history, "pushState");
    render(
      <StrictMode>
        <AmapCampusPrototype />
      </StrictMode>,
    );

    await selectScienceCentre();
    expect(push).toHaveBeenCalledTimes(1);
  });

  it("shows search results while typing instead of requiring a hidden submit step", async () => {
    render(<AmapCampusPrototype />);
    const search = screen.getByPlaceholderText("搜索建筑");

    fireEvent.input(search, { target: { value: "科学馆" } });

    expect(
      await screen.findByRole("button", { name: /科学馆/ }),
    ).not.toBeNull();
  });

  it("preserves a typed word separator for multi-token facility search", async () => {
    render(<AmapCampusPrototype initialSearch="?v=1" />);
    const search = screen.getByPlaceholderText("搜索建筑");

    fireEvent.change(search, { target: { value: "大学图书馆" } });
    fireEvent.change(search, { target: { value: "大学图书馆 " } });
    expect((search as HTMLInputElement).value).toBe("大学图书馆 ");
    fireEvent.change(search, { target: { value: "大学图书馆 饮水机" } });

    expect(
      await screen.findByRole("button", { name: /大学图书馆.*饮水机/ }),
    ).not.toBeNull();
  });

  it("dismisses search results with Escape", async () => {
    render(<AmapCampusPrototype initialSearch="?v=1" />);
    const search = screen.getByPlaceholderText("搜索建筑");
    fireEvent.change(search, { target: { value: "科学馆" } });
    expect(
      await screen.findByRole("button", { name: /科学馆/ }),
    ).not.toBeNull();

    fireEvent.keyDown(window, { key: "Escape" });

    await waitFor(() => expect((search as HTMLInputElement).value).toBe(""));
    expect(window.location.search).toBe("?v=1");
  });

  it("opens a facility search result at the same canonical facility URL", async () => {
    render(<AmapCampusPrototype />);
    const search = screen.getByPlaceholderText("搜索建筑");

    fireEvent.change(search, { target: { value: "大学图书馆 饮水机" } });
    fireEvent.click(
      await screen.findByRole("button", { name: /大学图书馆.*饮水机/ }),
    );

    expect(
      await screen.findByRole("heading", { name: "饮水机" }),
    ).not.toBeNull();
    expect(window.location.search).toBe(
      "?v=1&scene=facility&id=library-gf-water&snap=peek",
    );
  });

  it("keeps the known Science Centre prototype link working", async () => {
    render(
      <AmapCampusPrototype initialSearch="?building=building%3A15&panel=peek" />,
    );

    expect(
      await screen.findByRole("heading", { name: "科学馆" }),
    ).not.toBeNull();
  });

  it("keeps the building directory out of the compact mobile preview", async () => {
    render(<AmapCampusPrototype />);
    await selectScienceCentre();

    const floor = screen.getByRole("button", { name: "LG/F" });
    const facility = screen.getByRole("button", { name: "洗手间公众可达" });
    expect(floor.parentElement?.className).toContain("hidden");
    expect(facility.parentElement?.className).toContain("hidden");
  });

  it("opens a browsable result sheet when a facility category is selected", async () => {
    render(<AmapCampusPrototype />);

    fireEvent.click(screen.getByRole("button", { name: "饮水机" }));

    expect(
      await screen.findByRole("heading", { name: "2 栋建筑有饮水机" }),
    ).not.toBeNull();
    expect(
      screen.getByRole("button", { name: /科学馆 · 1\/F/ }),
    ).not.toBeNull();
    expect(
      screen.getByRole("button", { name: /大学图书馆 · G\/F/ }),
    ).not.toBeNull();
  });

  it("restores navigation from browser history state", async () => {
    render(<AmapCampusPrototype />);
    fireEvent.click(screen.getByRole("button", { name: "饮水机" }));
    fireEvent.click(screen.getByRole("button", { name: /科学馆 · 1\/F/ }));
    const facilityHistory = window.history.state;

    window.history.replaceState(facilityHistory, "", window.location.href);
    await act(async () => {
      window.dispatchEvent(
        new PopStateEvent("popstate", { state: facilityHistory }),
      );
    });
    await screen.findByRole("heading", { name: "饮水机" });
    fireEvent.click(screen.getByRole("button", { name: "返回饮水机列表" }));
    await act(async () => {
      window.dispatchEvent(
        new PopStateEvent("popstate", { state: window.history.state }),
      );
    });
    expect(
      await screen.findByRole("heading", { name: "2 栋建筑有饮水机" }),
    ).not.toBeNull();
  });
});
