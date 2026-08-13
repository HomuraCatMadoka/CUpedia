import { afterEach, describe, expect, it } from "vitest";

import {
  createCampusBusFeedbackSession,
  parseCampusBusFeedbackSession,
} from "@/lib/campus-transport/feedback-session";

describe("campus bus anonymous feedback session", () => {
  const originalSecret = process.env.AUTH_SECRET;

  afterEach(() => {
    if (originalSecret === undefined) {
      delete process.env.AUTH_SECRET;
    } else {
      process.env.AUTH_SECRET = originalSecret;
    }
  });

  it("round-trips a signed random session without using a network address", () => {
    process.env.AUTH_SECRET = "test-secret";
    const session = createCampusBusFeedbackSession();

    expect(session.sessionId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(parseCampusBusFeedbackSession(session.value)).toBe(
      session.sessionId,
    );
  });

  it("rejects a modified or expired cookie", () => {
    process.env.AUTH_SECRET = "test-secret";
    const session = createCampusBusFeedbackSession();

    expect(parseCampusBusFeedbackSession(`${session.value}x`)).toBeNull();
    expect(
      parseCampusBusFeedbackSession(session.value, Date.now() + 3_700_000),
    ).toBeNull();
  });
});
