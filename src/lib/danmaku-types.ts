import { assertDanmakuNotBlocked } from "@/lib/danmaku-block";

export const DANMAKU_MAX_LENGTH = 100;

/** Cap flyover DOM nodes; static list still shows full month history. */
export const DANMAKU_FLY_MAX = 90;

export type DanmakuMessage = {
  id: string;
  userId: string;
  content: string;
  month: string;
  authorNickname: string;
  createdAt: Date;
};

export function validateDanmakuContent(input: unknown): string {
  if (typeof input !== "string") throw new Error("INVALID_DANMAKU");
  const trimmed = input.trim();
  if (!trimmed || trimmed.length > DANMAKU_MAX_LENGTH) {
    throw new Error("INVALID_DANMAKU");
  }
  if (/<[^>]+>/.test(trimmed)) throw new Error("INVALID_DANMAKU");
  assertDanmakuNotBlocked(trimmed);
  return trimmed;
}

/** Keep only the latest messages in the flyover layer to bound DOM size. */
export function messagesForFlyover<T>(items: T[]): T[] {
  if (items.length <= DANMAKU_FLY_MAX) return items;
  return items.slice(-DANMAKU_FLY_MAX);
}

/** Round-robin helper kept for unit tests of even spreading. */
export function distributeDanmakuToTracks<T>(
  items: T[],
  trackCount = 3,
): T[][] {
  const tracks = Array.from({ length: trackCount }, () => [] as T[]);
  for (let i = 0; i < items.length; i++) {
    tracks[i % trackCount].push(items[i]);
  }
  return tracks;
}
