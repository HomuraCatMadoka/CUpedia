import { describe, expect, it } from "vitest";

import {
  getAnnouncementLifecycle,
  resolveAnnouncementPublication,
} from "@/lib/announcement-lifecycle";

const now = new Date("2026-08-12T05:00:00.000Z");
const past = new Date("2026-08-11T05:00:00.000Z");
const future = new Date("2026-08-13T05:00:00.000Z");

describe("announcement lifecycle", () => {
  it.each([
    ["draft", null, null, null],
    ["scheduled", future, null, null],
    ["published", past, null, null],
    ["expired", past, null, past],
    ["withdrawn", past, past, null],
  ] as const)(
    "derives %s from publication timestamps",
    (expected, publishedAt, withdrawnAt, expiresAt) => {
      expect(
        getAnnouncementLifecycle({ publishedAt, withdrawnAt, expiresAt }, now),
      ).toBe(expected);
    },
  );

  it("publishes a scheduled announcement immediately when its time is cleared", () => {
    expect(
      resolveAnnouncementPublication(
        { publishedAt: future, withdrawnAt: null, expiresAt: null },
        { published: true, publishAt: null },
        now,
      ),
    ).toEqual({ publishedAt: now, withdrawnAt: null });
  });

  it("preserves the first publication time for an already-public announcement", () => {
    expect(
      resolveAnnouncementPublication(
        { publishedAt: past, withdrawnAt: null, expiresAt: null },
        { published: true, publishAt: future },
        now,
      ),
    ).toEqual({ publishedAt: past, withdrawnAt: null });
  });

  it("turns a cancelled schedule back into a draft", () => {
    expect(
      resolveAnnouncementPublication(
        { publishedAt: future, withdrawnAt: null, expiresAt: null },
        { published: false, publishAt: null },
        now,
      ),
    ).toEqual({ publishedAt: null, withdrawnAt: null });
  });

  it("withdraws a public announcement without erasing publication history", () => {
    expect(
      resolveAnnouncementPublication(
        { publishedAt: past, withdrawnAt: null, expiresAt: null },
        { published: false, publishAt: null },
        now,
      ),
    ).toEqual({ publishedAt: past, withdrawnAt: now });
  });

  it("republishes a withdrawn announcement at the requested time", () => {
    expect(
      resolveAnnouncementPublication(
        { publishedAt: past, withdrawnAt: past, expiresAt: null },
        { published: true, publishAt: null },
        now,
      ),
    ).toEqual({ publishedAt: now, withdrawnAt: null });
  });
});
