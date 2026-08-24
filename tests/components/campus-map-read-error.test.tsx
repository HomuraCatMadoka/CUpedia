// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import CampusMapReadError from "@/app/(main)/campus-map/error";

describe("Campus Map history unavailable state (#719)", () => {
  it("shows a safe retry state without exposing database details", () => {
    render(<CampusMapReadError reset={vi.fn()} />);

    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("暂时无法读取 Campus Map 历史");
    expect(alert.textContent).not.toMatch(/postgres|database|drizzle|sql/i);
    expect(
      screen.getByRole("button", { name: "重试" }).hasAttribute("disabled"),
    ).toBe(false);
  });
});
