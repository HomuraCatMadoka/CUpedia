/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MenuItemPrice } from "@/components/canteen/menu-item-price";

afterEach(cleanup);

describe("MenuItemPrice", () => {
  it("keeps a single summary price compact", () => {
    render(
      <MenuItemPrice
        variant="summary"
        pricing={{
          options: [
            {
              id: "standard",
              label: "标准",
              amountMinor: 1800,
              currency: "HKD",
              sortOrder: 0,
            },
          ],
        }}
      />,
    );

    expect(screen.getByText("$18")).toBeTruthy();
    expect(screen.queryByText("标准")).toBeNull();
  });
});
