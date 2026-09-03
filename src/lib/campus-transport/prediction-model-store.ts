import { createHash } from "node:crypto";

import { and, asc, eq, gte, lt, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  campusBusArrivalEventObservations,
  campusBusArrivalEvents,
  campusBusArrivalObservations,
  campusBusPredictionAdjustments,
  campusBusPredictionModelRevisions,
  campusBusTripMatchCandidates,
} from "@/db/schema";
import {
  applyPredictionAdjustmentsToRoutes,
  CAMPUS_BUS_MODEL_ALGORITHM,
  candidateBeatsChampion,
  evaluatePredictionAdjustments,
  eventsForRouteRevisions,
  predictionAdjustmentFromStorage,
  reconstructArrivalEvidence,
  trainCandidateModel,
} from "@/lib/campus-transport/prediction-model";
import {
  campusBusRoutes,
  getCampusBusRoute,
  historicalCampusBusRoutes,
} from "@/lib/campus-transport/routes-data";

const TRAINING_WINDOW_DAYS = 28;

export type CampusBusModelRunResult = {
  adjustmentCount: number;
  eventCount: number;
  modelRevisionId: string;
  observationCount: number;
  promoted: boolean;
  status: "candidate" | "insufficient";
};

export async function getChampionCampusBusRoutes() {
  const champion = await db.query.campusBusPredictionModelRevisions.findFirst({
    columns: { id: true },
    where: eq(campusBusPredictionModelRevisions.status, "champion"),
    orderBy: (table, { desc }) => [desc(table.promotedAt)],
  });
  if (!champion) return campusBusRoutes;

  const adjustmentRows = await db
    .select()
    .from(campusBusPredictionAdjustments)
    .where(eq(campusBusPredictionAdjustments.modelRevisionId, champion.id));
  const adjustments = adjustmentRows.map(predictionAdjustmentFromStorage);
  return applyPredictionAdjustmentsToRoutes(
    campusBusRoutes,
    adjustments,
    champion.id,
  );
}

export async function getChampionCampusBusRoute(routeId: string) {
  const route = getCampusBusRoute(routeId);
  if (!route) return undefined;
  const routes = await getChampionCampusBusRoutes();
  return routes.find((candidate) => candidate.routeId === route.routeId);
}

export async function rebuildCampusBusPredictionModel(
  observationCutoffAt = new Date(),
): Promise<CampusBusModelRunResult> {
  const trainingWindowStart = new Date(
    observationCutoffAt.getTime() - TRAINING_WINDOW_DAYS * 24 * 60 * 60_000,
  );

  const result = await db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended('campus-bus:prediction-model', 0))`,
    );
    const observations = await tx
      .select({
        id: campusBusArrivalObservations.id,
        candidatePatternRevisionId:
          campusBusArrivalObservations.candidatePatternRevisionId,
        candidateScheduledDepartureAt:
          campusBusArrivalObservations.candidateScheduledDepartureAt,
        predictionModelRevisionId:
          campusBusArrivalObservations.predictionModelRevisionId,
        routeId: campusBusArrivalObservations.routeId,
        stopOccurrenceId: campusBusArrivalObservations.stopOccurrenceId,
        observedArrivalAt: campusBusArrivalObservations.observedArrivalAt,
        receivedAt: campusBusArrivalObservations.receivedAt,
      })
      .from(campusBusArrivalObservations)
      .where(
        and(
          gte(
            campusBusArrivalObservations.observedArrivalAt,
            trainingWindowStart,
          ),
          lt(
            campusBusArrivalObservations.observedArrivalAt,
            observationCutoffAt,
          ),
        ),
      )
      .orderBy(asc(campusBusArrivalObservations.observedArrivalAt));
    const reconstructed = reconstructArrivalEvidence(observations, [
      ...historicalCampusBusRoutes,
      ...campusBusRoutes,
    ]);
    const currentRevisionEvents = eventsForRouteRevisions(
      reconstructed.events,
      campusBusRoutes,
    );
    const candidate = trainCandidateModel(currentRevisionEvents);
    const previousChampion =
      await tx.query.campusBusPredictionModelRevisions.findFirst({
        columns: { id: true },
        where: eq(campusBusPredictionModelRevisions.status, "champion"),
        orderBy: (table, { desc }) => [desc(table.promotedAt)],
      });
    const previousAdjustments = previousChampion
      ? await tx
          .select()
          .from(campusBusPredictionAdjustments)
          .where(
            eq(
              campusBusPredictionAdjustments.modelRevisionId,
              previousChampion.id,
            ),
          )
      : [];
    const validationDates = new Set(candidate.validationServiceDates);
    const validationEvents = currentRevisionEvents.filter((event) =>
      validationDates.has(event.serviceDate),
    );
    const championEvaluation = previousChampion
      ? evaluatePredictionAdjustments(
          validationEvents,
          previousAdjustments.map(predictionAdjustmentFromStorage),
        )
      : null;
    const status: CampusBusModelRunResult["status"] =
      candidate.adjustments.length === 0 ? "insufficient" : "candidate";
    const snapshotHash = createHash("sha256")
      .update(
        observations
          .map(
            (observation) =>
              `${observation.id}:${observation.observedArrivalAt.toISOString()}`,
          )
          .join("\n"),
      )
      .digest("hex");
    const [revision] = await tx
      .insert(campusBusPredictionModelRevisions)
      .values({
        algorithm: CAMPUS_BUS_MODEL_ALGORITHM,
        status,
        parentRevisionId: previousChampion?.id ?? null,
        observationCutoffAt,
        trainingWindowStart,
        trainingWindowEnd: observationCutoffAt,
        trainingEventCount: candidate.trainingEventCount,
        trainingServiceDayCount: candidate.trainingServiceDayCount,
        validationEventCount: candidate.validationEventCount,
        sourceObservationCount: observations.length,
        snapshotHash,
        metrics: {
          candidate: candidate.evaluation,
          currentChampion: championEvaluation,
          shouldPromote:
            candidate.shouldPromote &&
            (!championEvaluation ||
              candidateBeatsChampion(candidate.evaluation, championEvaluation)),
        },
        promotedAt: null,
      })
      .returning({ id: campusBusPredictionModelRevisions.id });

    if (reconstructed.candidates.length > 0) {
      await tx.insert(campusBusTripMatchCandidates).values(
        reconstructed.candidates.map((match) => ({
          baselineArrivalAt: match.baselineArrivalAt,
          modelRevisionId: revision.id,
          observationId: match.observationId,
          patternId: match.patternId,
          patternRevisionId: match.patternRevisionId,
          probability: match.probability,
          rank: match.rank,
          routeRevisionId: match.routeRevisionId,
          scheduledDepartureAt: match.scheduledDepartureAt,
        })),
      );
    }
    const eventIds = new Map<string, string>();
    if (reconstructed.events.length > 0) {
      const storedEvents = await tx
        .insert(campusBusArrivalEvents)
        .values(
          reconstructed.events.map((event) => ({
            modelRevisionId: revision.id,
            eventKey: event.eventKey,
            routeId: event.routeId,
            routeRevisionId: event.routeRevisionId,
            patternId: event.patternId,
            patternRevisionId: event.patternRevisionId,
            stopOccurrenceId: event.stopOccurrenceId,
            scheduledDepartureAt: event.scheduledDepartureAt,
            baselineArrivalAt: event.baselineArrivalAt,
            observedArrivalAt: event.observedArrivalAt,
            serviceDate: event.serviceDate,
            residualSeconds: event.residualSeconds,
            observationCount: event.observationCount,
            confidence: event.confidence,
          })),
        )
        .returning({
          id: campusBusArrivalEvents.id,
          eventKey: campusBusArrivalEvents.eventKey,
        });
      for (const event of storedEvents) eventIds.set(event.eventKey, event.id);
      await tx.insert(campusBusArrivalEventObservations).values(
        reconstructed.events.flatMap((event) =>
          event.observationIds.map((observationId) => ({
            eventId: eventIds.get(event.eventKey)!,
            observationId,
          })),
        ),
      );
    }
    if (candidate.adjustments.length > 0) {
      await tx.insert(campusBusPredictionAdjustments).values(
        candidate.adjustments.map((adjustment) => ({
          ...adjustment,
          modelRevisionId: revision.id,
        })),
      );
    }

    return {
      adjustmentCount: candidate.adjustments.length,
      eventCount: reconstructed.events.length,
      modelRevisionId: revision.id,
      observationCount: observations.length,
      promoted: false,
      status,
    };
  });
  return result;
}
