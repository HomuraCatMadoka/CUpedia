import { describe, it, expect } from "vitest";
import {
  SIDEBAR_COOKIE,
  parseSidebarCollapsed,
  serializeSidebarCookie,
} from "@/lib/sidebar-cookie";

describe("parseSidebarCollapsed", () => {
  it("returns false when cookie absent", () => {
    expect(parseSidebarCollapsed(undefined)).toBe(false);
    expect(parseSidebarCollapsed("")).toBe(false);
    expect(parseSidebarCollapsed("other=1")).toBe(false);
  });

  it("returns true only for the collapsed value", () => {
    expect(parseSidebarCollapsed(`${SIDEBAR_COOKIE}=collapsed`)).toBe(true);
    expect(parseSidebarCollapsed(`a=b; ${SIDEBAR_COOKIE}=collapsed; c=d`)).toBe(
      true,
    );
  });

  it("returns false for the expanded value", () => {
    expect(parseSidebarCollapsed(`${SIDEBAR_COOKIE}=expanded`)).toBe(false);
  });
});

describe("serializeSidebarCookie", () => {
  it("encodes the collapsed preference with path and max-age", () => {
    const out = serializeSidebarCookie(true);
    expect(out).toContain(`${SIDEBAR_COOKIE}=collapsed`);
    expect(out).toContain("path=/");
    expect(out.toLowerCase()).toContain("max-age=");
  });

  it("encodes the expanded preference", () => {
    expect(serializeSidebarCookie(false)).toContain(
      `${SIDEBAR_COOKIE}=expanded`,
    );
  });
});
