import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
}));

vi.mock("@/lib/auth-guard", () => ({
  requireAuth: mocks.requireAuth,
}));

import CampusMapLayout from "@/app/(main)/campus-map/layout";

describe("Campus Map beta authentication boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires authentication before rendering every nested route", async () => {
    const children = <div>nested Campus Map route</div>;

    const result = await CampusMapLayout({ children });

    expect(mocks.requireAuth).toHaveBeenCalledOnce();
    expect(result).toBe(children);
  });
});
