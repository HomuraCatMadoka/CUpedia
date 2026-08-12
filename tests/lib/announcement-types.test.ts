import { describe, expect, it } from "vitest";

import {
  ANNOUNCEMENT_CONTENT_MAX_LENGTH,
  ANNOUNCEMENT_TITLE_MAX_LENGTH,
  isAnnouncementId,
  parseAnnouncementInput,
} from "@/lib/announcement-types";

const validInput = {
  title: "  迎新资料已更新  ",
  content: "  请查看最新入学指南。  ",
  priority: 20,
  expiresAt: "2026-09-01T00:00:00.000Z",
  published: true,
  sendNotification: true,
};

describe("parseAnnouncementInput", () => {
  it("trims content and parses the optional expiry", () => {
    expect(parseAnnouncementInput(validInput)).toEqual({
      title: "迎新资料已更新",
      content: "请查看最新入学指南。",
      priority: 20,
      expiresAt: new Date("2026-09-01T00:00:00.000Z"),
      published: true,
      sendNotification: true,
    });
  });

  it("rejects empty or overlong content", () => {
    expect(() => parseAnnouncementInput({ ...validInput, title: " " })).toThrow(
      "请输入公告标题",
    );
    expect(() =>
      parseAnnouncementInput({
        ...validInput,
        title: "a".repeat(ANNOUNCEMENT_TITLE_MAX_LENGTH + 1),
      }),
    ).toThrow("公告标题不能超过");
    expect(() =>
      parseAnnouncementInput({
        ...validInput,
        content: "a".repeat(ANNOUNCEMENT_CONTENT_MAX_LENGTH + 1),
      }),
    ).toThrow("公告内容不能超过");
  });

  it("rejects invalid priorities and expiry values", () => {
    expect(() =>
      parseAnnouncementInput({ ...validInput, priority: 1.5 }),
    ).toThrow("优先级");
    expect(() =>
      parseAnnouncementInput({ ...validInput, expiresAt: "invalid" }),
    ).toThrow("失效时间无效");
  });
});

describe("isAnnouncementId", () => {
  it("accepts UUIDs and rejects route garbage before it reaches Postgres", () => {
    expect(isAnnouncementId("00000000-0000-4000-a100-000000000001")).toBe(true);
    expect(isAnnouncementId("not-a-uuid")).toBe(false);
  });
});
