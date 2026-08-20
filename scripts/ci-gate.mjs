#!/usr/bin/env node

import { pathToFileURL } from "node:url";
import { PLAN_VERSION } from "./ci-classifier.mjs";

const RESULT = new Set(["success", "failure", "cancelled", "skipped"]);
const TIERS = new Set(["docs", "ordinary", "full"]);

function isValidPlan(plan) {
  const booleanFields = [
    "install",
    "quality",
    "typecheck",
    "postgres",
    "build",
    "chromium",
    "minio",
    "webkit",
  ];
  return (
    plan &&
    plan.version === PLAN_VERSION &&
    TIERS.has(plan.tier) &&
    typeof plan.domain === "string" &&
    typeof plan.reason === "string" &&
    booleanFields.every((field) => typeof plan[field] === "boolean") &&
    plan.e2eMatrix &&
    Array.isArray(plan.e2eMatrix.include) &&
    typeof plan.webkitSpecs === "string"
  );
}

export function evaluateGate({ qualityPlan, buildPlan, results }) {
  if (!qualityPlan || !buildPlan)
    return { ok: false, reason: "missing classification plan" };
  if (!isValidPlan(qualityPlan) || !isValidPlan(buildPlan)) {
    return { ok: false, reason: "invalid classification plan" };
  }
  if (JSON.stringify(qualityPlan) !== JSON.stringify(buildPlan)) {
    return { ok: false, reason: "quality/build classification disagreement" };
  }
  if (
    !results ||
    Object.values(results).some((result) => !RESULT.has(result))
  ) {
    return { ok: false, reason: "missing or unknown upstream result" };
  }

  const plan = buildPlan;
  const required = {
    quality: true,
    build: true,
    e2e: plan.chromium === true,
    browserThird: plan.tier === "full" || plan.webkit === true,
  };
  for (const [job, isRequired] of Object.entries(required)) {
    const result = results[job];
    if (isRequired && result !== "success") {
      return { ok: false, reason: `required ${job} job was ${result}` };
    }
    if (!isRequired && !["success", "skipped"].includes(result)) {
      return { ok: false, reason: `optional ${job} job was ${result}` };
    }
  }
  return { ok: true, reason: `${plan.tier} plan completed` };
}

function parsePlan(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function main() {
  const verdict = evaluateGate({
    qualityPlan: parsePlan(process.env.QUALITY_PLAN),
    buildPlan: parsePlan(process.env.BUILD_PLAN),
    results: {
      quality: process.env.QUALITY_RESULT,
      build: process.env.BUILD_RESULT,
      e2e: process.env.E2E_RESULT,
      browserThird: process.env.BROWSER_THIRD_RESULT,
    },
  });
  console.log(verdict.reason);
  if (!verdict.ok) process.exitCode = 1;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main();
}
