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

export type PublicDanmakuMessage = Pick<
  DanmakuMessage,
  "id" | "content" | "month" | "createdAt"
>;

export type AdminDanmakuMessage = DanmakuMessage &
  (
    | { scope: "hub"; canteenId: null; canteenName: null }
    | {
        scope: "canteen";
        canteenId: string;
        canteenName: string;
      }
  );

export function toPublicDanmakuMessage(
  message: PublicDanmakuMessage,
): PublicDanmakuMessage {
  return {
    id: message.id,
    content: message.content,
    month: message.month,
    createdAt: message.createdAt,
  };
}

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

/** Fisher–Yates copy — used so each page load can schedule bullets in a fresh order. */
export function shuffleArray<T>(items: readonly T[]): T[] {
  const next = items.slice();
  for (let i = next.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = next[i]!;
    next[i] = next[j]!;
    next[j] = tmp;
  }
  return next;
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
