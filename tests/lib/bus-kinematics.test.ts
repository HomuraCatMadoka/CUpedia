import { describe, expect, it } from "vitest";

import {
  busTripTimeline,
  positionAlongSegment,
  solveTrapezoidProfile,
} from "@/lib/campus-transport/bus-kinematics";

// ref #601 — trapezoid velocity profile for estimated bus positions.
// Verified against the 1A cold-start data (see plan): stop 1→2 is L≈365 m in
// T≈111 s; with A=0.8 m/s² the profile cruises at ≈3.42 m/s with a ~96%
// cruise segment share.

const DWELL_MS = 30_000;

describe("solveTrapezoidProfile", () => {
  it("solves the verified 1A segment (L=365, T=111, A=0.8)", () => {
    const profile = solveTrapezoidProfile(365, 111, 0.8);
    expect(profile.feasible).toBe(true);
    expect(profile.cruiseSpeed).toBeCloseTo(3.42, 2);
    const cruiseShare = profile.cruiseDistance / 365;
    expect(cruiseShare).toBeGreaterThan(0.9);
  });

  it("returns a triangular fallback when the time is too short", () => {
    // T=20 s for L=365 m needs A ≥ 4L/T² = 3.65, so A=0.8 is infeasible
    const profile = solveTrapezoidProfile(365, 20, 0.8);
    expect(profile.feasible).toBe(false);
    expect(profile.cruiseDistance).toBe(0);
    expect(profile.accelerateDistance).toBeGreaterThan(0);
    expect(profile.accelerateTime).toBeGreaterThan(0);
  });

  it("degenerates to zero motion for zero distance", () => {
    const profile = solveTrapezoidProfile(0, 111, 0.8);
    expect(profile.cruiseSpeed).toBe(0);
    expect(profile.accelerateTime).toBe(0);
    expect(profile.cruiseDistance).toBe(0);
  });

  it("keeps acceleration bounded by the trapezoid geometry", () => {
    // L=1000 m, T=300 s: cruise must stay below A*T/2
    const profile = solveTrapezoidProfile(1000, 300, 0.8);
    expect(profile.feasible).toBe(true);
    expect(profile.cruiseSpeed).toBeLessThan((0.8 * 300) / 2);
    expect(profile.cruiseSpeed).toBeGreaterThan(0);
  });
});

describe("positionAlongSegment", () => {
  const A = 0.8;
  const L = 365;
  const T = 111;
  const profile = solveTrapezoidProfile(L, T, A);

  it("starts at zero", () => {
    expect(positionAlongSegment(0, profile)).toBe(0);
  });

  it("reaches the full distance at the end of the segment", () => {
    expect(positionAlongSegment(T, profile)).toBeCloseTo(L, 6);
  });

  it("is monotonic and within bounds for all sampled times", () => {
    let previous = 0;
    for (let t = 0; t <= T; t += 5) {
      const position = positionAlongSegment(t, profile);
      expect(position).toBeGreaterThanOrEqual(previous - 1e-6);
      expect(position).toBeLessThanOrEqual(L + 1e-6);
      previous = position;
    }
  });

  it("matches the accelerate-distance at the end of acceleration", () => {
    const tAcc = profile.accelerateTime;
    expect(positionAlongSegment(tAcc, profile)).toBeCloseTo(
      profile.accelerateDistance,
      6,
    );
  });
});

describe("busTripTimeline", () => {
  const departureAt = new Date("2026-08-13T07:40:00+08:00").getTime();
  const p50 = [0, 111, 221, 326, 471, 581];

  it("builds arrival/leave times from cumulative p50 seconds", () => {
    const { arrivals, leaves } = busTripTimeline(departureAt, p50, DWELL_MS);
    expect(arrivals[0]).toBe(departureAt);
    expect(leaves[0]).toBe(departureAt);
    expect(arrivals[1]).toBe(departureAt + 111_000);
    expect(leaves[1]).toBe(departureAt + 111_000 + DWELL_MS);
    expect(arrivals[5]).toBe(departureAt + 581_000);
  });

  it("applies dwell after every stop except the terminus", () => {
    const { arrivals, leaves } = busTripTimeline(departureAt, p50, DWELL_MS);
    for (let index = 0; index < arrivals.length; index += 1) {
      if (index === 0) {
        expect(leaves[index]).toBe(arrivals[index]);
      } else {
        expect(leaves[index]).toBe(arrivals[index] + DWELL_MS);
      }
    }
  });

  it("handles an empty p50 array", () => {
    const { arrivals, leaves } = busTripTimeline(departureAt, [], DWELL_MS);
    expect(arrivals).toEqual([]);
    expect(leaves).toEqual([]);
  });
});
