export const ANNOUNCEMENT_TITLE_MAX_LENGTH = 120;
export const ANNOUNCEMENT_CONTENT_MAX_LENGTH = 5_000;
export const ANNOUNCEMENT_PAGE_SIZE = 10;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type AnnouncementInput = {
  title: string;
  content: string;
  priority: number;
  publishAt: string | null;
  expiresAt: string | null;
  published: boolean;
  sendNotification: boolean;
};

export type PublicAnnouncement = {
  id: string;
  title: string;
  content: string;
  publishedAt: string;
};

export type AdminAnnouncement = {
  id: string;
  title: string;
  content: string;
  priority: number;
  publishedAt: string | null;
  withdrawnAt: string | null;
  expiresAt: string | null;
  notificationSentAt: string | null;
  notifyOnPublish: boolean;
  updatedAt: string;
};

export function isAnnouncementId(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export function parseAnnouncementInput(input: AnnouncementInput): {
  title: string;
  content: string;
  priority: number;
  expiresAt: Date | null;
  publishAt: Date | null;
  published: boolean;
  sendNotification: boolean;
} {
  const title = typeof input.title === "string" ? input.title.trim() : "";
  const content = typeof input.content === "string" ? input.content.trim() : "";
  if (!title) throw new Error("请输入公告标题");
  if (title.length > ANNOUNCEMENT_TITLE_MAX_LENGTH) {
    throw new Error(`公告标题不能超过 ${ANNOUNCEMENT_TITLE_MAX_LENGTH} 个字符`);
  }
  if (!content) throw new Error("请输入公告内容");
  if (content.length > ANNOUNCEMENT_CONTENT_MAX_LENGTH) {
    throw new Error(
      `公告内容不能超过 ${ANNOUNCEMENT_CONTENT_MAX_LENGTH} 个字符`,
    );
  }

  const priority = Number(input.priority);
  if (!Number.isInteger(priority) || priority < 0 || priority > 100) {
    throw new Error("优先级必须是 0–100 的整数");
  }

  let expiresAt: Date | null = null;
  if (input.expiresAt) {
    expiresAt = new Date(input.expiresAt);
    if (Number.isNaN(expiresAt.getTime())) throw new Error("失效时间无效");
  }

  let publishAt: Date | null = null;
  if (input.publishAt) {
    publishAt = new Date(input.publishAt);
    if (Number.isNaN(publishAt.getTime())) throw new Error("发布时间无效");
  }

  return {
    title,
    content,
    priority,
    expiresAt,
    publishAt,
    published: input.published === true,
    sendNotification: input.sendNotification === true,
  };
}
