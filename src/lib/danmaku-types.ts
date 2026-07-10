export const DANMAKU_MAX_LENGTH = 100;

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
  return trimmed;
}

/** Spread messages across N animation tracks for even density. */
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
