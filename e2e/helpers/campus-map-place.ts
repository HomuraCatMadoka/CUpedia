import { expect, type Page } from "@playwright/test";

export async function openCampusMapPlaceEdit(page: Page) {
  await page.getByRole("link", { name: "查看详情" }).click();
  const detailPage = page.locator("#main-content");
  await detailPage.getByText("更多操作", { exact: true }).click();
  await detailPage.getByRole("link", { name: "建议修改" }).click();
  await expect(page.getByRole("heading", { name: "修改设施" })).toBeVisible();
}
