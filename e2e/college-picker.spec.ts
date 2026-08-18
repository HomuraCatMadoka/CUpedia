import { test, expect } from "@playwright/test";

/**
 * 分院帽（College Picker）e2e — ref #228
 *
 * 匿名可访问的书院志愿推荐器：选项 → 九所书院 1–9 完整志愿。忠实移植自
 * lorasbb/College-Hat。完整浏览器层只保留 walking skeleton：真实路由、静态资源和
 * 默认推荐结果。表单状态和规则分支在 college-picker-form / college-picker unit tests
 * 中逐项覆盖，避免为纯客户端状态重复启动生产 Next 和 PostgreSQL。
 */

test.describe("#228 分院帽书院志愿推荐器", () => {
  test("匿名可访问，默认场景算出九所书院完整志愿", async ({ page }) => {
    const response = await page.goto("/college-picker");
    expect(response?.status()).toBe(200);

    await expect(
      page.getByRole("heading", { name: "分院帽", level: 1 }),
    ).toBeVisible();

    await page.getByTestId("recommend-button").click();

    const result = page.getByTestId("picker-result");
    await expect(result).toBeVisible();
    const items = result.getByTestId("picker-item");
    // 不重不漏：恰好九条志愿。
    await expect(items).toHaveCount(9);
    // 工科 · 仅填通勤 · 无避雷，通勤排名最高的善衡书院为第一志愿。
    await expect(items.first()).toContainText("善衡书院");
    await expect(items.first()).toContainText("地理位置优越");
    await expect(items.first()).toContainText("共膳/高桌难吃");
    const crests = items.locator('img[alt=""]');
    await expect(crests).toHaveCount(9);
    await expect(result.getByRole("img")).toHaveCount(0);
    await expect
      .poll(() =>
        crests.evaluateAll((images) =>
          images.every((image) => {
            const crest = image as HTMLImageElement;
            return (
              crest.complete &&
              crest.naturalWidth > 0 &&
              /^\/college-crests\/[a-z]+\.svg$/.test(
                crest.getAttribute("src") ?? "",
              )
            );
          }),
        ),
      )
      .toBe(true);
    await expect(page.getByText(/非官方/)).toBeVisible();
    await expect(page.getByText(/暂不含医科/)).toBeVisible();
  });
});
