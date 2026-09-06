import { expect, type Page } from "@playwright/test";

export function trackPrefetch(page: Page) {
  const paths: string[] = [];
  page.on("request", (request) => {
    const headers = request.headers();
    if (
      headers["next-router-prefetch"] ||
      headers["next-router-segment-prefetch"]
    ) {
      paths.push(new URL(request.url()).pathname);
    }
  });
  return paths;
}

export async function expectIdleWithoutPrefetch(
  page: Page,
  paths: string[],
  targetPath?: string,
) {
  expect(
    process.env.E2E_SERVER_MODE,
    "Prefetch coverage requires a production build",
  ).not.toBe("dev");
  // Observe forbidden requests after UI readiness; timeout is the expected
  // negative assertion, not a substitute for waiting for the UI.
  await expect(
    page.waitForRequest(
      (request) => {
        const headers = request.headers();
        return Boolean(
          (headers["next-router-prefetch"] ||
            headers["next-router-segment-prefetch"]) &&
          (!targetPath || new URL(request.url()).pathname === targetPath),
        );
      },
      { timeout: 3_000 },
    ),
  ).rejects.toThrow(/Timeout/);
  expect(paths.filter((path) => !targetPath || path === targetPath)).toEqual(
    [],
  );
}
