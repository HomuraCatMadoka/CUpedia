import { createHash } from "node:crypto";

import { and, asc, count, desc, eq, gte, lt, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  campusBusArrivalObservations,
  campusBusPredictionAdjustments,
  campusBusPredictionModelRevisions,
  users,
} from "@/db/schema";
import type { ModelExperimentParameters } from "@/lib/campus-transport/model-experiment";
import {
  CAMPUS_BUS_MODEL_ALGORITHM,
  candidateBeatsChampion,
  evaluatePredictionAdjustments,
  predictionAdjustmentFromStorage,
  reconstructArrivalEvidence,
  trainCandidateModel,
  type ModelEvaluation,
} from "@/lib/campus-transport/prediction-model";
import { campusBusRoutes } from "@/lib/campus-transport/routes-data";

const EXPERIMENT_COOLDOWN_MILLISECONDS = 2 * 60_000;
const MAX_SOURCE_OBSERVATIONS = 20_000;

export type ModelLabViewer = { id: string; role: string };

export type ModelExperimentSummary = {
  id: string;
  authorName: string;
  runKind: string;
  createdAt: Date;
  status: string;
  routeScope: string | null;
  parameters: ModelExperimentParameters;
  sourceObservationCount: number;
  trainingEventCount: number;
  validationEventCount: number;
  baselineMaeSeconds: number | null;
  candidateMaeSeconds: number | null;
  candidateP90Seconds: number | null;
  championMaeSeconds: number | null;
  shouldPromote: boolean;
  promotedAt: Date | null;
};

type StoredMetrics = {
  candidate?: {
    baselineMaeSeconds?: number | null;
    candidateMaeSeconds?: number | null;
    candidateP90Seconds?: number | null;
  };
  currentChampion?: ModelEvaluation | null;
  shouldPromote?: boolean;
};

function metricsSummary(value: unknown) {
  const metrics = (value ?? {}) as StoredMetrics;
  return {
    baselineMaeSeconds: metrics.candidate?.baselineMaeSeconds ?? null,
    candidateMaeSeconds: metrics.candidate?.candidateMaeSeconds ?? null,
    candidateP90Seconds: metrics.candidate?.candidateP90Seconds ?? null,
    championMaeSeconds: metrics.currentChampion?.candidateMaeSeconds ?? null,
    shouldPromote: metrics.shouldPromote === true,
  };
}

export async function getModelLabOverview(viewer: ModelLabViewer) {
  const experimentVisibility =
    viewer.role === "admin"
      ? undefined
      : and(
          eq(campusBusPredictionModelRevisions.runKind, "experiment"),
          eq(campusBusPredictionModelRevisions.createdBy, viewer.id),
        );
  const [coverage, byRoute, experiments, champion] = await Promise.all([
    db
      .select({
        firstArrivalAt: sql<Date | null>`min(${campusBusArrivalObservations.observedArrivalAt})`,
        lastArrivalAt: sql<Date | null>`max(${campusBusArrivalObservations.observedArrivalAt})`,
        observationCount: count(),
      })
      .from(campusBusArrivalObservations),
    db
      .select({
        observationCount: count(),
        routeId: campusBusArrivalObservations.routeId,
      })
      .from(campusBusArrivalObservations)
      .groupBy(campusBusArrivalObservations.routeId)
      .orderBy(asc(campusBusArrivalObservations.routeId)),
    db
      .select({
        id: campusBusPredictionModelRevisions.id,
        authorName: users.nickname,
        authorEmail: users.email,
        createdAt: campusBusPredictionModelRevisions.createdAt,
        status: campusBusPredictionModelRevisions.status,
        routeScope: campusBusPredictionModelRevisions.routeScope,
        parameters: campusBusPredictionModelRevisions.parameters,
        sourceObservationCount:
          campusBusPredictionModelRevisions.sourceObservationCount,
        trainingEventCount:
          campusBusPredictionModelRevisions.trainingEventCount,
        validationEventCount:
          campusBusPredictionModelRevisions.validationEventCount,
        metrics: campusBusPredictionModelRevisions.metrics,
        promotedAt: campusBusPredictionModelRevisions.promotedAt,
        runKind: campusBusPredictionModelRevisions.runKind,
      })
      .from(campusBusPredictionModelRevisions)
      .leftJoin(
        users,
        eq(campusBusPredictionModelRevisions.createdBy, users.id),
      )
      .where(experimentVisibility)
      .orderBy(desc(campusBusPredictionModelRevisions.createdAt))
      .limit(20),
    db.query.campusBusPredictionModelRevisions.findFirst({
      columns: {
        id: true,
        createdAt: true,
        promotedAt: true,
        sourceObservationCount: true,
      },
      where: eq(campusBusPredictionModelRevisions.status, "champion"),
      orderBy: (table, { desc }) => [desc(table.promotedAt)],
    }),
  ]);

  return {
    coverage: coverage[0] ?? {
      firstArrivalAt: null,
      lastArrivalAt: null,
      observationCount: 0,
    },
    routes: byRoute,
    champion: champion ?? null,
    experiments: experiments.map((experiment) => ({
      id: experiment.id,
      runKind: experiment.runKind,
      authorName:
        experiment.runKind === "automated"
          ? "每日訓練"
          : experiment.authorName || experiment.authorEmail || "已刪除用戶",
      createdAt: experiment.createdAt,
      status: experiment.status,
      routeScope: experiment.routeScope,
      parameters: experiment.parameters as ModelExperimentParameters,
      sourceObservationCount: experiment.sourceObservationCount,
      trainingEventCount: experiment.trainingEventCount,
      validationEventCount: experiment.validationEventCount,
      promotedAt: experiment.promotedAt,
      ...metricsSummary(experiment.metrics),
    })) satisfies ModelExperimentSummary[],
  };
}

export async function runModelExperiment(
  createdBy: string,
  parameters: ModelExperimentParameters,
  observationCutoffAt = new Date(),
) {
  const trainingWindowStart = new Date(
    observationCutoffAt.getTime() -
      parameters.trainingWindowDays * 24 * 60 * 60_000,
  );
  const routes = parameters.routeId
    ? campusBusRoutes.filter((route) => route.routeId === parameters.routeId)
    : campusBusRoutes;

  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`campus-bus:experiment:${createdBy}`}, 0))`,
    );
    const recent = await tx.query.campusBusPredictionModelRevisions.findFirst({
      columns: { id: true },
      where: and(
        eq(campusBusPredictionModelRevisions.createdBy, createdBy),
        eq(campusBusPredictionModelRevisions.runKind, "experiment"),
        gte(
          campusBusPredictionModelRevisions.createdAt,
          new Date(
            observationCutoffAt.getTime() - EXPERIMENT_COOLDOWN_MILLISECONDS,
          ),
        ),
      ),
    });
    if (recent) throw new Error("MODEL_EXPERIMENT_RATE_LIMIT_EXCEEDED");

    const observations = await tx
      .select({
        id: campusBusArrivalObservations.id,
        routeId: campusBusArrivalObservations.routeId,
        stopOccurrenceId: campusBusArrivalObservations.stopOccurrenceId,
        observedArrivalAt: campusBusArrivalObservations.observedArrivalAt,
        receivedAt: campusBusArrivalObservations.receivedAt,
      })
      .from(campusBusArrivalObservations)
      .where(
        and(
          parameters.routeId
            ? eq(campusBusArrivalObservations.routeId, parameters.routeId)
            : undefined,
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
      .orderBy(desc(campusBusArrivalObservations.observedArrivalAt))
      .limit(MAX_SOURCE_OBSERVATIONS);
    observations.reverse();
    const reconstructed = reconstructArrivalEvidence(observations, routes, {
      candidateWindowSeconds: parameters.candidateWindowMinutes * 60,
      likelihoodScaleSeconds: parameters.likelihoodScaleMinutes * 60,
    });
    const candidate = trainCandidateModel(reconstructed.events, {
      minEvents: parameters.minEvents,
      minServiceDays: parameters.minServiceDays,
      priorStrength: parameters.priorStrength,
    });
    const champion = await tx.query.campusBusPredictionModelRevisions.findFirst(
      {
        columns: { id: true },
        where: eq(campusBusPredictionModelRevisions.status, "champion"),
        orderBy: (table, { desc }) => [desc(table.promotedAt)],
      },
    );
    const validationDates = new Set(candidate.validationServiceDates);
    const validationEvents = reconstructed.events.filter((event) =>
      validationDates.has(event.serviceDate),
    );
    const championAdjustments = champion
      ? await tx
          .select()
          .from(campusBusPredictionAdjustments)
          .where(
            eq(campusBusPredictionAdjustments.modelRevisionId, champion.id),
          )
      : [];
    const championEvaluation = champion
      ? evaluatePredictionAdjustments(
          validationEvents,
          championAdjustments.map(predictionAdjustmentFromStorage),
        )
      : null;
    const beatsCurrentChampion = championEvaluation
      ? candidateBeatsChampion(candidate.evaluation, championEvaluation)
      : true;
    const shouldPromote = candidate.shouldPromote && beatsCurrentChampion;
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
    const status =
      candidate.adjustments.length === 0 ? "insufficient" : "candidate";
    const [revision] = await tx
      .insert(campusBusPredictionModelRevisions)
      .values({
        algorithm: CAMPUS_BUS_MODEL_ALGORITHM,
        createdBy,
        metrics: {
          candidate: candidate.evaluation,
          currentChampion: championEvaluation,
          shouldPromote,
        },
        observationCutoffAt,
        parameters,
        parentRevisionId: champion?.id ?? null,
        routeScope: parameters.routeId,
        runKind: "experiment",
        snapshotHash,
        sourceObservationCount: observations.length,
        status,
        trainingEventCount: candidate.trainingEventCount,
        trainingServiceDayCount: candidate.trainingServiceDayCount,
        trainingWindowEnd: observationCutoffAt,
        trainingWindowStart,
        validationEventCount: candidate.validationEventCount,
      })
      .returning({ id: campusBusPredictionModelRevisions.id });

    if (candidate.adjustments.length > 0) {
      await tx.insert(campusBusPredictionAdjustments).values(
        candidate.adjustments.map((adjustment) => ({
          ...adjustment,
          modelRevisionId: revision.id,
        })),
      );
    }
    return {
      id: revision.id,
      adjustmentCount: candidate.adjustments.length,
      eventCount: reconstructed.events.length,
      evaluation: candidate.evaluation,
      shouldPromote,
      sourceObservationCount: observations.length,
      status,
    };
  });
}

export async function promoteModelExperiment(revisionId: string) {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended('campus-bus:prediction-model', 0))`,
    );
    const [experiment, champion] = await Promise.all([
      tx.query.campusBusPredictionModelRevisions.findFirst({
        where: eq(campusBusPredictionModelRevisions.id, revisionId),
      }),
      tx.query.campusBusPredictionModelRevisions.findFirst({
        columns: { id: true },
        where: eq(campusBusPredictionModelRevisions.status, "champion"),
        orderBy: (table, { desc }) => [desc(table.promotedAt)],
      }),
    ]);
    if (!experiment) {
      throw new Error("MODEL_EXPERIMENT_NOT_FOUND");
    }
    const metrics = metricsSummary(experiment.metrics);
    if (
      experiment.status !== "candidate" ||
      experiment.routeScope !== null ||
      !metrics.shouldPromote
    ) {
      throw new Error("MODEL_EXPERIMENT_NOT_PROMOTABLE");
    }
    if ((experiment.parentRevisionId ?? null) !== (champion?.id ?? null)) {
      throw new Error("MODEL_EXPERIMENT_STALE");
    }
    const storedMetrics = (experiment.metrics ?? {}) as StoredMetrics;
    if (
      champion &&
      (!storedMetrics.currentChampion ||
        !candidateBeatsChampion(
          {
            baselineMaeSeconds: null,
            baselineP90Seconds: null,
            candidateMaeSeconds: metrics.candidateMaeSeconds,
            candidateP90Seconds: metrics.candidateP90Seconds,
            eventCount: experiment.validationEventCount,
          },
          storedMetrics.currentChampion,
        ))
    ) {
      throw new Error("MODEL_EXPERIMENT_NOT_BETTER_THAN_CHAMPION");
    }
    if (champion) {
      await tx
        .update(campusBusPredictionModelRevisions)
        .set({ status: "retired" })
        .where(eq(campusBusPredictionModelRevisions.id, champion.id));
    }
    const promotedAt = new Date();
    await tx
      .update(campusBusPredictionModelRevisions)
      .set({ promotedAt, status: "champion" })
      .where(eq(campusBusPredictionModelRevisions.id, revisionId));
    return { id: revisionId, promotedAt };
  });
}

export async function rollbackCampusBusModel(revisionId: string) {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended('campus-bus:prediction-model', 0))`,
    );
    const [target, champion] = await Promise.all([
      tx.query.campusBusPredictionModelRevisions.findFirst({
        columns: { id: true, status: true },
        where: eq(campusBusPredictionModelRevisions.id, revisionId),
      }),
      tx.query.campusBusPredictionModelRevisions.findFirst({
        columns: { id: true },
        where: eq(campusBusPredictionModelRevisions.status, "champion"),
        orderBy: (table, { desc }) => [desc(table.promotedAt)],
      }),
    ]);
    if (!target || target.status !== "retired") {
      throw new Error("MODEL_ROLLBACK_TARGET_NOT_FOUND");
    }
    if (champion) {
      await tx
        .update(campusBusPredictionModelRevisions)
        .set({ status: "retired" })
        .where(eq(campusBusPredictionModelRevisions.id, champion.id));
    }
    const promotedAt = new Date();
    await tx
      .update(campusBusPredictionModelRevisions)
      .set({ promotedAt, status: "champion" })
      .where(eq(campusBusPredictionModelRevisions.id, target.id));
    return { id: target.id, promotedAt };
  });
}
