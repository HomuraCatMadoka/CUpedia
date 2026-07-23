/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { CanteenCard } from "@/components/canteen/canteen-card";

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
    useLinkStatus: () => ({ pending: false }),
  };
});

describe("CanteenCard", () => {
  it("links to the canteen detail route", () => {
    render(
      <CanteenCard
        canteen={{
          id: "c1",
          name: "联合书院食堂",
          location: "联合书院",
          announcement: null,
          createdAt: new Date("2026-01-01"),
          updatedAt: new Date("2026-01-01"),
        }}
        href="/canteen/c1"
        itemCount={12}
      />,
    );

    const link = screen.getByRole("link", {
      name: /联合书院食堂.*联合书院.*12 道菜/,
    });
    expect(link.getAttribute("href")).toBe("/canteen/c1");
    expect(screen.getByText("12")).toBeTruthy();
    expect(screen.getByText("道菜")).toBeTruthy();
  });
});
