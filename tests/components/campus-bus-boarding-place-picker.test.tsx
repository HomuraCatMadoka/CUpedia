/**
 * @vitest-environment jsdom
 */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CampusBusBoardingPlacePicker } from "@/components/campus-transport/campus-bus-boarding-place-picker";
import { resetCampusBusBoardingPlaceSession } from "@/lib/campus-transport/boarding-place-session";
import { toCampusBusPassengerRoute } from "@/lib/campus-transport/campus-bus";
import { getCampusBusRoute } from "@/lib/campus-transport/routes-data";

type PositionCallbacks = {
  error: PositionErrorCallback;
  success: PositionCallback;
};

let callbacks: PositionCallbacks[];
let getCurrentPosition: ReturnType<typeof vi.fn>;

beforeEach(() => {
  resetCampusBusBoardingPlaceSession();
  callbacks = [];
  getCurrentPosition = vi.fn(
    (success: PositionCallback, error: PositionErrorCallback) => {
      callbacks.push({ error, success });
    },
  );
  Object.defineProperty(window.navigator, "geolocation", {
    configurable: true,
    value: { getCurrentPosition },
  });
  Object.defineProperty(window.navigator, "permissions", {
    configurable: true,
    value: undefined,
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderPicker() {
  return render(
    <CampusBusBoardingPlacePicker
      initialNow={Date.UTC(2026, 7, 10, 23, 38)}
      routes={[toCampusBusPassengerRoute(getCampusBusRoute("1a")!)]}
    />,
  );
}

function position(longitude: number, latitude: number) {
  return {
    coords: { latitude, longitude },
  } as GeolocationPosition;
}

function positionError(code: number) {
  return {
    code,
    PERMISSION_DENIED: 1,
    POSITION_UNAVAILABLE: 2,
    TIMEOUT: 3,
  } as GeolocationPositionError;
}

describe("CampusBusBoardingPlacePicker", () => {
  it("selects a place and shows route departures without requesting geolocation", () => {
    renderPicker();

    expect(getCurrentPosition).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "手動選擇" }));
    fireEvent.change(screen.getByLabelText("搜尋乘車地點"), {
      target: { value: "大學站" },
    });
    fireEvent.click(screen.getByRole("button", { name: /大學站/ }));

    expect(screen.getByRole("heading", { name: "大學站" })).toBeTruthy();
    expect(screen.getAllByText("本部線").length).toBeGreaterThan(0);
    expect(screen.queryByText("1A 本部線")).toBeNull();
    expect(screen.getAllByText(/起點開出/).length).toBeGreaterThan(0);
    expect(getCurrentPosition).not.toHaveBeenCalled();
  });

  it("shows a safe empty result", () => {
    renderPicker();

    fireEvent.click(screen.getByRole("button", { name: "手動選擇" }));
    fireEvent.change(screen.getByLabelText("搜尋乘車地點"), {
      target: { value: "不存在" },
    });

    expect(
      screen.getByText("找不到相符乘車地點，請嘗試其他名稱。"),
    ).toBeTruthy();
  });

  it("requests one position only after clicking and renders approximate nearby results", async () => {
    renderPicker();
    expect(getCurrentPosition).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "使用我的位置" }));
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
    expect(getCurrentPosition.mock.calls[0]?.[2]).toEqual({
      enableHighAccuracy: false,
      maximumAge: 60_000,
      timeout: 8_000,
    });
    await act(() => callbacks[0]!.success(position(114.2101, 22.4135)));

    expect(screen.getByText("按直線距離排序")).toBeTruthy();
    expect(screen.getAllByText(/約 \d+ 米/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/步行/)).toBeNull();
  });

  it("restores derived nearby results after returning from a route detail", async () => {
    const view = renderPicker();
    fireEvent.click(screen.getByRole("button", { name: "使用我的位置" }));
    await act(() => callbacks[0]!.success(position(114.2101, 22.4135)));
    expect(screen.getByText("按直線距離排序")).toBeTruthy();
    const distanceBeforeNavigation =
      screen.getAllByText(/約 \d+ 米/)[0]?.textContent;

    // A route-detail navigation unmounts the home page. Browser Back mounts a
    // new instance in the same client runtime.
    view.unmount();
    renderPicker();

    expect(screen.getByText("按直線距離排序")).toBeTruthy();
    expect(screen.getByText(distanceBeforeNavigation!)).toBeTruthy();
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
  });

  it("shows the prototype requesting layout with skeletons and manual fallback", () => {
    const { container } = renderPicker();
    fireEvent.click(screen.getByRole("button", { name: "使用我的位置" }));

    expect(
      screen.getByRole("heading", { name: "正在取得你的位置" }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "改為手動選站" })).toBeTruthy();
    expect(container.querySelectorAll(".animate-pulse")).toHaveLength(3);
  });

  it.each([
    [1, "你可以手動選站；如要查看附近車站，可在瀏覽器設定中重新允許定位。"],
    [2, "你可以再試一次，或直接手動選站。"],
    [3, "取得位置逾時。你可以再試一次，或直接手動選站。"],
  ])("keeps manual fallback for geolocation error %s", async (code, label) => {
    renderPicker();
    fireEvent.click(screen.getByRole("button", { name: "使用我的位置" }));
    await act(() => callbacks[0]!.error(positionError(code as number)));

    expect(screen.getByText(label)).toBeTruthy();
    expect(screen.getByRole("button", { name: "手動選擇" })).toBeTruthy();
    if (code !== 1) {
      expect(screen.getByRole("button", { name: "重試定位" })).toBeTruthy();
    } else {
      expect(screen.queryByRole("button", { name: "使用我的位置" })).toBeNull();
    }
  });

  it("shows unsupported without making a request", () => {
    Reflect.deleteProperty(window.navigator, "geolocation");
    renderPicker();

    expect(
      screen.getByRole("heading", { name: "此瀏覽器不支持定位" }),
    ).toBeTruthy();
    expect(getCurrentPosition).not.toHaveBeenCalled();
  });

  it("uses Permissions API only as a progressive hint", async () => {
    Object.defineProperty(window.navigator, "permissions", {
      configurable: true,
      value: {
        query: vi.fn().mockResolvedValue({
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          state: "denied",
        }),
      },
    });
    renderPicker();

    expect(
      await screen.findByText(
        "瀏覽器目前不允許使用位置；你仍可手動選擇乘車地點。",
      ),
    ).toBeTruthy();
    expect(getCurrentPosition).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "使用我的位置" }));
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
  });

  it("ignores an old callback after manual fallback", async () => {
    renderPicker();
    fireEvent.click(screen.getByRole("button", { name: "使用我的位置" }));
    fireEvent.click(screen.getByRole("button", { name: "改為手動選站" }));
    fireEvent.click(
      screen.getByRole("button", { name: /^大學站Univ\. Station/ }),
    );
    await act(() => callbacks[0]!.success(position(114.2101, 22.4135)));

    expect(screen.getByText("手動選擇")).toBeTruthy();
    expect(screen.queryByText("按直線距離排序")).toBeNull();
  });

  it("ignores a callback after unmount", async () => {
    const view = renderPicker();
    fireEvent.click(screen.getByRole("button", { name: "使用我的位置" }));
    view.unmount();

    await act(() => callbacks[0]!.success(position(114.2101, 22.4135)));
    expect(document.body.textContent).not.toContain("按直線距離排序");
  });
});
