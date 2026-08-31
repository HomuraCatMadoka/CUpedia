import { afterEach, describe, expect, it, vi } from "vitest";

import { createCampusMapLifecycleSource } from "@/lib/campus-map/place-lifecycle-source";

const identity = {
  idempotencyKey: "30000000-0000-4000-8000-000000000001",
  reason: "现场确认设施已经永久关闭",
};

afterEach(() => vi.useRealTimers());

describe("Campus Map lifecycle provenance", () => {
  it("uses the server's Hong Kong date and keeps private request keys opaque", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-08-31T15:59:00.000Z"));

    const first = createCampusMapLifecycleSource(identity, "admin-1");
    expect(first).toMatchObject({
      kind: "other",
      accessedOn: "2026-08-31",
      note: identity.reason,
      ref: expect.stringMatching(/^campus-map-admin-lifecycle:[0-9a-f]{64}$/),
    });
    expect(first.ref).not.toContain(identity.idempotencyKey);

    vi.setSystemTime(new Date("2026-08-31T16:01:00.000Z"));
    const afterMidnight = createCampusMapLifecycleSource(identity, "admin-1");
    expect(afterMidnight.accessedOn).toBe("2026-09-01");
    expect(afterMidnight.ref).toBe(first.ref);
    expect(createCampusMapLifecycleSource(identity, "admin-2").ref).not.toBe(
      first.ref,
    );
  });
});
