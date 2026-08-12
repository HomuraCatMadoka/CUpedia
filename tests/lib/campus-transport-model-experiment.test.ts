import { describe, expect, it } from "vitest";

import {
  modelExperimentDefaults,
  parseModelExperimentParameters,
} from "@/lib/campus-transport/model-experiment";

describe("campus bus model experiment parameters", () => {
  it("parses a reproducible all-route experiment", () => {
    expect(
      parseModelExperimentParameters(modelExperimentDefaults),
    ).toMatchObject({
      candidateWindowMinutes: 15,
      label: null,
      likelihoodScaleMinutes: 3,
      minEvents: 10,
      minServiceDays: 5,
      priorStrength: 8,
      routeId: null,
      trainingWindowDays: 28,
    });
  });

  it("accepts a known route and trims its label", () => {
    expect(
      parseModelExperimentParameters({
        ...modelExperimentDefaults,
        label: "  Route 2 peak  ",
        routeId: "2",
      }),
    ).toMatchObject({ label: "Route 2 peak", routeId: "2" });
  });

  it("rejects routes outside the passenger dataset", () => {
    expect(() =>
      parseModelExperimentParameters({
        ...modelExperimentDefaults,
        routeId: "9",
      }),
    ).toThrow("INVALID_ROUTE");
  });

  it("requires the service-day threshold to fit inside the window", () => {
    expect(() =>
      parseModelExperimentParameters({
        ...modelExperimentDefaults,
        minServiceDays: 20,
        trainingWindowDays: 14,
      }),
    ).toThrow("INVALID_MIN_SERVICE_DAYS");
  });
});
