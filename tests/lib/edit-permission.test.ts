import { describe, it, expect } from "vitest";
import { canViewerEdit } from "@/lib/edit-permission";

// ref #214 / ADR 0012 — single edit-permission predicate shared by the display
// side (cheap/cached inputs) and the enforce side (fresh DB inputs).
describe("canViewerEdit", () => {
  it("denies an anonymous viewer (null / undefined)", () => {
    expect(canViewerEdit(null, "user")).toBe(false);
    expect(canViewerEdit(null, "admin")).toBe(false);
    expect(canViewerEdit(undefined, "user")).toBe(false);
  });

  it("denies a banned viewer even when the policy is open to users", () => {
    expect(canViewerEdit({ role: "user", banned: true }, "user")).toBe(false);
  });

  it("denies a banned admin under either policy", () => {
    expect(canViewerEdit({ role: "admin", banned: true }, "admin")).toBe(false);
    expect(canViewerEdit({ role: "admin", banned: true }, "user")).toBe(false);
  });

  it("allows any non-banned viewer when the policy is open to users", () => {
    expect(canViewerEdit({ role: "user", banned: false }, "user")).toBe(true);
    expect(canViewerEdit({ role: "admin", banned: false }, "user")).toBe(true);
  });

  it("allows only admins when the policy is admin-only", () => {
    expect(canViewerEdit({ role: "admin", banned: false }, "admin")).toBe(true);
    expect(canViewerEdit({ role: "user", banned: false }, "admin")).toBe(false);
  });

  it("treats a missing banned flag as not banned", () => {
    expect(canViewerEdit({ role: "user" }, "user")).toBe(true);
    expect(canViewerEdit({ role: "admin" }, "admin")).toBe(true);
  });

  it("treats a missing role as non-admin (allowed only under the open policy)", () => {
    expect(canViewerEdit({ banned: false }, "user")).toBe(true);
    expect(canViewerEdit({ banned: false }, "admin")).toBe(false);
  });
});
