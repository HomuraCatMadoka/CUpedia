/**
 * @vitest-environment jsdom
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CanteenQrBadge } from "@/components/canteen/canteen-qr-badge";

describe("CanteenQrBadge", () => {
  it("renders a scan-to-order QR asset", () => {
    render(
      <CanteenQrBadge
        src="/assets/canteen-qr/demo.png"
        canteenName="演示食堂"
      />,
    );
    expect(screen.getByText("扫码点单")).toBeTruthy();
    expect(screen.getByAltText("演示食堂 点单二维码")).toBeTruthy();
  });
});
