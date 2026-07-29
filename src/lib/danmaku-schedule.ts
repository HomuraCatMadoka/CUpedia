/**
 * Scrolling-lane scheduler inspired by bilibili ASS converters
 * (Bilibili-Evolved DanmakuStack / common danmaku collision notes):
 *
 * speed v = (screenWidth + width) / duration
 * fully-enter time visible = start + duration * width / (screenWidth + width) + gap
 *
 * Same-lane: next start is the max of
 * - previous fully entered (+ gap)
 * - catch-up guard so a longer/faster next never meets the previous
 *
 * Flyover CSS must run once per cycle (no `infinite` with a shared duration),
 * otherwise `animation-delay: -start` wraps mod duration and re-collides.
 */

export const DANMAKU_SCROLL_DURATION_SEC = 12;
export const DANMAKU_TRACK_COUNT = 5;
/** Horizontal clearance between consecutive same-lane bullets. */
export const DANMAKU_NEXT_GAP_SEC = 0.8;
/** Beyond this horizon, skip flyover (still OK in the static list). */
export const DANMAKU_MAX_SCHEDULE_SEC = 180;
/** Inflate estimated glyph box — real fonts/padding run wider than the heuristic. */
export const DANMAKU_WIDTH_INFLATE = 1.35;

export type DanmakuScheduleInput = {
  id: string;
  content: string;
};

export type ScheduledDanmaku = {
  id: string;
  content: string;
  track: number;
  /** Seconds into the cycle when the bullet begins entering. */
  start: number;
  duration: number;
  width: number;
};

export type TrackOccupant = {
  start: number;
  width: number;
  /** Time when the bullet has fully entered the screen. */
  visible: number;
  /** Time when the bullet has fully left. */
  end: number;
};

export function estimateDanmakuWidth(content: string, fontPx = 14): number {
  let units = 0;
  for (const ch of content) {
    units += ch.codePointAt(0)! > 0xff ? 1 : 0.55;
  }
  const pad = Math.max(28, fontPx * 1.75);
  return Math.max(56, units * fontPx + pad) * DANMAKU_WIDTH_INFLATE;
}

function occupantAt(
  start: number,
  width: number,
  screenWidth: number,
  duration: number,
  gap: number,
): TrackOccupant {
  return {
    start,
    width,
    visible: start + (duration * width) / (screenWidth + width) + gap,
    end: start + duration,
  };
}

/**
 * Earliest start time on a lane that does not overlap `prev`.
 * Always applies both the enter-gap and catch-up guards.
 */
export function earliestNonOverlappingStart(
  prev: TrackOccupant | null,
  width: number,
  screenWidth: number,
  duration: number,
  gap = DANMAKU_NEXT_GAP_SEC,
): number {
  if (!prev) return 0;
  const afterEnter = prev.visible;
  const noCatchUp =
    prev.end - (duration * screenWidth) / (screenWidth + width) + gap;
  return Math.max(0, afterEnter, noCatchUp);
}

/** Simulate left/right edges at time t (bullet travels screenWidth+width in duration). */
export function bulletEdgesAt(
  start: number,
  width: number,
  screenWidth: number,
  duration: number,
  t: number,
): { left: number; right: number } | null {
  const age = t - start;
  if (age < 0 || age > duration) return null;
  const travel = screenWidth + width;
  const left = screenWidth - (age / duration) * travel;
  return { left, right: left + width };
}

/** Same-lane pairs never share horizontal range during the cycle. */
export function assertLaneNonOverlapping(
  lane: ScheduledDanmaku[],
  screenWidth: number,
  gapPx = 4,
  samples = 48,
): boolean {
  const duration = lane[0]?.duration ?? DANMAKU_SCROLL_DURATION_SEC;
  const maxT = Math.max(...lane.map((s) => s.start + s.duration), duration);
  for (let i = 0; i <= samples; i++) {
    const t = (maxT * i) / samples;
    const boxes = lane
      .map((s) => bulletEdgesAt(s.start, s.width, screenWidth, duration, t))
      .filter((b): b is { left: number; right: number } => b !== null);
    for (let a = 0; a < boxes.length; a++) {
      for (let b = a + 1; b < boxes.length; b++) {
        const overlap =
          Math.min(boxes[a].right, boxes[b].right) -
          Math.max(boxes[a].left, boxes[b].left);
        if (overlap > gapPx) return false;
      }
    }
  }
  return true;
}

export function scheduleScrollingDanmaku(
  items: DanmakuScheduleInput[],
  options?: {
    trackCount?: number;
    screenWidth?: number;
    duration?: number;
    fontPx?: number;
    maxScheduleSec?: number;
    gap?: number;
  },
): ScheduledDanmaku[] {
  const trackCount = options?.trackCount ?? DANMAKU_TRACK_COUNT;
  const screenWidth = Math.max(320, options?.screenWidth ?? 720);
  const duration = options?.duration ?? DANMAKU_SCROLL_DURATION_SEC;
  const fontPx = options?.fontPx ?? 14;
  const gap = options?.gap ?? DANMAKU_NEXT_GAP_SEC;
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
        gap,
      );
      if (start < bestStart) {
        bestStart = start;
        bestTrack = track;
      }
    }

    if (bestTrack < 0 || bestStart > maxScheduleSec) continue;

    const occupant = occupantAt(
      bestStart,
      width,
      screenWidth,
      duration,
      gap,
    );
    lanes[bestTrack] = occupant;
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
