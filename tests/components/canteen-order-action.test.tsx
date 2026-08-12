/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { CanteenOrderAction } from "@/components/canteen/canteen-order-action";

describe("CanteenOrderAction", () => {
  it("renders nothing without an order url", () => {
    const { container } = render(
      <CanteenOrderAction href={null} canteenName="ws-can" />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("links to the configured ordering page", () => {
    render(
      <CanteenOrderAction
        href="https://meal.pin2eat.com/store/4898/takeout"
        canteenName="ws-can"
      />,
    );

    const link = screen.getByRole("link", { name: "ws-can 点击点餐" });
    expect(link.getAttribute("href")).toBe(
      "https://meal.pin2eat.com/store/4898/takeout",
    );
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
    expect(link.textContent).toContain("点击点餐");
  });
});
