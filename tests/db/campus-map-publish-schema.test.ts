import { getTableColumns } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import {
  campusMapPublishRateLimits,
  campusMapPublishRequests,
} from "@/db/schema";

describe("Campus Map private publish state (#718)", () => {
  it("stores replay results separately from persistent actor/IP rate windows", () => {
    const request = getTableColumns(campusMapPublishRequests);
    expect(request.actorIdSnapshot).toBeDefined();
    expect(request.idempotencyKey).toBeDefined();
    expect(request.requestFingerprint).toBeDefined();
    expect(request.result).toBeDefined();
    expect(request.completedAt).toBeDefined();

    const rate = getTableColumns(campusMapPublishRateLimits);
    expect(rate.scope).toBeDefined();
    expect(rate.subjectHash).toBeDefined();
    expect(rate.windowKind).toBeDefined();
    expect(rate.windowStartedAt).toBeDefined();
    expect(rate.attemptCount).toBeDefined();
  });
});
