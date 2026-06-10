import { test, expect } from "@playwright/test";

// The history list projects away revision `content` and is fetched only in the
// list branch (#142). These guard that the list still renders every revision's
// metadata, and that the view branch (separate query) keeps working.
test.describe("#142 history list renders revision metadata", () => {
  test("lists every revision with author, summary and view/diff links", async ({
    page,
  }) => {
    const res = await page.goto("/wiki/history/history-demo", {
      waitUntil: "networkidle",
    });
    expect(res?.status()).toBe(200);

    for (const summary of [
      "Initial draft",
      "Expand the introduction",
      "Add a closing note",
    ]) {
      await expect(page.getByText(summary, { exact: false })).toBeVisible();
    }

    await expect(page.getByText("Admin", { exact: true })).toBeVisible();
    await expect(page.getByText("Contributor", { exact: true })).toBeVisible();
    await expect(page.getByText("TestUser", { exact: true })).toBeVisible();

    // newest→oldest: 3 view links, 2 diff links (none on the oldest row).
    await expect(page.getByRole("link", { name: "查看" })).toHaveCount(3);
    await expect(page.getByRole("link", { name: "对比" })).toHaveCount(2);
  });

  test("a view link renders that revision's body", async ({ page }) => {
    await page.goto("/wiki/history/history-demo", { waitUntil: "networkidle" });

    // Target a specific row so the assertion is order-independent.
    const row = page
      .locator("div.border")
      .filter({ hasText: "Add a closing note" });
    await row.getByRole("link", { name: "查看" }).click();

    await expect(
      page.getByRole("heading", { name: "历史版本：Editing History Demo" }),
    ).toBeVisible();
    await expect(
      page.getByText("A final note was added by a reader."),
    ).toBeVisible();
  });
});
