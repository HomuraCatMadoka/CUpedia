import { expect, type Page } from "@playwright/test";

export async function expectBottomSheetViewportToStayStill(
  page: Page,
  {
    triggerName,
    viewportTestId,
    closeName,
  }: {
    triggerName: string;
    viewportTestId: string;
    closeName: string;
  },
) {
  const maximumScrollTop = page.evaluate(async (testId) => {
    const deadline = performance.now() + 400;
    let maximum = 0;

    while (performance.now() < deadline) {
      const viewport = document.querySelector<HTMLElement>(
        `[data-testid="${testId}"]`,
      );
      maximum = Math.max(maximum, viewport?.scrollTop ?? 0);
      await new Promise(requestAnimationFrame);
    }

    return maximum;
  }, viewportTestId);

  await page.getByRole("button", { name: triggerName, exact: true }).click();
  expect(await maximumScrollTop).toBeLessThanOrEqual(1);

  await page.getByRole("button", { name: closeName }).click();
}
