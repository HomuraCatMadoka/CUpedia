import {
  findCampusBusRouteRevisionForServiceDate,
  getCampusBusPredictionTimeBand,
  getCampusBusScheduledArrivals,
  getHongKongDateKey,
  type CampusBusRoute,
  type CampusBusPredictionTimeBand,
} from "@/lib/campus-transport/campus-bus";

export const CAMPUS_BUS_MODEL_ALGORITHM =
  "trajectory_matched_robust_empirical_bayes_residual_v2";

const DEFAULT_CANDIDATE_WINDOW_SECONDS = 15 * 60;
const DEFAULT_LIKELIHOOD_SCALE_SECONDS = 3 * 60;
const DEFAULT_DUPLICATE_WINDOW_SECONDS = 90;
const MINIMUM_SEGMENT_SECONDS = 10;

export const CAMPUS_BUS_MODEL_PUBLICATION_THRESHOLDS = {
  minEvents: 10,
  minServiceDays: 5,
} as const;

export type ArrivalObservationForModel = {
  candidatePatternRevisionId?: string | null;
  candidateScheduledDepartureAt?: Date | null;
  id: string;
  predictionModelRevisionId?: string | null;
  routeId: string;
  stopOccurrenceId: string;
  observedArrivalAt: Date;
  receivedAt: Date;
};

type TripMatchCandidate = {
  baselineArrivalAt: Date;
  observationId: string;
  patternId: string;
  patternRevisionId: string;
  probability: number;
  rank: number;
  routeRevisionId: string;
  scheduledDepartureAt: Date;
  serviceDate: string;
};

type ReconstructedArrivalEvent = {
  eventKey: string;
  trajectoryId: string;
  routeId: string;
  routeRevisionId: string;
  patternId: string;
  patternRevisionId: string;
  stopOccurrenceId: string;
  scheduledDepartureAt: Date;
  baselineArrivalAt: Date;
  observedArrivalAt: Date;
  serviceDate: string;
  residualSeconds: number;
  observationIds: string[];
  observationCount: number;
  confidence: number;
};

type ArrivalEvidenceExclusionReason =
  | "ambiguous_trip"
  | "no_trip_candidate"
  | "origin_without_departure_evidence"
  | "route_revision_not_found"
  | "stop_occurrence_not_found";

type ArrivalEvidenceExclusion = {
  observationIds: string[];
  reason: ArrivalEvidenceExclusionReason;
  routeId: string;
  serviceDate: string;
};

type ReconstructedArrivalTrajectory = {
  candidatePatternRevisionIds: string[];
  id: string;
  observationIds: string[];
  patternId: string | null;
  patternRevisionId: string | null;
  routeId: string;
  routeRevisionId: string;
  scheduledDepartureAt: Date | null;
  serviceDate: string;
  status: "ambiguous" | "matched";
  stops: Array<{
    observationIds: string[];
    stopOccurrenceId: string;
  }>;
};

type PredictionTimeBand = CampusBusPredictionTimeBand;

type CampusBusPredictionAdjustment = {
  routeId: string;
  patternId: string;
  stopOccurrenceId: string;
  timeBand: PredictionTimeBand;
  residualSeconds: number;
  eventCount: number;
  serviceDayCount: number;
  medianResidualSeconds: number;
  medianAbsoluteDeviationSeconds: number;
  shrinkageWeight: number;
};

export type ModelEvaluation = {
  eventCount: number;
  baselineMaeSeconds: number | null;
  baselineP90Seconds: number | null;
  candidateMaeSeconds: number | null;
  candidateP90Seconds: number | null;
};

type StoredPredictionAdjustment = Omit<
  CampusBusPredictionAdjustment,
  "timeBand"
> & { timeBand: string };

export function predictionAdjustmentFromStorage(
  row: StoredPredictionAdjustment,
): CampusBusPredictionAdjustment {
  return {
    routeId: row.routeId,
    patternId: row.patternId,
    stopOccurrenceId: row.stopOccurrenceId,
    timeBand: row.timeBand as PredictionTimeBand,
    residualSeconds: row.residualSeconds,
    eventCount: row.eventCount,
    serviceDayCount: row.serviceDayCount,
    medianResidualSeconds: row.medianResidualSeconds,
    medianAbsoluteDeviationSeconds: row.medianAbsoluteDeviationSeconds,
    shrinkageWeight: row.shrinkageWeight,
  };
}

export function candidateBeatsChampion(
  candidate: ModelEvaluation,
  champion: ModelEvaluation,
) {
  return Boolean(
    candidate.candidateMaeSeconds !== null &&
    candidate.candidateP90Seconds !== null &&
    champion.candidateMaeSeconds !== null &&
    champion.candidateP90Seconds !== null &&
    candidate.candidateMaeSeconds < champion.candidateMaeSeconds &&
    candidate.candidateP90Seconds <= champion.candidateP90Seconds + 30,
  );
}

type CandidateModel = {
  algorithm: typeof CAMPUS_BUS_MODEL_ALGORITHM;
  adjustments: CampusBusPredictionAdjustment[];
  evaluation: ModelEvaluation;
  shouldPromote: boolean;
  trainingEventCount: number;
  trainingServiceDayCount: number;
  validationEventCount: number;
  validationServiceDates: string[];
};

type ArrivalEvidenceOptions = {
  candidateWindowSeconds?: number;
  likelihoodScaleSeconds?: number;
};

type CandidateTrainingOptions = {
  priorStrength?: number;
};

export function eventsForRouteRevisions(
  events: ReconstructedArrivalEvent[],
  routes: CampusBusRoute[],
) {
  const currentRevisionIds = new Set(
    routes.map((route) => route.routeRevisionId),
  );
  return events.filter((event) =>
    currentRevisionIds.has(event.routeRevisionId),
  );
}

function median(values: number[]) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function percentile(values: number[], percentileValue: number) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(percentileValue * sorted.length) - 1),
  );
  return sorted[index];
}

function predictionTimeBand(timestamp: number): PredictionTimeBand {
  return getCampusBusPredictionTimeBand(timestamp);
}

function candidateKey(
  routeRevisionId: string,
  patternRevisionId: string,
  departureAt: number,
) {
  return `${routeRevisionId}|${patternRevisionId}|${new Date(departureAt).toISOString()}`;
}

type ResolvedObservation = {
  observation: ArrivalObservationForModel;
  route: CampusBusRoute;
  serviceDate: string;
};

type InternalTripCandidate = TripMatchCandidate & {
  likelihood: number;
  stopIndex: number;
};

type ObservationCluster = {
  candidates: InternalTripCandidate[];
  id: string;
  observedAt: number;
  observations: ArrivalObservationForModel[];
  route: CampusBusRoute;
  serviceDate: string;
  stopOccurrenceId: string;
};

type TrajectoryWork = {
  clusters: ObservationCluster[];
  id: string;
  possibleTripKeys: Set<string>;
  route: CampusBusRoute;
  serviceDate: string;
};

function clusterObservations(
  observations: ResolvedObservation[],
  duplicateWindowSeconds: number,
) {
  const groups = new Map<string, ResolvedObservation[]>();
  for (const item of observations) {
    const key = `${item.route.routeRevisionId}|${item.serviceDate}|${item.observation.stopOccurrenceId}`;
    const group = groups.get(key) ?? [];
    group.push(item);
    groups.set(key, group);
  }

  const clusters: ObservationCluster[] = [];
  for (const group of groups.values()) {
    group.sort(
      (left, right) =>
        left.observation.observedArrivalAt.getTime() -
          right.observation.observedArrivalAt.getTime() ||
        left.observation.id.localeCompare(right.observation.id),
    );
    let pending: ResolvedObservation[] = [];
    for (const item of group) {
      const clusterStartedAt =
        pending[0]?.observation.observedArrivalAt.getTime();
      if (
        clusterStartedAt !== undefined &&
        item.observation.observedArrivalAt.getTime() - clusterStartedAt >
          duplicateWindowSeconds * 1_000
      ) {
        const first = pending[0];
        clusters.push({
          candidates: [],
          id: first.observation.id,
          observedAt: median(
            pending.map((entry) =>
              entry.observation.observedArrivalAt.getTime(),
            ),
          ),
          observations: pending.map((entry) => entry.observation),
          route: first.route,
          serviceDate: first.serviceDate,
          stopOccurrenceId: first.observation.stopOccurrenceId,
        });
        pending = [];
      }
      pending.push(item);
    }
    if (pending.length > 0) {
      const first = pending[0];
      clusters.push({
        candidates: [],
        id: first.observation.id,
        observedAt: median(
          pending.map((entry) => entry.observation.observedArrivalAt.getTime()),
        ),
        observations: pending.map((entry) => entry.observation),
        route: first.route,
        serviceDate: first.serviceDate,
        stopOccurrenceId: first.observation.stopOccurrenceId,
      });
    }
  }
  return clusters.sort(
    (left, right) =>
      left.observedAt - right.observedAt || left.id.localeCompare(right.id),
  );
}

function tripKey(candidate: TripMatchCandidate) {
  return candidateKey(
    candidate.routeRevisionId,
    candidate.patternRevisionId,
    candidate.scheduledDepartureAt.getTime(),
  );
}

function commonTripKeys(left: Set<string>, right: InternalTripCandidate[]) {
  return new Set(right.map(tripKey).filter((key) => left.has(key)));
}

function candidateCanFollow(
  previous: ObservationCluster,
  current: ObservationCluster,
  tripCandidateKey: string,
) {
  const observedSeconds = (current.observedAt - previous.observedAt) / 1_000;
  const previousCandidate = previous.candidates.find(
    (candidate) => tripKey(candidate) === tripCandidateKey,
  );
  const currentCandidate = current.candidates.find(
    (candidate) => tripKey(candidate) === tripCandidateKey,
  );
  if (!previousCandidate || !currentCandidate) return false;
  if (currentCandidate.stopIndex <= previousCandidate.stopIndex) return false;
  const baselineSeconds =
    (currentCandidate.baselineArrivalAt.getTime() -
      previousCandidate.baselineArrivalAt.getTime()) /
    1_000;
  if (baselineSeconds <= 0) return false;
  const minimumSeconds = Math.max(
    MINIMUM_SEGMENT_SECONDS,
    baselineSeconds * 0.25,
  );
  const maximumSeconds = Math.max(8 * 60, baselineSeconds * 3 + 5 * 60);
  return observedSeconds >= minimumSeconds && observedSeconds <= maximumSeconds;
}

function feasibleFollowingTripKeys(
  previous: ObservationCluster,
  current: ObservationCluster,
  sharedTripKeys: Set<string>,
) {
  return new Set(
    [...sharedTripKeys].filter((key) =>
      candidateCanFollow(previous, current, key),
    ),
  );
}

function buildTrajectories(clusters: ObservationCluster[]) {
  const trajectories: TrajectoryWork[] = [];
  for (const cluster of clusters) {
    const compatible = trajectories
      .filter(
        (trajectory) =>
          trajectory.route.routeRevisionId === cluster.route.routeRevisionId &&
          trajectory.serviceDate === cluster.serviceDate,
      )
      .map((trajectory) => {
        const shared = commonTripKeys(
          trajectory.possibleTripKeys,
          cluster.candidates,
        );
        const previous = trajectory.clusters.at(-1)!;
        const feasible = feasibleFollowingTripKeys(previous, cluster, shared);
        return {
          feasible,
          trajectory,
          valid: feasible.size > 0,
        };
      })
      .filter((candidate) => candidate.valid)
      .sort(
        (left, right) =>
          right.trajectory.clusters.at(-1)!.observedAt -
          left.trajectory.clusters.at(-1)!.observedAt,
      );
    const selected = compatible[0];
    if (selected) {
      selected.trajectory.clusters.push(cluster);
      selected.trajectory.possibleTripKeys = selected.feasible;
      continue;
    }
    trajectories.push({
      clusters: [cluster],
      id: `${cluster.route.routeRevisionId}|${cluster.serviceDate}|${trajectories.length + 1}`,
      possibleTripKeys: new Set(cluster.candidates.map(tripKey)),
      route: cluster.route,
      serviceDate: cluster.serviceDate,
    });
  }
  return trajectories;
}

function trajectoryProbabilities(
  trajectory: TrajectoryWork,
  likelihoodScaleSeconds: number,
  candidateWindowSeconds: number,
) {
  const scored = [...trajectory.possibleTripKeys].flatMap((key) => {
    const candidates = trajectory.clusters.map((cluster) =>
      cluster.candidates.find((candidate) => tripKey(candidate) === key),
    );
    if (candidates.some((candidate) => !candidate)) return [];
    const complete = candidates as InternalTripCandidate[];
    const impossibleDownstreamArrival = complete.some(
      (candidate, index) =>
        candidate.stopIndex > 0 &&
        candidate.scheduledDepartureAt.getTime() >
          trajectory.clusters[index].observedAt,
    );
    if (impossibleDownstreamArrival) return [];
    const residuals = complete.map(
      (candidate, index) =>
        (trajectory.clusters[index].observedAt -
          candidate.baselineArrivalAt.getTime()) /
        1_000,
    );
    const center = median(residuals);
    const consistencyPenalty = residuals.reduce(
      (sum, residual) =>
        sum - 0.5 * ((residual - center) / likelihoodScaleSeconds) ** 2,
      0,
    );
    const schedulePenalty =
      -0.5 * (center / Math.max(candidateWindowSeconds, 1)) ** 2;
    const contextBonus = complete.reduce((bonus, candidate, index) => {
      const observations = trajectory.clusters[index].observations;
      const exact = observations.some(
        (observation) =>
          observation.candidatePatternRevisionId ===
            candidate.patternRevisionId &&
          observation.candidateScheduledDepartureAt?.getTime() ===
            candidate.scheduledDepartureAt.getTime(),
      );
      const pattern = observations.some(
        (observation) =>
          observation.candidatePatternRevisionId ===
          candidate.patternRevisionId,
      );
      return bonus + (exact ? Math.log(2) : pattern ? Math.log(1.25) : 0);
    }, 0);
    return [
      { key, score: consistencyPenalty + schedulePenalty + contextBonus },
    ];
  });
  if (scored.length === 0) return [];
  const maximumScore = Math.max(...scored.map((candidate) => candidate.score));
  const weighted = scored.map((candidate) => ({
    ...candidate,
    weight: Math.exp(candidate.score - maximumScore),
  }));
  const total = weighted.reduce((sum, candidate) => sum + candidate.weight, 0);
  return weighted
    .map((candidate) => ({
      key: candidate.key,
      probability: candidate.weight / total,
    }))
    .sort(
      (left, right) =>
        right.probability - left.probability ||
        left.key.localeCompare(right.key),
    );
}

type TrajectoryAssessment = {
  probabilities: ReturnType<typeof trajectoryProbabilities>;
  trajectory: TrajectoryWork;
};

function uniquelyMatchedTripKey(
  probabilities: ReturnType<typeof trajectoryProbabilities>,
) {
  const top = probabilities[0];
  const second = probabilities[1];
  return top &&
    top.probability >= 0.6 &&
    (!second || top.probability - second.probability >= 0.15)
    ? top.key
    : null;
}

function intersectTripKeys(trajectories: TrajectoryWork[]) {
  const intersection = new Set(trajectories[0]?.possibleTripKeys ?? []);
  for (const trajectory of trajectories.slice(1)) {
    for (const key of intersection) {
      if (!trajectory.possibleTripKeys.has(key)) intersection.delete(key);
    }
  }
  return intersection;
}

function mergeClusterGroup(
  clusters: ObservationCluster[],
  possibleTripKeys: Set<string>,
) {
  const observations = [
    ...new Map(
      clusters
        .flatMap((cluster) => cluster.observations)
        .map((observation) => [observation.id, observation]),
    ).values(),
  ].sort(
    (left, right) =>
      left.observedArrivalAt.getTime() - right.observedArrivalAt.getTime() ||
      left.id.localeCompare(right.id),
  );
  const first = clusters[0];
  return {
    candidates: first.candidates.filter((candidate) =>
      possibleTripKeys.has(tripKey(candidate)),
    ),
    id: observations[0].id,
    observedAt: median(
      observations.map((observation) =>
        observation.observedArrivalAt.getTime(),
      ),
    ),
    observations,
    route: first.route,
    serviceDate: first.serviceDate,
    stopOccurrenceId: first.stopOccurrenceId,
  } satisfies ObservationCluster;
}

function mergeMatchedTripTrajectories(
  assessments: TrajectoryAssessment[],
  likelihoodScaleSeconds: number,
  candidateWindowSeconds: number,
) {
  const grouped = new Map<string, TrajectoryAssessment[]>();
  const normalized: TrajectoryAssessment[] = [];
  for (const assessment of assessments) {
    const matchedTripKey = uniquelyMatchedTripKey(assessment.probabilities);
    if (!matchedTripKey) {
      normalized.push(assessment);
      continue;
    }
    const group = grouped.get(matchedTripKey) ?? [];
    group.push(assessment);
    grouped.set(matchedTripKey, group);
  }

  for (const [matchedTripKey, group] of grouped) {
    if (group.length === 1) {
      normalized.push(group[0]);
      continue;
    }
    const sourceTrajectories = group.map((assessment) => assessment.trajectory);
    let feasibleTripKeys = intersectTripKeys(sourceTrajectories);
    const clustersByStop = new Map<string, ObservationCluster[]>();
    for (const cluster of sourceTrajectories.flatMap(
      (trajectory) => trajectory.clusters,
    )) {
      const clusters = clustersByStop.get(cluster.stopOccurrenceId) ?? [];
      clusters.push(cluster);
      clustersByStop.set(cluster.stopOccurrenceId, clusters);
    }
    const clusters = [...clustersByStop.values()]
      .map((clusterGroup) => mergeClusterGroup(clusterGroup, feasibleTripKeys))
      .sort((left, right) => {
        const leftIndex = left.candidates.find(
          (candidate) => tripKey(candidate) === matchedTripKey,
        )?.stopIndex;
        const rightIndex = right.candidates.find(
          (candidate) => tripKey(candidate) === matchedTripKey,
        )?.stopIndex;
        return (
          (leftIndex ?? Number.MAX_SAFE_INTEGER) -
            (rightIndex ?? Number.MAX_SAFE_INTEGER) ||
          left.observedAt - right.observedAt ||
          left.id.localeCompare(right.id)
        );
      });
    for (let index = 1; index < clusters.length; index += 1) {
      feasibleTripKeys = feasibleFollowingTripKeys(
        clusters[index - 1],
        clusters[index],
        feasibleTripKeys,
      );
    }
    const first = sourceTrajectories[0];
    const trajectory: TrajectoryWork = {
      clusters,
      id: sourceTrajectories
        .map((candidate) => candidate.id)
        .sort((left, right) => left.localeCompare(right))[0],
      possibleTripKeys:
        feasibleTripKeys.size > 0
          ? feasibleTripKeys
          : intersectTripKeys(sourceTrajectories),
      route: first.route,
      serviceDate: first.serviceDate,
    };
    normalized.push({
      probabilities:
        feasibleTripKeys.size > 0
          ? trajectoryProbabilities(
              trajectory,
              likelihoodScaleSeconds,
              candidateWindowSeconds,
            )
          : [],
      trajectory,
    });
  }

  return normalized.sort(
    (left, right) =>
      left.trajectory.clusters[0].observedAt -
        right.trajectory.clusters[0].observedAt ||
      left.trajectory.id.localeCompare(right.trajectory.id),
  );
}

export function reconstructArrivalEvidence(
  observations: ArrivalObservationForModel[],
  routes: CampusBusRoute[],
  options: ArrivalEvidenceOptions = {},
) {
  const candidateWindowSeconds =
    options.candidateWindowSeconds ?? DEFAULT_CANDIDATE_WINDOW_SECONDS;
  const likelihoodScaleSeconds =
    options.likelihoodScaleSeconds ?? DEFAULT_LIKELIHOOD_SCALE_SECONDS;
  const candidates: TripMatchCandidate[] = [];
  const events: ReconstructedArrivalEvent[] = [];
  const exclusions: ArrivalEvidenceExclusion[] = [];
  const resolved: ResolvedObservation[] = [];

  for (const observation of observations) {
    const serviceDate = getHongKongDateKey(
      observation.observedArrivalAt.getTime(),
    );
    const route = findCampusBusRouteRevisionForServiceDate(
      routes,
      observation.routeId,
      serviceDate,
    );
    if (!route) {
      exclusions.push({
        observationIds: [observation.id],
        reason: "route_revision_not_found",
        routeId: observation.routeId,
        serviceDate,
      });
      continue;
    }
    if (
      !route.patterns.some((pattern) =>
        pattern.projections.some(
          (projection) =>
            projection.stopOccurrenceId === observation.stopOccurrenceId,
        ),
      )
    ) {
      exclusions.push({
        observationIds: [observation.id],
        reason: "stop_occurrence_not_found",
        routeId: observation.routeId,
        serviceDate,
      });
      continue;
    }
    resolved.push({ observation, route, serviceDate });
  }

  const clusters = clusterObservations(
    resolved,
    DEFAULT_DUPLICATE_WINDOW_SECONDS,
  );
  for (const cluster of clusters) {
    const scheduled = getCampusBusScheduledArrivals(
      cluster.route,
      cluster.stopOccurrenceId,
      cluster.observedAt,
    )
      .map((arrival) => {
        const distanceSeconds = Math.abs(
          cluster.observedAt / 1_000 - arrival.arrivalAt / 1_000,
        );
        const pattern = cluster.route.patterns.find(
          (candidate) => candidate.revisionId === arrival.patternRevisionId,
        )!;
        const stopIndex = pattern.projections.findIndex(
          (projection) =>
            projection.stopOccurrenceId === cluster.stopOccurrenceId,
        );
        const contextMultiplier = cluster.observations.some(
          (observation) =>
            observation.candidatePatternRevisionId ===
              arrival.patternRevisionId &&
            observation.candidateScheduledDepartureAt?.getTime() ===
              arrival.departureAt,
        )
          ? 2
          : cluster.observations.some(
                (observation) =>
                  observation.candidatePatternRevisionId ===
                  arrival.patternRevisionId,
              )
            ? 1.25
            : 1;
        return {
          arrival,
          distanceSeconds,
          likelihood:
            Math.exp(-0.5 * (distanceSeconds / likelihoodScaleSeconds) ** 2) *
            contextMultiplier,
          stopIndex,
        };
      })
      .filter(
        (candidate) => candidate.distanceSeconds <= candidateWindowSeconds,
      )
      .sort((left, right) => right.likelihood - left.likelihood);
    const likelihoodTotal = scheduled.reduce(
      (total, candidate) => total + candidate.likelihood,
      0,
    );
    if (likelihoodTotal <= 0) {
      exclusions.push({
        observationIds: cluster.observations.map(
          (observation) => observation.id,
        ),
        reason: "no_trip_candidate",
        routeId: cluster.route.routeId,
        serviceDate: cluster.serviceDate,
      });
      continue;
    }

    cluster.candidates = scheduled.map((candidate, index) => ({
      baselineArrivalAt: new Date(candidate.arrival.arrivalAt),
      likelihood: candidate.likelihood,
      observationId: cluster.id,
      patternId: candidate.arrival.patternId,
      patternRevisionId: candidate.arrival.patternRevisionId,
      probability: candidate.likelihood / likelihoodTotal,
      rank: index + 1,
      routeRevisionId: cluster.route.routeRevisionId,
      scheduledDepartureAt: new Date(candidate.arrival.departureAt),
      serviceDate: cluster.serviceDate,
      stopIndex: candidate.stopIndex,
    }));
    candidates.push(
      ...cluster.observations.flatMap((observation) =>
        cluster.candidates.map((candidate) => ({
          baselineArrivalAt: candidate.baselineArrivalAt,
          observationId: observation.id,
          patternId: candidate.patternId,
          patternRevisionId: candidate.patternRevisionId,
          probability: candidate.probability,
          rank: candidate.rank,
          routeRevisionId: candidate.routeRevisionId,
          scheduledDepartureAt: candidate.scheduledDepartureAt,
          serviceDate: candidate.serviceDate,
        })),
      ),
    );
  }

  const reconstructedTrajectories: ReconstructedArrivalTrajectory[] = [];
  const trajectoryAssessments = buildTrajectories(
    clusters.filter((cluster) => cluster.candidates.length > 0),
  ).map((trajectory) => ({
    probabilities: trajectoryProbabilities(
      trajectory,
      likelihoodScaleSeconds,
      candidateWindowSeconds,
    ),
    trajectory,
  }));
  for (const { probabilities, trajectory } of mergeMatchedTripTrajectories(
    trajectoryAssessments,
    likelihoodScaleSeconds,
    candidateWindowSeconds,
  )) {
    const top = probabilities[0];
    const uniquelyMatched = uniquelyMatchedTripKey(probabilities) !== null;
    const selectedCandidate = top
      ? trajectory.clusters[0].candidates.find(
          (candidate) => tripKey(candidate) === top.key,
        )
      : undefined;
    reconstructedTrajectories.push({
      candidatePatternRevisionIds: [
        ...new Set(
          trajectory.clusters[0].candidates
            .filter((candidate) =>
              trajectory.possibleTripKeys.has(tripKey(candidate)),
            )
            .map((candidate) => candidate.patternRevisionId),
        ),
      ].sort(),
      id: trajectory.id,
      observationIds: trajectory.clusters.flatMap((cluster) =>
        cluster.observations.map((observation) => observation.id),
      ),
      patternId: uniquelyMatched
        ? (selectedCandidate?.patternId ?? null)
        : null,
      patternRevisionId: uniquelyMatched
        ? (selectedCandidate?.patternRevisionId ?? null)
        : null,
      routeId: trajectory.route.routeId,
      routeRevisionId: trajectory.route.routeRevisionId,
      scheduledDepartureAt: uniquelyMatched
        ? (selectedCandidate?.scheduledDepartureAt ?? null)
        : null,
      serviceDate: trajectory.serviceDate,
      status: uniquelyMatched ? "matched" : "ambiguous",
      stops: trajectory.clusters.map((cluster) => ({
        observationIds: cluster.observations.map(
          (observation) => observation.id,
        ),
        stopOccurrenceId: cluster.stopOccurrenceId,
      })),
    });
    if (!uniquelyMatched || !top) {
      exclusions.push(
        ...trajectory.clusters.map((cluster) => ({
          observationIds: cluster.observations.map(
            (observation) => observation.id,
          ),
          reason: "ambiguous_trip" as const,
          routeId: trajectory.route.routeId,
          serviceDate: trajectory.serviceDate,
        })),
      );
      continue;
    }
    for (const cluster of trajectory.clusters) {
      const candidate = cluster.candidates.find(
        (item) => tripKey(item) === top.key,
      )!;
      if (candidate.stopIndex === 0) {
        exclusions.push({
          observationIds: cluster.observations.map(
            (observation) => observation.id,
          ),
          reason: "origin_without_departure_evidence",
          routeId: trajectory.route.routeId,
          serviceDate: trajectory.serviceDate,
        });
        continue;
      }
      const eventKey = `${candidate.routeRevisionId}|${candidate.patternRevisionId}|${cluster.stopOccurrenceId}|${candidate.scheduledDepartureAt.toISOString()}`;
      events.push({
        baselineArrivalAt: candidate.baselineArrivalAt,
        confidence: Math.min(
          0.99,
          top.probability + Math.log2(cluster.observations.length) * 0.05,
        ),
        eventKey,
        observationCount: cluster.observations.length,
        observationIds: cluster.observations.map(
          (observation) => observation.id,
        ),
        observedArrivalAt: new Date(cluster.observedAt),
        patternId: candidate.patternId,
        patternRevisionId: candidate.patternRevisionId,
        residualSeconds: Math.round(
          (cluster.observedAt - candidate.baselineArrivalAt.getTime()) / 1_000,
        ),
        routeId: trajectory.route.routeId,
        routeRevisionId: trajectory.route.routeRevisionId,
        scheduledDepartureAt: candidate.scheduledDepartureAt,
        serviceDate: trajectory.serviceDate,
        stopOccurrenceId: cluster.stopOccurrenceId,
        trajectoryId: trajectory.id,
      });
    }
  }

  return {
    candidates,
    events,
    exclusions: exclusions.sort(
      (left, right) =>
        left.serviceDate.localeCompare(right.serviceDate) ||
        left.routeId.localeCompare(right.routeId) ||
        left.observationIds[0].localeCompare(right.observationIds[0]),
    ),
    trajectories: reconstructedTrajectories,
  };
}

function adjustmentKey(
  event: Pick<
    ReconstructedArrivalEvent,
    "routeId" | "patternId" | "stopOccurrenceId"
  >,
  band: PredictionTimeBand,
) {
  return `${event.routeId}|${event.patternId}|${event.stopOccurrenceId}|${band}`;
}

function trainAdjustments(
  events: ReconstructedArrivalEvent[],
  options: CandidateTrainingOptions,
) {
  const priorStrength = options.priorStrength ?? 8;
  const groups = new Map<
    string,
    { band: PredictionTimeBand; events: ReconstructedArrivalEvent[] }
  >();

  for (const event of events) {
    const bands: PredictionTimeBand[] = [
      "all_day",
      predictionTimeBand(event.scheduledDepartureAt.getTime()),
    ];
    for (const band of bands) {
      const key = adjustmentKey(event, band);
      const group = groups.get(key) ?? { band, events: [] };
      group.events.push(event);
      groups.set(key, group);
    }
  }

  return [...groups.values()].flatMap(({ band, events: groupedEvents }) => {
    const serviceDayCount = new Set(
      groupedEvents.map((event) => event.serviceDate),
    ).size;
    if (
      groupedEvents.length <
        CAMPUS_BUS_MODEL_PUBLICATION_THRESHOLDS.minEvents ||
      serviceDayCount < CAMPUS_BUS_MODEL_PUBLICATION_THRESHOLDS.minServiceDays
    ) {
      return [];
    }
    const residuals = groupedEvents.map((event) => event.residualSeconds);
    const medianResidualSeconds = median(residuals);
    const medianAbsoluteDeviationSeconds = median(
      residuals.map((value) => Math.abs(value - medianResidualSeconds)),
    );
    const effectiveEventCount = groupedEvents.reduce(
      (total, event) => total + event.confidence,
      0,
    );
    const shrinkageWeight =
      effectiveEventCount / (effectiveEventCount + priorStrength);
    const residualSeconds = Math.round(
      Math.max(
        -8 * 60,
        Math.min(8 * 60, medianResidualSeconds * shrinkageWeight),
      ),
    );
    const first = groupedEvents[0];
    return [
      {
        routeId: first.routeId,
        patternId: first.patternId,
        stopOccurrenceId: first.stopOccurrenceId,
        timeBand: band,
        residualSeconds,
        eventCount: groupedEvents.length,
        serviceDayCount,
        medianResidualSeconds,
        medianAbsoluteDeviationSeconds,
        shrinkageWeight,
      } satisfies CampusBusPredictionAdjustment,
    ];
  });
}

function findPredictionAdjustment(
  adjustments: CampusBusPredictionAdjustment[],
  event: Pick<
    ReconstructedArrivalEvent,
    "routeId" | "patternId" | "stopOccurrenceId" | "scheduledDepartureAt"
  >,
) {
  const band = predictionTimeBand(event.scheduledDepartureAt.getTime());
  return (
    adjustments.find(
      (adjustment) =>
        adjustment.routeId === event.routeId &&
        adjustment.patternId === event.patternId &&
        adjustment.stopOccurrenceId === event.stopOccurrenceId &&
        adjustment.timeBand === band,
    ) ??
    adjustments.find(
      (adjustment) =>
        adjustment.routeId === event.routeId &&
        adjustment.patternId === event.patternId &&
        adjustment.stopOccurrenceId === event.stopOccurrenceId &&
        adjustment.timeBand === "all_day",
    )
  );
}

export function evaluatePredictionAdjustments(
  events: ReconstructedArrivalEvent[],
  adjustments: CampusBusPredictionAdjustment[],
): ModelEvaluation {
  const baselineErrors = events.map((event) => Math.abs(event.residualSeconds));
  const candidateErrors = events.map((event) => {
    const correction =
      findPredictionAdjustment(adjustments, event)?.residualSeconds ?? 0;
    return Math.abs(event.residualSeconds - correction);
  });
  return {
    eventCount: events.length,
    baselineMaeSeconds:
      baselineErrors.length > 0
        ? baselineErrors.reduce((sum, value) => sum + value, 0) /
          baselineErrors.length
        : null,
    baselineP90Seconds: percentile(baselineErrors, 0.9),
    candidateMaeSeconds:
      candidateErrors.length > 0
        ? candidateErrors.reduce((sum, value) => sum + value, 0) /
          candidateErrors.length
        : null,
    candidateP90Seconds: percentile(candidateErrors, 0.9),
  };
}

export function splitModelEventsByValidationDays<
  Event extends { serviceDate: string },
>(events: Event[]) {
  const serviceDays = [
    ...new Set(events.map((event) => event.serviceDate)),
  ].sort();
  const validationDayCount =
    serviceDays.length === 0
      ? 0
      : Math.max(1, Math.ceil(serviceDays.length * 0.2));
  const validationDays = new Set(serviceDays.slice(-validationDayCount));
  return {
    trainingEvents: events.filter(
      (event) => !validationDays.has(event.serviceDate),
    ),
    validationEvents: events.filter((event) =>
      validationDays.has(event.serviceDate),
    ),
  };
}

export function trainCandidateModel(
  events: ReconstructedArrivalEvent[],
  options: CandidateTrainingOptions = {},
): CandidateModel {
  const { trainingEvents, validationEvents } =
    splitModelEventsByValidationDays(events);
  const validationAdjustments = trainAdjustments(trainingEvents, options);
  const evaluation = evaluatePredictionAdjustments(
    validationEvents,
    validationAdjustments,
  );
  const hasComparableEvaluation =
    validationAdjustments.length > 0 &&
    evaluation.baselineMaeSeconds !== null &&
    evaluation.candidateMaeSeconds !== null &&
    evaluation.baselineP90Seconds !== null &&
    evaluation.candidateP90Seconds !== null;
  const shouldPromote = Boolean(
    hasComparableEvaluation &&
    evaluation.candidateMaeSeconds! < evaluation.baselineMaeSeconds! &&
    evaluation.candidateP90Seconds! <= evaluation.baselineP90Seconds! + 30,
  );

  return {
    algorithm: CAMPUS_BUS_MODEL_ALGORITHM,
    adjustments: trainAdjustments(events, options),
    evaluation,
    shouldPromote,
    trainingEventCount: trainingEvents.length,
    trainingServiceDayCount: new Set(
      trainingEvents.map((event) => event.serviceDate),
    ).size,
    validationEventCount: validationEvents.length,
    validationServiceDates: [
      ...new Set(validationEvents.map((event) => event.serviceDate)),
    ].sort(),
  };
}

function applyPredictionAdjustments(
  route: CampusBusRoute,
  adjustments: CampusBusPredictionAdjustment[],
  modelRevisionId: string,
) {
  return {
    ...route,
    predictionRevisionId: modelRevisionId,
    patterns: route.patterns.map((pattern) => ({
      ...pattern,
      projections: pattern.projections.map((projection) => {
        const routeAdjustments = adjustments.filter(
          (adjustment) =>
            adjustment.routeId === route.routeId &&
            adjustment.patternId === pattern.id &&
            adjustment.stopOccurrenceId === projection.stopOccurrenceId,
        );
        return {
          ...projection,
          timeBandAdjustments: routeAdjustments.map((adjustment) => ({
            residualSeconds: adjustment.residualSeconds,
            timeBand: adjustment.timeBand,
          })),
          p50Seconds: projection.p50Seconds,
        };
      }),
    })),
  } satisfies CampusBusRoute;
}

export function applyPredictionAdjustmentsToRoutes(
  routes: CampusBusRoute[],
  adjustments: CampusBusPredictionAdjustment[],
  modelRevisionId: string,
) {
  return routes.map((route) =>
    applyPredictionAdjustments(route, adjustments, modelRevisionId),
  );
}
