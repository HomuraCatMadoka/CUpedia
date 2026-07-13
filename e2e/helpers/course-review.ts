import type { Page } from "@playwright/test";

export async function selectSeedProfessor(page: Page) {
  await page.getByPlaceholder("搜索任课教授姓名").fill("测试教授");
  await page.getByRole("button", { name: "测试教授 Chan" }).click();
}
