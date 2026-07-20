import {
  toPublicDanmakuMessage,
  type PublicDanmakuMessage,
} from "@/lib/danmaku-types";

const DANMAKU_ERROR_STATUSES = new Map<string, number>([
  ["INVALID_DANMAKU", 400],
  ["DANMAKU_BLOCKED", 400],
  ["SENSITIVE_CONTENT", 400],
  ["CANTEEN_NOT_FOUND", 404],
  ["DANMAKU_RATE_LIMIT_EXCEEDED", 429],
]);

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

export function serializePublicDanmaku(message: PublicDanmakuMessage) {
  const publicMessage = toPublicDanmakuMessage(message);
  return {
    ...publicMessage,
    createdAt: publicMessage.createdAt.toISOString(),
  };
}

export function publicDanmakuError(error: unknown): {
  error: string;
  status: number;
} {
  const candidate = error instanceof Error ? error.message : "";
  const status = DANMAKU_ERROR_STATUSES.get(candidate);
  return status
    ? { error: candidate, status }
    : { error: "DANMAKU_FAILED", status: 500 };
}
