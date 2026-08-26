#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { parse } from "yaml";

export const expectedWorkflowSchedules = [
  "37,47 0,3,9 * * *",
  "17,47 1-2,4-8,10-15 * * *",
];

const primaryUtcHours = new Set([0, 3, 9]);

export function validateWorkflowSchedule(workflowText) {
  const workflow = parse(workflowText);
  const triggers = workflow?.on;
  const schedules = triggers?.schedule;
  const actual = Array.isArray(schedules)
    ? schedules.map((entry) => entry?.cron)
    : [];

  if (
    actual.length !== expectedWorkflowSchedules.length ||
    actual.some(
      (schedule, index) => schedule !== expectedWorkflowSchedules[index],
    )
  ) {
    throw new Error("MENU_SYNC_WORKFLOW_SCHEDULE_MISMATCH");
  }
  if (!triggers || !Object.hasOwn(triggers, "workflow_dispatch")) {
    throw new Error("MENU_SYNC_WORKFLOW_DISPATCH_MISSING");
  }
}

export function validateVaultMetadataChange(before, after) {
  if (!Array.isArray(before) || !Array.isArray(after) || after.length !== 1) {
    throw new Error("MENU_SYNC_VAULT_SECRET_COUNT_MISMATCH");
  }
  if (before.length === 0) return;
  if (before.length !== 1) {
    throw new Error("MENU_SYNC_VAULT_SECRET_COUNT_MISMATCH");
  }

  const previous = before[0];
  const current = after[0];
  if (
    current.id !== previous.id ||
    current.created_at !== previous.created_at ||
    current.updated_at === previous.updated_at
  ) {
    throw new Error("MENU_SYNC_VAULT_METADATA_UNCHANGED");
  }
}

function isGithubWake(candidate) {
  const hour = candidate.getUTCHours();
  const minute = candidate.getUTCMinutes();
  const isPrimaryHour = primaryUtcHours.has(hour);
  const isRefreshHour = hour >= 0 && hour <= 15;
  return (
    isRefreshHour &&
    (minute === 47 || (isPrimaryHour ? minute === 37 : minute === 17))
  );
}

export function githubWakeGap(now = new Date()) {
  const minute = new Date(now);
  minute.setUTCSeconds(0, 0);
  let minutesSincePrevious;
  let minutesUntilNext;

  for (let offset = 0; offset <= 24 * 60; offset += 1) {
    const candidate = new Date(minute.getTime() - offset * 60_000);
    if (isGithubWake(candidate)) {
      minutesSincePrevious = Math.floor(
        (now.getTime() - candidate.getTime()) / 60_000,
      );
      break;
    }
  }
  for (let offset = 1; offset <= 24 * 60; offset += 1) {
    const candidate = new Date(minute.getTime() + offset * 60_000);
    if (isGithubWake(candidate)) {
      minutesUntilNext = Math.floor(
        (candidate.getTime() - now.getTime()) / 60_000,
      );
      break;
    }
  }

  if (minutesSincePrevious === undefined || minutesUntilNext === undefined) {
    throw new Error("MENU_SYNC_GITHUB_WAKE_NOT_FOUND");
  }
  return { minutesSincePrevious, minutesUntilNext };
}

export function firstPrimaryWindowBounds(activatedAtValue) {
  const activatedAt = new Date(activatedAtValue);
  if (Number.isNaN(activatedAt.getTime())) {
    throw new Error("MENU_SYNC_ACTIVATED_AT_INVALID");
  }

  let selected;
  for (let dayOffset = 0; dayOffset <= 2 && !selected; dayOffset += 1) {
    for (const hour of primaryUtcHours) {
      const candidate = new Date(activatedAt);
      candidate.setUTCDate(candidate.getUTCDate() + dayOffset);
      candidate.setUTCHours(hour, 17, 0, 0);
      if (candidate > activatedAt) {
        selected = candidate;
        break;
      }
    }
  }
  if (!selected) throw new Error("MENU_SYNC_PRIMARY_WINDOW_NOT_FOUND");

  const iso = (offsetMinutes) =>
    new Date(selected.getTime() + offsetMinutes * 60_000).toISOString();
  return {
    windowStart: iso(0),
    healthTo: iso(15),
    fallbackFrom: iso(18),
    fallbackTo: iso(45),
    verifyAfter: iso(40),
    windowHkt: new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Hong_Kong",
      dateStyle: "medium",
      timeStyle: "short",
      hour12: false,
    }).format(selected),
  };
}

function printPrimaryWindow(bounds) {
  process.stdout.write(
    [
      bounds.windowStart,
      bounds.healthTo,
      bounds.fallbackFrom,
      bounds.fallbackTo,
      bounds.verifyAfter,
      bounds.windowHkt,
    ].join("\t"),
  );
}

async function main() {
  const command = process.argv[2];
  if (command === "validate-workflow") {
    validateWorkflowSchedule(readFileSync(0, "utf8"));
    return;
  }
  if (command === "github-gap") {
    const gap = githubWakeGap();
    process.stdout.write(
      `${gap.minutesSincePrevious}\t${gap.minutesUntilNext}`,
    );
    return;
  }
  if (command === "validate-vault-metadata") {
    const value = JSON.parse(readFileSync(0, "utf8"));
    validateVaultMetadataChange(value.before, value.after);
    return;
  }
  if (command === "first-primary-window") {
    printPrimaryWindow(firstPrimaryWindowBounds(process.argv[3]));
    return;
  }
  throw new Error(
    "Usage: rollout-contract <validate-workflow|validate-vault-metadata|github-gap|first-primary-window>",
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await main();
}
