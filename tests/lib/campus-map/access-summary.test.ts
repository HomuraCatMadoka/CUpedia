import { describe, expect, it } from "vitest";

import { summarizeCampusMapAccess } from "@/lib/campus-map/access-summary";

describe("Campus Map access summary (#827)", () => {
  it("keeps known restrictions when other access dimensions are unknown", () => {
    expect(
      summarizeCampusMapAccess({
        audience: "cuhk-member",
        credentialRequirement: "unknown",
        schedule: { kind: "unknown" },
        reservationRequirement: "required",
        temporaryStatus: "unknown",
      }),
    ).toBe("限中大成员 · 需要预约");
  });

  it("keeps temporary availability separate from known entry restrictions", () => {
    expect(
      summarizeCampusMapAccess({
        audience: "library-member",
        credentialRequirement: "library-card",
        schedule: { kind: "unknown" },
        reservationRequirement: "unknown",
        temporaryStatus: "temporarily-closed",
      }),
    ).toBe("限图书馆成员 · 需图书证 · 暂时关闭");
  });

  it("only claims public access when every access dimension is known and unrestricted", () => {
    expect(
      summarizeCampusMapAccess({
        audience: "public",
        credentialRequirement: "none",
        schedule: { kind: "always" },
        reservationRequirement: "none",
        temporaryStatus: "normal",
      }),
    ).toBe("公众可达");

    expect(
      summarizeCampusMapAccess({
        audience: "unknown",
        credentialRequirement: "unknown",
        schedule: { kind: "unknown" },
        reservationRequirement: "unknown",
        temporaryStatus: "unknown",
      }),
    ).toBeNull();
  });
});
