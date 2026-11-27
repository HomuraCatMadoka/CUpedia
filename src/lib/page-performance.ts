import "server-only";

import { performance } from "node:perf_hooks";
import { headers } from "next/headers";
import { db } from "@/db";

type PageStages = {
  "/courses": "courses" | "subjects";
  "/courses/[code]": "detail";
  "/wiki/[...id]": "article" | "viewer" | "tree" | "discussions" | "backlinks";
};

type StageTimer<Stage> = <Result>(
  stage: Stage,
  work: () => Promise<Result>,
) => Promise<Result>;

const withoutTiming: StageTimer<unknown> = (_stage, work) => work();
const REQUEST_ID = /^[0-9a-f]{32}$/;

export async function createPageStageTimer<Route extends keyof PageStages>(
  route: Route,
): Promise<StageTimer<PageStages[Route]>> {
  if (process.env.CUPEDIA_PERF_LOG !== "1") return withoutTiming;

  const requestId = (await headers()).get("x-request-id");
  if (!requestId || !REQUEST_ID.test(requestId)) return withoutTiming;

  return async (stage, work) => {
    const start = performance.now();
    const waitingAtStart = db.$client.waitingCount;
    try {
      return await work();
    } finally {
      // Pool-wide snapshots show contention observed at the stage boundaries.
      // They do not measure this request's connection wait or SQL execution time.
      const dbPoolWaiting = Math.max(waitingAtStart, db.$client.waitingCount);
      const ms = Math.round((performance.now() - start) * 100) / 100;
      console.info(
        `[perf] ${JSON.stringify({ requestId, route, stage, ms, dbPoolWaiting })}`,
      );
    }
  };
}
