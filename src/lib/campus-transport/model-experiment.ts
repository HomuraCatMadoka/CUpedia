import { campusBusRoutes } from "@/lib/campus-transport/routes-data";

export const modelExperimentDefaults = {
  candidateWindowMinutes: 15,
  label: "",
  likelihoodScaleMinutes: 3,
  minEvents: 10,
  minServiceDays: 5,
  priorStrength: 8,
  routeId: "all",
  trainingWindowDays: 28,
} as const;

export type ModelExperimentParameters = {
  candidateWindowMinutes: number;
  label: string | null;
  likelihoodScaleMinutes: number;
  minEvents: number;
  minServiceDays: number;
  priorStrength: number;
  routeId: string | null;
  trainingWindowDays: number;
};

function integerInRange(
  value: unknown,
  minimum: number,
  maximum: number,
  field: string,
) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`INVALID_${field.toUpperCase()}`);
  }
  return parsed;
}

export function parseModelExperimentParameters(
  raw: unknown,
): ModelExperimentParameters {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("INVALID_EXPERIMENT");
  }
  const value = raw as Record<string, unknown>;
  const trainingWindowDays = integerInRange(
    value.trainingWindowDays,
    7,
    56,
    "training_window_days",
  );
  const minServiceDays = integerInRange(
    value.minServiceDays,
    2,
    Math.min(28, trainingWindowDays - 1),
    "min_service_days",
  );
  const routeValue = value.routeId === "all" ? null : value.routeId;
  const routeId =
    typeof routeValue === "string" &&
    campusBusRoutes.some((route) => route.routeId === routeValue)
      ? routeValue
      : null;
  if (value.routeId !== "all" && routeId === null) {
    throw new Error("INVALID_ROUTE");
  }
  const rawLabel = typeof value.label === "string" ? value.label.trim() : "";
  if (rawLabel.length > 80) throw new Error("INVALID_LABEL");

  return {
    candidateWindowMinutes: integerInRange(
      value.candidateWindowMinutes,
      3,
      30,
      "candidate_window_minutes",
    ),
    label: rawLabel || null,
    likelihoodScaleMinutes: integerInRange(
      value.likelihoodScaleMinutes,
      1,
      10,
      "likelihood_scale_minutes",
    ),
    minEvents: integerInRange(value.minEvents, 3, 100, "min_events"),
    minServiceDays,
    priorStrength: integerInRange(value.priorStrength, 1, 50, "prior_strength"),
    routeId,
    trainingWindowDays,
  };
}
