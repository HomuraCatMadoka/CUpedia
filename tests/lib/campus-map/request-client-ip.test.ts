import { describe, expect, it } from "vitest";

import { requestClientIp } from "@/lib/campus-map/request-client-ip";

describe("Campus Map request client IP", () => {
  it("uses the first forwarded address", () => {
    expect(
      requestClientIp(
        new Headers({
          "x-forwarded-for": "203.0.113.8, 198.51.100.2",
          "x-real-ip": "192.0.2.1",
        }),
      ),
    ).toBe("203.0.113.8");
  });

  it("falls back to the real IP and then an explicit unknown subject", () => {
    expect(requestClientIp(new Headers({ "x-real-ip": "192.0.2.1" }))).toBe(
      "192.0.2.1",
    );
    expect(requestClientIp(new Headers())).toBe("unknown");
  });
});
