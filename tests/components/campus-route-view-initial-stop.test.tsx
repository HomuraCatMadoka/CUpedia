/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CampusRouteView } from "@/components/campus-transport/campus-route-view";
import { toCampusBusPassengerRoute } from "@/lib/campus-transport/campus-bus";
import { getCampusBusRoute } from "@/lib/campus-transport/routes-data";

vi.mock("@/components/campus-transport/campus-route-map", () => ({
  CampusRouteMap: () => null,
}));

afterEach(cleanup);

beforeEach(() => {
  window.matchMedia = vi.fn().mockReturnValue({ matches: true });
  Element.prototype.scrollIntoView = vi.fn();
});

describe("CampusRouteView initial Stop", () => {
  it("selects an exact operational Stop occurrence passed by the Boarding place flow", () => {
    const route = toCampusBusPassengerRoute(getCampusBusRoute("1b")!);
    render(
      <CampusRouteView
        initialNow={Date.UTC(2026, 7, 10, 23, 38)}
        initialStopId="cuhk-wp-stop-2552#2"
        route={route}
      />,
    );

    expect(
      screen
        .getByRole("button", { name: /8\. 大學站/ })
        .getAttribute("aria-expanded"),
    ).toBe("true");
  });
});
