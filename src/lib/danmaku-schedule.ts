/**
 * Scrolling-lane scheduler inspired by bilibili ASS converters
 * (Bilibili-Evolved DanmakuStack / common danmaku collision notes):
 *
 * speed v = (screenWidth + width) / duration
 * fully-enter time visible = start + duration * width / (screenWidth + width) + gap
 *
 * Same-lane overlap:
 * - if previous is shorter than next: catch-up check via time to left edge
 * - else: next must wait until previous has fully entered
 */

export const DANMAKU_SCROLL_DURATION_SEC = 12;
export const DANMAKU_TRACK_COUNT = 4;
export const DANMAKU_NEXT_GAP_SEC = 0.05;
/** Beyond this horizon, skip flyover (still OK in the static list). */
export const DANMAKU_MAX_SCHEDULE_SEC = 90;

export type DanmakuScheduleInput = {
  id: string;
  content: string;
};

export type ScheduledDanmaku = {
  id: string;
  content: string;
  track: number;
  /** Seconds into the virtual timeline when the bullet begins entering. */
  start: number;
  duration: number;
  width: number;
};

export type TrackOccupant = {
  width: number;
  /** Time when the bullet has fully entered the screen. */
  visible: number;
  /** Time when the bullet has fully left. */
  end: number;
};

export function estimateDanmakuWidth(content: string, fontPx = 14): number {
  // Prefer counting full-width chars longer than ASCII for campus ZH+EN mix.
  let units = 0;
  for (const ch of content) {
    units += ch.codePointAt(0)! > 0xff ? 1 : 0.55;
  }
  return Math.max(48, units * fontPx + 28);
}

/**
 * Earliest start time on a lane that does not overlap `prev` (bilibili rule).
 */
export function earliestNonOverlappingStart(
  prev: TrackOccupant | null,
  width: number,
  screenWidth: number,
  duration: number,
  gap = DANMAKU_NEXT_GAP_SEC,
): number {
  if (!prev) return 0;
  if (prev.width < width) {
    // Longer bullet: must wait so it does not meet the previous before left edge.
    return Math.max(
      0,
      prev.end - (duration * screenWidth) / (screenWidth + width) + gap,
    );
  }
  // Previous fully entered before we start.
  return prev.visible;
}

export function scheduleScrollingDanmaku(
  items: DanmakuScheduleInput[],
  options?: {
    trackCount?: number;
    screenWidth?: number;
    duration?: number;
    fontPx?: number;
    maxScheduleSec?: number;
  },
): ScheduledDanmaku[] {
  const trackCount = options?.trackCount ?? DANMAKU_TRACK_COUNT;
  const screenWidth = Math.max(320, options?.screenWidth ?? 720);
  const duration = options?.duration ?? DANMAKU_SCROLL_DURATION_SEC;
  const fontPx = options?.fontPx ?? 14;
  const maxScheduleSec = options?.maxScheduleSec ?? DANMAKU_MAX_SCHEDULE_SEC;

  const lanes: Array<TrackOccupant | null> = Array.from(
    { length: trackCount },
    () => null,
  );
  const scheduled: ScheduledDanmaku[] = [];

  for (const item of items) {
    const width = estimateDanmakuWidth(item.content, fontPx);
    let bestTrack = -1;
    let bestStart = Number.POSITIVE_INFINITY;

    for (let track = 0; track < trackCount; track++) {
      const start = earliestNonOverlappingStart(
        lanes[track],
        width,
        screenWidth,
        duration,
      );
      if (start < bestStart) {
        bestStart = start;
        bestTrack = track;
      }
    }

    if (bestTrack < 0 || bestStart > maxScheduleSec) continue;

    const visible =
      bestStart + (duration * width) / (screenWidth + width) + DANMAKU_NEXT_GAP_SEC;
    const end = bestStart + duration;
    lanes[bestTrack] = { width, visible, end };
    scheduled.push({
      id: item.id,
      content: item.content,
      track: bestTrack,
      start: bestStart,
      duration,
      width,
    });
  }

  return scheduled;
}
