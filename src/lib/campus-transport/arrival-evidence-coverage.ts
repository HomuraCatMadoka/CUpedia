import {
  findCampusBusRouteRevisionForServiceDate,
  getHongKongDateKey,
  type CampusBusPattern,
  type CampusBusRoute,
} from "@/lib/campus-transport/campus-bus";
import {
  CAMPUS_BUS_MODEL_PUBLICATION_THRESHOLDS,
  reconstructArrivalEvidence,
  splitModelEventsByValidationDays,
  type ArrivalObservationForModel,
} from "@/lib/campus-transport/prediction-model";

export type ArrivalEvidenceCoverageRow = {
  ambiguityRate: number;
  coverageKey: string;
  dimension: "pattern" | "route" | "segment" | "stop";
  highlightedRevisionGap: boolean;
  independentEventCount: number;
  label: string;
  observationCount: number;
  patternId: string | null;
  patternRevisionId: string | null;
  routeCode: string;
  routeId: string;
  routeRevisionId: string;
  serviceDayCount: number;
  serviceDayDeficit: number;
  stopOccurrenceId: string | null;
  eventDeficit: number;
};

type Replay = ReturnType<typeof reconstructArrivalEvidence>;

type MutableCoverageRow = Omit<
  ArrivalEvidenceCoverageRow,
  | "ambiguityRate"
  | "independentEventCount"
  | "observationCount"
  | "serviceDayCount"
  | "serviceDayDeficit"
  | "eventDeficit"
> & {
  ambiguousObservationIds: Set<string>;
  eventServiceDates: Map<string, string>;
  observationIds: Set<string>;
};

type CoverageDimensionDescriptor = {
  detail: string;
  dimension: ArrivalEvidenceCoverageRow["dimension"];
  label: string;
  pattern?: CampusBusPattern;
};

function rowKey(
  routeRevisionId: string,
  dimension: ArrivalEvidenceCoverageRow["dimension"],
  patternRevisionId = "",
  detail = "",
) {
  return `${routeRevisionId}|${dimension}|${patternRevisionId}|${detail}`;
}

function structuralSignature(
  route: CampusBusRoute,
  dimension: ArrivalEvidenceCoverageRow["dimension"],
  pattern?: CampusBusPattern,
  detail = "",
) {
  return `${route.routeId}|${dimension}|${pattern?.id ?? ""}|${detail}`;
}

function coverageDimensionDescriptors(route: CampusBusRoute) {
  const descriptors: CoverageDimensionDescriptor[] = [
    {
      detail: "",
      dimension: "route",
      label: `${route.code} 路線`,
    },
  ];
  const stopName = (stopOccurrenceId: string) =>
    route.stops.find((stop) => stop.id === stopOccurrenceId)?.nameZhHant ??
    stopOccurrenceId;

  for (const pattern of route.patterns) {
    descriptors.push({
      detail: "",
      dimension: "pattern",
      label: pattern.id,
      pattern,
    });
    for (const projection of pattern.projections) {
      descriptors.push({
        detail: projection.stopOccurrenceId,
        dimension: "stop",
        label: stopName(projection.stopOccurrenceId),
        pattern,
      });
    }
    for (let index = 1; index < pattern.projections.length; index += 1) {
      const previous = pattern.projections[index - 1].stopOccurrenceId;
      const current = pattern.projections[index].stopOccurrenceId;
      descriptors.push({
        detail: `${previous}>${current}`,
        dimension: "segment",
        label: `${stopName(previous)} → ${stopName(current)}`,
        pattern,
      });
    }
  }
  return descriptors;
}

function addObservation(row: MutableCoverageRow | undefined, id: string) {
  row?.observationIds.add(id);
}

function addEvent(
  row: MutableCoverageRow | undefined,
  eventId: string,
  serviceDate: string,
) {
  row?.eventServiceDates.set(eventId, serviceDate);
}

export function summarizeArrivalEvidenceReplay(
  observations: ArrivalObservationForModel[],
  replay: Replay,
) {
  const excludedObservationIds = new Set(
    replay.exclusions.flatMap((exclusion) => exclusion.observationIds),
  );
  const ambiguousObservationIds = new Set(
    replay.exclusions
      .filter((exclusion) => exclusion.reason === "ambiguous_trip")
      .flatMap((exclusion) => exclusion.observationIds),
  );
  const exclusionsByReason = Object.fromEntries(
    [...new Set(replay.exclusions.map((exclusion) => exclusion.reason))]
      .sort()
      .map((reason) => [
        reason,
        new Set(
          replay.exclusions
            .filter((exclusion) => exclusion.reason === reason)
            .flatMap((exclusion) => exclusion.observationIds),
        ).size,
      ]),
  );
  return {
    ambiguousObservationCount: ambiguousObservationIds.size,
    candidateCount: replay.candidates.length,
    eventCount: replay.events.length,
    excludedObservationCount: excludedObservationIds.size,
    exclusionsByReason,
    observationCount: observations.length,
    trajectoryCount: replay.trajectories.length,
  };
}

export function buildArrivalEvidenceCoverage(
  observations: ArrivalObservationForModel[],
  historicalRoutes: CampusBusRoute[],
  currentRoutes: CampusBusRoute[],
  replay: Replay,
): ArrivalEvidenceCoverageRow[] {
  const routes = [...historicalRoutes, ...currentRoutes];
  const historicalSignatures = new Set<string>();
  for (const route of historicalRoutes) {
    for (const descriptor of coverageDimensionDescriptors(route)) {
      historicalSignatures.add(
        structuralSignature(
          route,
          descriptor.dimension,
          descriptor.pattern,
          descriptor.detail,
        ),
      );
    }
  }

  const rows = new Map<string, MutableCoverageRow>();
  const currentRevisionIds = new Set(
    currentRoutes.map((route) => route.routeRevisionId),
  );
  for (const route of routes) {
    const current = currentRevisionIds.has(route.routeRevisionId);
    for (const descriptor of coverageDimensionDescriptors(route)) {
      const signature = structuralSignature(
        route,
        descriptor.dimension,
        descriptor.pattern,
        descriptor.detail,
      );
      const coverageKey = rowKey(
        route.routeRevisionId,
        descriptor.dimension,
        descriptor.pattern?.revisionId,
        descriptor.detail,
      );
      rows.set(coverageKey, {
        ambiguousObservationIds: new Set(),
        coverageKey,
        dimension: descriptor.dimension,
        eventServiceDates: new Map(),
        highlightedRevisionGap: current && !historicalSignatures.has(signature),
        label: descriptor.label,
        observationIds: new Set(),
        patternId: descriptor.pattern?.id ?? null,
        patternRevisionId: descriptor.pattern?.revisionId ?? null,
        routeCode: route.code,
        routeId: route.routeId,
        routeRevisionId: route.routeRevisionId,
        stopOccurrenceId:
          descriptor.dimension === "stop" ? descriptor.detail : null,
      });
    }
  }

  const candidatesByObservation = new Map<string, typeof replay.candidates>();
  for (const candidate of replay.candidates) {
    const group = candidatesByObservation.get(candidate.observationId) ?? [];
    group.push(candidate);
    candidatesByObservation.set(candidate.observationId, group);
  }
  const ambiguousIds = new Set(
    replay.exclusions
      .filter((exclusion) => exclusion.reason === "ambiguous_trip")
      .flatMap((exclusion) => exclusion.observationIds),
  );
  for (const observation of observations) {
    const serviceDate = getHongKongDateKey(
      observation.observedArrivalAt.getTime(),
    );
    const route = findCampusBusRouteRevisionForServiceDate(
      routes,
      observation.routeId,
      serviceDate,
    );
    if (!route) continue;
    const targetRows: MutableCoverageRow[] = [];
    const routeRow = rows.get(rowKey(route.routeRevisionId, "route"));
    if (routeRow) targetRows.push(routeRow);
    const candidateRevisions = new Set(
      (candidatesByObservation.get(observation.id) ?? []).map(
        (candidate) => candidate.patternRevisionId,
      ),
    );
    if (
      candidateRevisions.size === 0 &&
      observation.candidatePatternRevisionId
    ) {
      candidateRevisions.add(observation.candidatePatternRevisionId);
    }
    const patterns = route.patterns.filter(
      (pattern) =>
        (candidateRevisions.size === 0 ||
          candidateRevisions.has(pattern.revisionId)) &&
        pattern.projections.some(
          (projection) =>
            projection.stopOccurrenceId === observation.stopOccurrenceId,
        ),
    );
    for (const pattern of patterns) {
      const patternRow = rows.get(
        rowKey(route.routeRevisionId, "pattern", pattern.revisionId),
      );
      const stopRow = rows.get(
        rowKey(
          route.routeRevisionId,
          "stop",
          pattern.revisionId,
          observation.stopOccurrenceId,
        ),
      );
      if (patternRow) targetRows.push(patternRow);
      if (stopRow) targetRows.push(stopRow);
    }
    for (const row of targetRows) {
      addObservation(row, observation.id);
      if (ambiguousIds.has(observation.id)) {
        row.ambiguousObservationIds.add(observation.id);
      }
    }
  }

  for (const trajectory of replay.trajectories) {
    const route = routes.find(
      (candidate) => candidate.routeRevisionId === trajectory.routeRevisionId,
    );
    if (!route) continue;
    for (const revisionId of trajectory.candidatePatternRevisionIds) {
      const pattern = route.patterns.find(
        (candidate) => candidate.revisionId === revisionId,
      );
      if (!pattern) continue;
      for (let index = 1; index < trajectory.stops.length; index += 1) {
        const previous = trajectory.stops[index - 1];
        const current = trajectory.stops[index];
        const previousIndex = pattern.projections.findIndex(
          (projection) =>
            projection.stopOccurrenceId === previous.stopOccurrenceId,
        );
        const currentIndex = pattern.projections.findIndex(
          (projection) =>
            projection.stopOccurrenceId === current.stopOccurrenceId,
        );
        if (currentIndex !== previousIndex + 1) continue;
        const row = rows.get(
          rowKey(
            route.routeRevisionId,
            "segment",
            pattern.revisionId,
            `${previous.stopOccurrenceId}>${current.stopOccurrenceId}`,
          ),
        );
        if (!row) continue;
        const observationIds = [
          ...previous.observationIds,
          ...current.observationIds,
        ];
        for (const observationId of observationIds) {
          row.observationIds.add(observationId);
          if (trajectory.status === "ambiguous") {
            row.ambiguousObservationIds.add(observationId);
          }
        }
      }
    }
  }

  for (const event of replay.events) {
    addEvent(
      rows.get(rowKey(event.routeRevisionId, "route")),
      event.eventKey,
      event.serviceDate,
    );
    addEvent(
      rows.get(
        rowKey(event.routeRevisionId, "pattern", event.patternRevisionId),
      ),
      event.eventKey,
      event.serviceDate,
    );
    addEvent(
      rows.get(
        rowKey(
          event.routeRevisionId,
          "stop",
          event.patternRevisionId,
          event.stopOccurrenceId,
        ),
      ),
      event.eventKey,
      event.serviceDate,
    );
  }

  const eventsByTrajectory = new Map<string, typeof replay.events>();
  for (const event of replay.events) {
    const group = eventsByTrajectory.get(event.trajectoryId) ?? [];
    group.push(event);
    eventsByTrajectory.set(event.trajectoryId, group);
  }
  for (const events of eventsByTrajectory.values()) {
    const first = events[0];
    const route = routes.find(
      (candidate) => candidate.routeRevisionId === first.routeRevisionId,
    );
    const pattern = route?.patterns.find(
      (candidate) => candidate.revisionId === first.patternRevisionId,
    );
    if (!route || !pattern) continue;
    events.sort(
      (left, right) =>
        pattern.projections.findIndex(
          (projection) => projection.stopOccurrenceId === left.stopOccurrenceId,
        ) -
        pattern.projections.findIndex(
          (projection) =>
            projection.stopOccurrenceId === right.stopOccurrenceId,
        ),
    );
    for (let index = 1; index < events.length; index += 1) {
      const previous = events[index - 1];
      const current = events[index];
      const previousIndex = pattern.projections.findIndex(
        (projection) =>
          projection.stopOccurrenceId === previous.stopOccurrenceId,
      );
      const currentIndex = pattern.projections.findIndex(
        (projection) =>
          projection.stopOccurrenceId === current.stopOccurrenceId,
      );
      if (currentIndex !== previousIndex + 1) continue;
      const row = rows.get(
        rowKey(
          route.routeRevisionId,
          "segment",
          pattern.revisionId,
          `${previous.stopOccurrenceId}>${current.stopOccurrenceId}`,
        ),
      );
      if (!row) continue;
      for (const observationId of [
        ...previous.observationIds,
        ...current.observationIds,
      ]) {
        row.observationIds.add(observationId);
      }
      addEvent(
        row,
        `${previous.eventKey}>${current.eventKey}`,
        current.serviceDate,
      );
    }
  }

  return [...rows.values()]
    .map((row) => {
      const observationCount = row.observationIds.size;
      const independentEventCount = row.eventServiceDates.size;
      const serviceDayCount = new Set(row.eventServiceDates.values()).size;
      const { trainingEvents } = splitModelEventsByValidationDays(
        [...row.eventServiceDates].map(([id, serviceDate]) => ({
          id,
          serviceDate,
        })),
      );
      const trainingServiceDayCount = new Set(
        trainingEvents.map((event) => event.serviceDate),
      ).size;
      return {
        ambiguityRate:
          observationCount === 0
            ? 0
            : row.ambiguousObservationIds.size / observationCount,
        coverageKey: row.coverageKey,
        dimension: row.dimension,
        eventDeficit: Math.max(
          0,
          CAMPUS_BUS_MODEL_PUBLICATION_THRESHOLDS.minEvents -
            trainingEvents.length,
        ),
        highlightedRevisionGap: row.highlightedRevisionGap,
        independentEventCount,
        label: row.label,
        observationCount,
        patternId: row.patternId,
        patternRevisionId: row.patternRevisionId,
        routeCode: row.routeCode,
        routeId: row.routeId,
        routeRevisionId: row.routeRevisionId,
        serviceDayCount,
        serviceDayDeficit: Math.max(
          0,
          CAMPUS_BUS_MODEL_PUBLICATION_THRESHOLDS.minServiceDays -
            trainingServiceDayCount,
        ),
        stopOccurrenceId: row.stopOccurrenceId,
      } satisfies ArrivalEvidenceCoverageRow;
    })
    .sort(
      (left, right) =>
        Number(right.highlightedRevisionGap) -
          Number(left.highlightedRevisionGap) ||
        right.observationCount - left.observationCount ||
        left.routeCode.localeCompare(right.routeCode, "en", {
          numeric: true,
        }) ||
        left.dimension.localeCompare(right.dimension) ||
        left.label.localeCompare(right.label, "zh-HK"),
    );
}
