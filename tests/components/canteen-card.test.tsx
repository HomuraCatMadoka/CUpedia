/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { CanteenCard } from "@/components/canteen/canteen-card";

const { mockUseLinkStatus } = vi.hoisted(() => ({
  mockUseLinkStatus: vi.fn(() => ({ pending: false })),
}));

vi.mock("next/link", async () => {
  const React = await import("react");
  const MockLink = ({
    children,
    href,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  );
  return {
    __esModule: true,
    default: MockLink,
    useLinkStatus: mockUseLinkStatus,
  };
});

const CANTEEN = {
  id: "c1",
  name: "演示食堂",
  location: "演示区域",
  announcement: null,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
};

beforeEach(() => {
  mockUseLinkStatus.mockReturnValue({ pending: false });
});

describe("CanteenCard", () => {
  it("links to the canteen detail route", () => {
    render(<CanteenCard canteen={CANTEEN} href="/canteen/c1" itemCount={12} />);

    const link = screen.getByRole("link", {
      name: /演示食堂.*演示区域.*12 道菜/,
    });
    expect(link.getAttribute("href")).toBe("/canteen/c1");
    expect(screen.getByText("12")).toBeTruthy();
    expect(screen.getByText("道菜")).toBeTruthy();
  });

  it("shows pending feedback while navigating", () => {
    mockUseLinkStatus.mockReturnValue({ pending: true });

    render(<CanteenCard canteen={CANTEEN} href="/canteen/c1" itemCount={12} />);

    const link = screen.getByRole("link", {
      name: /演示食堂.*演示区域.*12 道菜/,
    });
    expect(link.querySelector('[aria-busy="true"]')).toBeTruthy();
    expect(link.querySelector(".animate-spin")).toBeTruthy();
    expect(screen.queryByText("→")).toBeNull();
  });
});
