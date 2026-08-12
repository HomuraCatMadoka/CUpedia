import { expect, type Page } from "@playwright/test";

/**
 * Switch the page's simulated OS color scheme through Playwright's
 * `emulateMedia`, which next-themes (enableSystem) listens to and reflects
 * onto `<html class>`. Directly toggling the `dark` class no longer works:
 * next-themes owns the class attribute and overwrites manual edits on
 * re-render.
 */
export async function emulateColorScheme(page: Page, scheme: "dark" | "light") {
  await page.emulateMedia({ colorScheme: scheme });
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.classList.contains("dark")),
    )
    .toBe(scheme === "dark");
}
