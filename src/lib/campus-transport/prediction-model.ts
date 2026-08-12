import {
  getCampusBusPredictionTimeBand,
  getCampusBusScheduledArrivals,
  getHongKongDateKey,
  type CampusBusRoute,
  type CampusBusPredictionTimeBand,
} from "@/lib/campus-transport/campus-bus";

export const CAMPUS_BUS_MODEL_ALGORITHM = "robust_empirical_bayes_residual_v1";

const DEFAULT_CANDIDATE_WINDOW_SECONDS = 15 * 60;
const DEFAULT_LIKELIHOOD_SCALE_SECONDS = 3 * 60;

export type ArrivalObservationForModel = {
  id: string;
  routeId: string;
  stopOccurrenceId: string;
  observedArrivalAt: Date;
  receivedAt: Date;
  candidatePatternId: string | null;
  candidateDepartureAt: Date | null;
};

export type TripMatchCandidate = {
  observationId: string;
  patternId: string;
  scheduledDepartureAt: Date;
  baselineArrivalAt: Date;
  probability: number;
  rank: number;
};

export type ReconstructedArrivalEvent = {
  eventKey: string;
  routeId: string;
  patternId: string;
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

export type PredictionTimeBand = CampusBusPredictionTimeBand;

export type CampusBusPredictionAdjustment = {
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

export type CandidateModel = {
  algorithm: typeof CAMPUS_BUS_MODEL_ALGORITHM;
  adjustments: CampusBusPredictionAdjustment[];
  evaluation: ModelEvaluation;
  shouldPromote: boolean;
  trainingEventCount: number;
  trainingServiceDayCount: number;
  validationEventCount: number;
  validationServiceDates: string[];
};

export type ModelOptions = {
  candidateWindowSeconds?: number;
  likelihoodScaleSeconds?: number;
  minEvents?: number;
  minServiceDays?: number;
  priorStrength?: number;
};

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

export function predictionTimeBand(timestamp: number): PredictionTimeBand {
  return getCampusBusPredictionTimeBand(timestamp);
}

function candidateKey(
  routeId: string,
  patternId: string,
  stopOccurrenceId: string,
  departureAt: number,
) {
  return `${routeId}|${patternId}|${stopOccurrenceId}|${new Date(departureAt).toISOString()}`;
}

export function reconstructArrivalEvidence(
  observations: ArrivalObservationForModel[],
  routes: CampusBusRoute[],
  options: ModelOptions = {},
) {
  const candidateWindowSeconds =
    options.candidateWindowSeconds ?? DEFAULT_CANDIDATE_WINDOW_SECONDS;
  const likelihoodScaleSeconds =
    options.likelihoodScaleSeconds ?? DEFAULT_LIKELIHOOD_SCALE_SECONDS;
  const routeById = new Map(routes.map((route) => [route.routeId, route]));
  const candidates: TripMatchCandidate[] = [];
  const matched = new Map<
    string,
    Array<{
      observation: ArrivalObservationForModel;
      candidate: TripMatchCandidate;
    }>
  >();

  for (const observation of observations) {
    const route = routeById.get(observation.routeId);
    if (!route) continue;
    const scheduled = getCampusBusScheduledArrivals(
      route,
      observation.stopOccurrenceId,
      observation.observedArrivalAt.getTime(),
    )
      .map((arrival) => {
        const distanceSeconds = Math.abs(
          observation.observedArrivalAt.getTime() / 1_000 -
            arrival.arrivalAt / 1_000,
        );
        const contextMatches =
          observation.candidatePatternId === arrival.patternId &&
          observation.candidateDepartureAt?.getTime() === arrival.departureAt;
        return {
          arrival,
          contextMatches,
          distanceSeconds,
          likelihood:
            Math.exp(-0.5 * (distanceSeconds / likelihoodScaleSeconds) ** 2) *
            (contextMatches ? 1.5 : 1),
        };
      })
      .filter(
        (candidate) =>
          candidate.distanceSeconds <= candidateWindowSeconds ||
          candidate.contextMatches,
      )
      .sort((left, right) => right.likelihood - left.likelihood);
    const likelihoodTotal = scheduled.reduce(
      (total, candidate) => total + candidate.likelihood,
      0,
    );
    if (likelihoodTotal <= 0) continue;

    const observationCandidates = scheduled.map((candidate, index) => ({
      observationId: observation.id,
      patternId: candidate.arrival.patternId,
      scheduledDepartureAt: new Date(candidate.arrival.departureAt),
      baselineArrivalAt: new Date(candidate.arrival.arrivalAt),
      probability: candidate.likelihood / likelihoodTotal,
      rank: index + 1,
    }));
    candidates.push(...observationCandidates);

    const top = observationCandidates[0];
    const second = observationCandidates[1];
    const uniquelyMatched =
      top &&
      top.probability >= 0.6 &&
      (!second || top.probability - second.probability >= 0.15);
    if (!uniquelyMatched) continue;

    const key = candidateKey(
      route.routeId,
      top.patternId,
      observation.stopOccurrenceId,
      top.scheduledDepartureAt.getTime(),
    );
    const group = matched.get(key) ?? [];
    group.push({ observation, candidate: top });
    matched.set(key, group);
  }

  const events: ReconstructedArrivalEvent[] = [...matched.entries()].map(
    ([eventKey, observationsForEvent]) => {
      const first = observationsForEvent[0];
      const observedAt = median(
        observationsForEvent.map(({ observation }) =>
          observation.observedArrivalAt.getTime(),
        ),
      );
      const averageProbability =
        observationsForEvent.reduce(
          (total, item) => total + item.candidate.probability,
          0,
        ) / observationsForEvent.length;
      const confidence = Math.min(
        0.99,
        averageProbability + Math.log2(observationsForEvent.length) * 0.05,
      );
      return {
        eventKey,
        routeId: first.observation.routeId,
        patternId: first.candidate.patternId,
        stopOccurrenceId: first.observation.stopOccurrenceId,
        scheduledDepartureAt: first.candidate.scheduledDepartureAt,
        baselineArrivalAt: first.candidate.baselineArrivalAt,
        observedArrivalAt: new Date(observedAt),
        serviceDate: getHongKongDateKey(observedAt),
        residualSeconds: Math.round(
          (observedAt - first.candidate.baselineArrivalAt.getTime()) / 1_000,
        ),
        observationIds: observationsForEvent.map(
          ({ observation }) => observation.id,
        ),
        observationCount: observationsForEvent.length,
        confidence,
      };
    },
  );

  return { candidates, events };
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
  options: ModelOptions,
) {
  const minEvents = options.minEvents ?? 10;
  const minServiceDays = options.minServiceDays ?? 5;
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
    if (groupedEvents.length < minEvents || serviceDayCount < minServiceDays) {
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

export function findPredictionAdjustment(
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

export function trainCandidateModel(
  events: ReconstructedArrivalEvent[],
  options: ModelOptions = {},
): CandidateModel {
  const serviceDays = [
    ...new Set(events.map((event) => event.serviceDate)),
  ].sort();
  const validationDayCount = Math.max(1, Math.ceil(serviceDays.length * 0.2));
  const validationDays = new Set(serviceDays.slice(-validationDayCount));
  const trainingEvents = events.filter(
    (event) => !validationDays.has(event.serviceDate),
  );
  const validationEvents = events.filter((event) =>
    validationDays.has(event.serviceDate),
  );
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
    validationServiceDates: [...validationDays],
  };
}

export function applyPredictionAdjustments(
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
