import { expect, test, type Page } from "@playwright/test";
import { PAGE_IDS } from "../scripts/seed-data";
import { expectIdleWithoutPrefetch, trackPrefetch } from "./helpers/prefetch";
import { wikiPageUrl } from "./helpers/wiki";

function collectRuntimeFailures(page: Page): string[] {
  const failures: string[] = [];
  page.on("pageerror", (error) =>
    failures.push(`JavaScript: ${error.message}`),
  );
  page.on("response", (response) => {
    if (response.status() >= 500) {
      failures.push(`HTTP ${response.status()}: ${response.url()}`);
    }
  });
  return failures;
}

test.describe("#892 Wiki navigation avoids low-hit prefetch", () => {
  test.beforeEach(() => {
    expect(
      process.env.E2E_SERVER_MODE,
      "Prefetch regression coverage requires a production build",
    ).not.toBe("dev");
  });

  test("hover stays idle and a slow desktop navigation shows immediate feedback", async ({
    page,
  }) => {
    const runtimeFailures = collectRuntimeFailures(page);
    const prefetchedPaths = trackPrefetch(page);
    await page.goto("/wiki");
    const tree = page.getByRole("navigation", { name: "Wiki 页面树" });
    const targets = tree.locator('a[href^="/wiki/"]');
    await expect(targets.first()).toBeVisible();
    prefetchedPaths.length = 0;

    for (let index = 0; index < Math.min(await targets.count(), 5); index++) {
      if (await targets.nth(index).isVisible())
        await targets.nth(index).hover();
    }
    await expectIdleWithoutPrefetch(page, prefetchedPaths);

    const target = targets.first();
    const href = await target.getAttribute("href");
    expect(href).toBeTruthy();
    const targetRequests: { prefetch: boolean }[] = [];
    await page.route(`**${href}?*`, async (route) => {
      const headers = await route.request().allHeaders();
      targetRequests.push({
        prefetch: Boolean(
          headers["next-router-prefetch"] ||
          headers["next-router-segment-prefetch"],
        ),
      });
      await new Promise((resolve) => setTimeout(resolve, 500));
      await route.continue();
    });

    await page.evaluate(() => {
      const testWindow = window as typeof window & {
        __wikiFeedbackLatency?: number;
        __wikiFeedbackStartedAt?: number;
      };
      const observer = new MutationObserver(() => {
        if (document.querySelector('[data-testid="wiki-navigation-pending"]')) {
          testWindow.__wikiFeedbackLatency =
            performance.now() - (testWindow.__wikiFeedbackStartedAt ?? 0);
          observer.disconnect();
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
      document.addEventListener(
        "click",
        () => {
          testWindow.__wikiFeedbackStartedAt = performance.now();
        },
        { capture: true, once: true },
      );
    });
    await target.click({ noWaitAfter: true });
    await expect(target).toHaveAttribute("aria-busy", "true", { timeout: 100 });
    await expect(target.getByTestId("wiki-navigation-pending")).toBeVisible({
      timeout: 100,
    });
    expect(
      await page.evaluate(
        () =>
          (window as typeof window & { __wikiFeedbackLatency?: number })
            .__wikiFeedbackLatency,
      ),
    ).toBeLessThanOrEqual(100);
    await expect(page).toHaveURL(new RegExp(`${href}$`));
    await expect(page.locator("main h1").first()).toBeVisible();
    expect(targetRequests).toEqual([{ prefetch: false }]);

    await page.goBack();
    await expect(page).toHaveURL(/\/wiki$/);
    await page.goForward();
    await expect(page).toHaveURL(new RegExp(`${href}$`));
    expect(runtimeFailures).toEqual([]);
  });

  test("opening an article does not prefetch history and history still works", async ({
    page,
  }) => {
    const runtimeFailures = collectRuntimeFailures(page);
    const prefetchedPaths = trackPrefetch(page);
    const articlePath = `/wiki/${PAGE_IDS.welcome}`;
    const historyPath = `/wiki/history/${PAGE_IDS.welcome}`;
    await page.goto(articlePath);
    await expect(page.locator("main h1").first()).toBeVisible();
    await expectIdleWithoutPrefetch(page, prefetchedPaths, historyPath);

    await page.getByRole("link", { name: "历史", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${historyPath}$`));
    await expect(
      page.getByRole("heading", { name: /历史/ }).first(),
    ).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(wikiPageUrl(PAGE_IDS.welcome));
    await expect(page.locator("main h1").first()).toBeVisible();
    expect(runtimeFailures).toEqual([]);
  });
});
