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
 *
 * CSS animations use `animation-delay: -start` with a fixed `duration` and
 * `infinite`, so starts wrap mod duration — scheduling must be circular.
 */

export const DANMAKU_SCROLL_DURATION_SEC = 12;
export const DANMAKU_TRACK_COUNT = 5;
/** Horizontal clearance between consecutive same-lane bullets. */
export const DANMAKU_NEXT_GAP_SEC = 0.45;
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
  start: number;
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
  // Horizontal padding on `.danmaku-item` (~0.75rem each side) + slack.
  const pad = Math.max(24, fontPx * 1.6);
  return Math.max(48, units * fontPx + pad);
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

/** Whether A then B (B.start >= A.start) is spatially clear. */
function pairClear(
  earlier: TrackOccupant,
  later: TrackOccupant,
  screenWidth: number,
  duration: number,
  gap: number,
): boolean {
  const need = earliestNonOverlappingStart(
    earlier,
    later.width,
    screenWidth,
    duration,
    gap,
  );
  return later.start + 1e-9 >= need;
}

/**
 * Circular non-overlap for CSS `infinite` animations of length `duration`
 * (starts are interpreted mod duration).
 */
export function fitsCircularLane(
  existing: TrackOccupant[],
  start: number,
  width: number,
  screenWidth: number,
  duration: number,
  gap = DANMAKU_NEXT_GAP_SEC,
): boolean {
  if (start < -1e-9 || start >= duration - 1e-9) return false;
  const neu = occupantAt(start, width, screenWidth, duration, gap);
  for (const e of existing) {
    if (e.start <= start) {
      if (!pairClear(e, neu, screenWidth, duration, gap)) return false;
      const eNext = occupantAt(
        e.start + duration,
        e.width,
        screenWidth,
        duration,
        gap,
      );
      if (!pairClear(neu, eNext, screenWidth, duration, gap)) return false;
    } else {
      if (!pairClear(neu, e, screenWidth, duration, gap)) return false;
      const neuNext = occupantAt(
        start + duration,
        width,
        screenWidth,
        duration,
        gap,
      );
      if (!pairClear(e, neuNext, screenWidth, duration, gap)) return false;
    }
  }
  return true;
}

/**
 * Earliest start in [0, duration) that clears every occupant on a looping lane.
 */
export function earliestCircularStart(
  existing: TrackOccupant[],
  width: number,
  screenWidth: number,
  duration: number,
  gap = DANMAKU_NEXT_GAP_SEC,
): number | null {
  if (existing.length === 0) return 0;

  const candidates = new Set<number>([0]);
  for (const e of existing) {
    candidates.add(
      earliestNonOverlappingStart(e, width, screenWidth, duration, gap),
    );
    // Also try right after this bullet's next-cycle copy constraints collapse.
    candidates.add(e.start);
  }

  const sorted = [...candidates]
    .map((s) => {
      let x = s % duration;
      if (x < 0) x += duration;
      return x;
    })
    .filter((s) => s < duration)
    .sort((a, b) => a - b);

  for (const start of sorted) {
    if (fitsCircularLane(existing, start, width, screenWidth, duration, gap)) {
      return start;
    }
  }

  // Dense scan when discrete candidates fail (many same-width bullets).
  const step = Math.max(0.05, gap / 2);
  for (let start = 0; start < duration; start += step) {
    if (fitsCircularLane(existing, start, width, screenWidth, duration, gap)) {
      return start;
    }
  }
  return null;
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

  const lanes: TrackOccupant[][] = Array.from(
    { length: trackCount },
    () => [],
  );
  const scheduled: ScheduledDanmaku[] = [];

  for (const item of items) {
    const width = estimateDanmakuWidth(item.content, fontPx);
    let bestTrack = -1;
    let bestStart = Number.POSITIVE_INFINITY;

    for (let track = 0; track < trackCount; track++) {
      const start = earliestCircularStart(
        lanes[track],
        width,
        screenWidth,
        duration,
        gap,
      );
      if (start === null) continue;
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
    lanes[bestTrack].push(occupant);
    lanes[bestTrack].sort((a, b) => a.start - b.start);
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
