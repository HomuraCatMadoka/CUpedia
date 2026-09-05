/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { query } = vi.hoisted(() => ({ query: { value: "" } }));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(query.value),
}));

import { CampusBusRetiredRouteNotice } from "@/components/campus-transport/campus-bus-retired-route-notice";

describe("CampusBusRetiredRouteNotice", () => {
  beforeEach(() => {
    query.value = "";
  });

  afterEach(cleanup);

  it("shows the retired-route explanation from the client query string", () => {
    query.value = "routeRetired=1b";
    render(<CampusBusRetiredRouteNotice />);

    expect(screen.getByText(/1B 線已於 2026 年 9 月 1 日退役/)).toBeTruthy();
  });

  it("does not render a notice for an ordinary visit", () => {
    const { container } = render(<CampusBusRetiredRouteNotice />);

    expect(container.textContent).toBe("");
  });
});
