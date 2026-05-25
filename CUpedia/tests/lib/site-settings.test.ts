import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockDbExecute } = vi.hoisted(() => ({
  mockDbExecute: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: { execute: mockDbExecute },
}));

import {
  getWikiEditRole,
  getWikiEditRoleFresh,
  setWikiEditRole,
  _clearCache,
} from "@/lib/site-settings";

beforeEach(() => {
  vi.clearAllMocks();
  _clearCache();
});

describe("getWikiEditRoleFresh", () => {
  it("returns 'admin' when no row exists", async () => {
    mockDbExecute.mockResolvedValue({ rows: [] });
    expect(await getWikiEditRoleFresh()).toBe("admin");
  });

  it("returns stored value when row exists", async () => {
    mockDbExecute.mockResolvedValue({
      rows: [{ value: "user" }],
    });
    expect(await getWikiEditRoleFresh()).toBe("user");
  });

  it("always queries the database", async () => {
    mockDbExecute.mockResolvedValue({
      rows: [{ value: "user" }],
    });
    await getWikiEditRoleFresh();
    await getWikiEditRoleFresh();
    expect(mockDbExecute).toHaveBeenCalledTimes(2);
  });
});

describe("getWikiEditRole (cached)", () => {
  it("returns 'admin' when no row exists", async () => {
    mockDbExecute.mockResolvedValue({ rows: [] });
    expect(await getWikiEditRole()).toBe("admin");
  });

  it("caches the value after first call", async () => {
    mockDbExecute.mockResolvedValue({
      rows: [{ value: "user" }],
    });
    await getWikiEditRole();
    await getWikiEditRole();
    expect(mockDbExecute).toHaveBeenCalledTimes(1);
  });

  it("returns cached value without hitting DB on subsequent calls", async () => {
    mockDbExecute.mockResolvedValue({
      rows: [{ value: "user" }],
    });
    const first = await getWikiEditRole();
    mockDbExecute.mockResolvedValue({
      rows: [{ value: "admin" }],
    });
    const second = await getWikiEditRole();
    expect(first).toBe("user");
    expect(second).toBe("user");
  });
});

describe("setWikiEditRole", () => {
  it("clears cache so next getWikiEditRole re-queries", async () => {
    mockDbExecute.mockResolvedValue({ rows: [{ value: "admin" }] });
    await getWikiEditRole();

    mockDbExecute.mockResolvedValue({ rows: [] });
    await setWikiEditRole("user");

    mockDbExecute.mockResolvedValue({ rows: [{ value: "user" }] });
    const result = await getWikiEditRole();
    expect(result).toBe("user");
  });
});
