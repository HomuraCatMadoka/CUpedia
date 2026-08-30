import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  headers: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: mocks.headers,
}));

vi.mock("@/lib/auth-guard", () => ({
  requireAuth: mocks.requireAuth,
}));

import CampusMapLayout from "@/app/(main)/campus-map/layout";

describe("Campus Map beta authentication boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.headers.mockResolvedValue(
      new Headers({
        "x-campus-map-return-path":
          "/campus-map/places/place-1?cursor=next-page",
      }),
    );
  });

  it("requires authentication before rendering every nested route", async () => {
    const children = <div>nested Campus Map route</div>;

    const result = await CampusMapLayout({ children });

    expect(mocks.requireAuth).toHaveBeenCalledWith(
      "/campus-map/places/place-1?cursor=next-page",
    );
    expect(result).toBe(children);
  });
});
