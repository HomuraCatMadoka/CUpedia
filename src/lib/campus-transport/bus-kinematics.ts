export type TrapezoidProfile = {
  /** 巡航速度（m/s）。不可行时退化为三角剖面的峰值速度。 */
  cruiseSpeed: number;
  /** 加速段时间（s）。 */
  accelerateTime: number;
  /** 加速段距离（m），减速段与之对称。 */
  accelerateDistance: number;
  /** 匀速段距离（m）；不可行（三角剖面）时为 0。 */
  cruiseDistance: number;
  /** 梯形剖面是否可行（时间足以完成加速-匀速-减速）。 */
  feasible: boolean;
};

/**
 * 梯形速度剖面：匀加速 → 匀速 → 匀减速。
 *
 * 给定站间距离 L（m）、行驶时间 T（s）、加速度 A（m/s²），解巡航速度 v：
 *
 *   v = A/2 * (T - sqrt(T² - 4·L/A))
 *
 * 可行性条件 T² ≥ 4·L/A（即 A ≥ 4L/T²）。不可行时退化为三角剖面
 * （纯加速到中点再减速），feasible=false。
 */
export function solveTrapezoidProfile(
  lengthMeters: number,
  travelSeconds: number,
  acceleration: number,
): TrapezoidProfile {
  if (lengthMeters <= 0 || travelSeconds <= 0) {
    return {
      cruiseSpeed: 0,
      accelerateTime: 0,
      accelerateDistance: 0,
      cruiseDistance: 0,
      feasible: false,
    };
  }

  const discriminant =
    travelSeconds * travelSeconds - (4 * lengthMeters) / acceleration;

  if (discriminant < 0) {
    // 三角剖面：加速到中点再减速
    const peakSpeed = Math.sqrt(acceleration * lengthMeters);
    const accelerateTime = Math.sqrt(lengthMeters / acceleration);
    return {
      cruiseSpeed: peakSpeed,
      accelerateTime,
      accelerateDistance: lengthMeters / 2,
      cruiseDistance: 0,
      feasible: false,
    };
  }

  const cruiseSpeed =
    (acceleration / 2) *
    (travelSeconds - Math.sqrt(discriminant));
  const accelerateTime = cruiseSpeed / acceleration;
  const accelerateDistance = (cruiseSpeed * cruiseSpeed) / (2 * acceleration);
  const cruiseDistance = Math.max(0, lengthMeters - 2 * accelerateDistance);
  return {
    cruiseSpeed,
    accelerateTime,
    accelerateDistance,
    cruiseDistance,
    feasible: true,
  };
}

/**
 * 梯形剖面下，行驶时间 τ（s）对应的已走距离（m）。
 * 分段：加速（τ < t_a）→ 匀速（τ < t_a + t_c）→ 减速（其后）。
 */
export function positionAlongSegment(
  elapsedSeconds: number,
  profile: TrapezoidProfile,
) {
  const { cruiseSpeed, accelerateTime, accelerateDistance, cruiseDistance } =
    profile;
  const cruiseEnd = accelerateTime + (cruiseDistance > 0 ? cruiseDistance / cruiseSpeed : 0);

  if (elapsedSeconds <= 0) return 0;
  if (elapsedSeconds < accelerateTime) {
    return (
      0.5 * (cruiseSpeed / accelerateTime) * elapsedSeconds * elapsedSeconds
    );
  }
  if (elapsedSeconds < cruiseEnd) {
    return (
      accelerateDistance +
      cruiseSpeed * (elapsedSeconds - accelerateTime)
    );
  }
  // 减速段：对称于加速段
  const decelerateTime = accelerateTime;
  const decelerateElapsed = elapsedSeconds - cruiseEnd;
  if (decelerateElapsed >= decelerateTime) {
    return accelerateDistance * 2 + cruiseDistance;
  }
  const remainingSpeed =
    cruiseSpeed - (cruiseSpeed / accelerateTime) * decelerateElapsed;
  return (
    accelerateDistance * 2 +
    cruiseDistance -
    0.5 *
      (cruiseSpeed / accelerateTime) *
      (decelerateElapsed * decelerateElapsed) -
    remainingSpeed * decelerateElapsed
  );
}

export type TripTimeline = {
  /** 每站到站时刻（epoch ms），arrivals[0] = departureAt。 */
  arrivals: number[];
  /** 每站发车时刻（epoch ms），leaves[0] = departureAt，其余 = arrival + dwell。 */
  leaves: number[];
};

/**
 * 由发车时刻和逐站累计到站秒数（p50Seconds）构建班次时间轴。
 */
export function busTripTimeline(
  departureAt: number,
  p50Seconds: readonly number[],
  dwellMilliseconds: number,
): TripTimeline {
  const arrivals = p50Seconds.map((seconds) => departureAt + seconds * 1000);
  const leaves = arrivals.map((arrival, index) =>
    index === 0 ? departureAt : arrival + dwellMilliseconds,
  );
  return { arrivals, leaves };
}
