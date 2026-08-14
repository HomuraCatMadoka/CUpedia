import { expect, test } from "@playwright/test";

import { loginAsAdmin } from "./helpers/auth";

test("admin publishes a product update that anonymous readers can discover", async ({
  page,
}) => {
  const title = `产品更新验收 ${Date.now()}`;
  const summary = "验证管理员发布后，匿名读者可以从公共入口发现这条更新。";
  const content = "这是通过真实表单、服务端写入和公开查询展示的完整正文。";

  await loginAsAdmin(page);
  await page.goto("/admin/product-updates");
  await page.getByLabel("标题").fill(title);
  await page.getByLabel("摘要").fill(summary);
  await page.getByLabel("正文").fill(content);
  await page.getByRole("button", { name: "确认并发布" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "请至少选择一个产品领域" }),
  ).toHaveText("请至少选择一个产品领域");

  await page.getByText("课程", { exact: true }).click();
  await page.getByRole("button", { name: "确认并发布" }).click();

  await expect(page).toHaveURL(/\/updates\/[0-9a-f-]+$/);
  const detailUrl = page.url();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await expect(page.getByText(content)).toBeVisible();

  await page.context().clearCookies();
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto("/");
  await page.getByRole("button", { name: "打开产品菜单" }).click();
  const publicEntry = page
    .getByRole("dialog")
    .getByRole("link", { name: "产品更新" });
  await expect(publicEntry).toBeVisible();
  await publicEntry.click();

  await expect(page).toHaveURL(/\/updates$/);
  const updateLink = page.getByRole("link", { name: new RegExp(title) });
  await expect(updateLink).toBeVisible();
  await updateLink.click();

  await expect(page).toHaveURL(detailUrl);
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await expect(page.getByText(content)).toBeVisible();
});
