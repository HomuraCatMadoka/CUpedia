/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ProfessorPortrait } from "@/components/professors/professor-portrait";

vi.mock("next/image", () => ({
  default: ({
    fill,
    priority,
    alt,
    ...props
  }: ComponentProps<"img"> & { fill?: boolean; priority?: boolean }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      {...props}
      alt={alt ?? ""}
      data-fill={fill || undefined}
      data-priority={priority || undefined}
    />
  ),
}));

afterEach(cleanup);

describe("ProfessorPortrait", () => {
  it("tries the next official portrait before showing initials", () => {
    render(
      <ProfessorPortrait
        imageUrls={[
          "https://department.example/photo.jpg",
          "/api/professor-portraits/person-id",
          "https://portal.example/photo.jpg",
        ]}
        name="Dr. SUN Li"
      />,
    );

    fireEvent.error(screen.getByAltText("Dr. Sun Li 的官方头像"));
    expect(
      screen.getByAltText("Dr. Sun Li 的官方头像").getAttribute("src"),
    ).toBe("/api/professor-portraits/person-id");

    fireEvent.error(screen.getByAltText("Dr. Sun Li 的官方头像"));
    expect(
      screen.getByAltText("Dr. Sun Li 的官方头像").getAttribute("src"),
    ).toBe("https://portal.example/photo.jpg");

    fireEvent.error(screen.getByAltText("Dr. Sun Li 的官方头像"));
    expect(
      screen.getByRole("img", { name: "Dr. Sun Li 的头像占位" }),
    ).toBeTruthy();
  });

  it("shows initials that exclude the title and title-case the family name", () => {
    render(<ProfessorPortrait imageUrls={[]} name="Professor CHAN Tai Man" />);

    expect(screen.getByText("CT")).toBeTruthy();
    expect(screen.queryByText("PC")).toBeNull();
    expect(
      screen.getByRole("img", { name: "Prof. Chan Tai Man 的头像占位" }),
    ).toBeTruthy();
  });
});
