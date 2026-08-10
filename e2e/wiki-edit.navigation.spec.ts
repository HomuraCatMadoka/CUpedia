import { expect, test } from "@playwright/test";

import { loginAsAdmin } from "./helpers/auth";
import {
  createUntitledWikiPage,
  waitForHydratedWikiEditor,
} from "./helpers/wiki";

test.describe("wiki editor same-document navigation", () => {
  test("hash navigation keeps a dirty editor interactive through autosave and Back", async ({
    page,
  }) => {
    await loginAsAdmin(page);
    const pageId = await createUntitledWikiPage(page);
    await waitForHydratedWikiEditor(page);
    const shell = page.getByTestId("wiki-editor-shell");

    await page
      .getByLabel("页面标题")
      .fill(`Hash navigation edit ${Date.now()}`);
    await expect(shell).toHaveAttribute(
      "data-autosave-status",
      /unsaved|saving/,
    );

    await page.evaluate(() => {
      const target = document.createElement("div");
      target.id = "same-document-target";
      const anchor = document.createElement("a");
      anchor.href = "#same-document-target";
      anchor.dataset.testid = "same-document-hash-link";
      anchor.textContent = "Jump within this page";
      document.body.append(anchor, target);
    });
    await page.getByTestId("same-document-hash-link").click();

    await expect(page).toHaveURL(
      new RegExp(`/wiki/${pageId}#same-document-target$`),
    );
    await expect(shell).not.toHaveAttribute("inert", "");
    await expect(shell).not.toHaveAttribute("aria-busy", "true");
    await expect(shell).toHaveAttribute("data-autosave-status", "saved", {
      timeout: 15_000,
    });

    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`/wiki/${pageId}$`));
    await expect(shell).not.toHaveAttribute("inert", "");
    await expect(shell).not.toHaveAttribute("aria-busy", "true");
  });

  test("TOC-style hash links keep their own click behavior while autosave is dirty", async ({
    page,
  }) => {
    await loginAsAdmin(page);
    const pageId = await createUntitledWikiPage(page);
    await waitForHydratedWikiEditor(page);
    const shell = page.getByTestId("wiki-editor-shell");

    await page.getByLabel("页面标题").fill(`TOC navigation edit ${Date.now()}`);
    await expect(shell).toHaveAttribute(
      "data-autosave-status",
      /unsaved|saving/,
    );

    await page.evaluate(() => {
      const target = document.createElement("div");
      target.id = "toc-style-target";
      const anchor = document.createElement("a");
      anchor.href = "#toc-style-target";
      anchor.dataset.testid = "toc-style-hash-link";
      anchor.textContent = "Scroll within this page";
      anchor.addEventListener("click", (event) => {
        event.preventDefault();
        target.dataset.scrolled = "true";
        target.scrollIntoView();
      });
      document.body.append(anchor, target);
    });
    await page.getByTestId("toc-style-hash-link").click();

    await expect(page).toHaveURL(new RegExp(`/wiki/${pageId}$`));
    await expect(page.locator("#toc-style-target")).toHaveAttribute(
      "data-scrolled",
      "true",
    );
    await expect(shell).not.toHaveAttribute("inert", "");
    await expect(shell).not.toHaveAttribute("aria-busy", "true");
    await expect(shell).toHaveAttribute("data-autosave-status", "saved", {
      timeout: 15_000,
    });
  });
});
