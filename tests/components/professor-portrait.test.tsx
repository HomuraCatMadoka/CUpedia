/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ProfessorPortrait } from "@/components/professors/professor-portrait";

afterEach(cleanup);

const portrait = {
  src256: "https://assets.example/professor-256.webp",
  src384: "https://assets.example/professor-384.webp",
  width256: 256,
  height256: 256,
  width384: 384,
  height384: 384,
};

describe("ProfessorPortrait", () => {
  it("renders an owned responsive asset without the Next.js image endpoint", () => {
    render(<ProfessorPortrait portrait={portrait} name="Dr. SUN Li" />);

    const image = screen.getByAltText("Dr. Sun Li 的官方头像");
    expect(image.getAttribute("src")).toBe(portrait.src256);
    expect(image.getAttribute("srcset")).toContain(portrait.src384);
    expect(image.getAttribute("src")).not.toContain("/_next/image");
  });

  it("shows initials when the owned asset cannot load", () => {
    render(<ProfessorPortrait portrait={portrait} name="Dr. SUN Li" />);

    fireEvent.error(screen.getByAltText("Dr. Sun Li 的官方头像"));
    expect(
      screen.getByRole("img", { name: "Dr. Sun Li 的头像占位" }),
    ).toBeTruthy();
  });

  it("shows initials that exclude the title and title-case the family name", () => {
    render(<ProfessorPortrait portrait={null} name="Professor CHAN Tai Man" />);

    expect(screen.getByText("CT")).toBeTruthy();
    expect(screen.queryByText("PC")).toBeNull();
    expect(
      screen.getByRole("img", { name: "Prof. Chan Tai Man 的头像占位" }),
    ).toBeTruthy();
  });
});
