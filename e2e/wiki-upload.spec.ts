import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { deleteObjects, getObject } from "../src/lib/minio";
import { loginAsAdmin, loginWithPassword } from "./helpers/auth";

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+AvzZAAAAAElFTkSuQmCC",
  "base64",
);
const createdKeys = new Set<string>();

function file(buffer: Buffer, name: string, mimeType: string) {
  return { name, mimeType, buffer };
}

function remember(url: string) {
  const key = url.replace("/api/wiki-assets/", "");
  createdKeys.add(key);
  return key;
}

test.afterAll(async () => {
  const keys = [...createdKeys];
  await deleteObjects(keys);
  for (const key of keys) await expect(getObject(key)).rejects.toBeTruthy();
});

test("upload rejects anonymous and non-editor users", async ({ browser }) => {
  const anonymous = await browser.newPage();
  const anonymousResponse = await anonymous.request.post("/api/upload", {
    multipart: { file: file(png, "image.png", "image/png") },
  });
  expect(anonymousResponse.status()).toBe(403);
  await anonymous.context().close();

  const context = await browser.newContext();
  const user = await context.newPage();
  await loginWithPassword(user, "user@test.com", "password123");
  const userResponse = await user.request.post("/api/upload", {
    multipart: { file: file(png, "image.png", "image/png") },
  });
  expect(userResponse.status()).toBe(403);
  await context.close();
});

test("upload validates boundaries and serves detected content anonymously", async ({
  page,
  request,
}) => {
  await loginAsAdmin(page);

  expect(
    (await page.request.post("/api/upload", { multipart: {} })).status(),
  ).toBe(400);
  expect(
    (
      await page.request.post("/api/upload", {
        multipart: {
          file: file(Buffer.from("not an image"), "fake.png", "image/png"),
        },
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await page.request.post("/api/upload", {
        multipart: {
          file: file(
            Buffer.alloc(5 * 1024 * 1024 + 1),
            "large.png",
            "image/png",
          ),
        },
      })
    ).status(),
  ).toBe(400);

  const uploaded = await page.request.post("/api/upload", {
    multipart: {
      file: file(png, "malicious.exe", "application/octet-stream"),
    },
  });
  expect(uploaded.ok()).toBe(true);
  const { url } = await uploaded.json();
  remember(url);
  expect(url).toMatch(/^\/api\/wiki-assets\/wiki-assets\/[\w-]+\.png$/);

  const asset = await request.get(url);
  expect(asset.status()).toBe(200);
  expect(asset.headers()["content-type"]).toBe("image/png");
  expect(asset.headers()["cache-control"]).toContain("immutable");
  expect(await asset.body()).toEqual(png);
});

test("editor uploads an image and saves it on a wiki page", async ({
  page,
  request,
}) => {
  await loginAsAdmin(page);
  const slug = `upload-${randomUUID().slice(0, 8)}`;
  const title = `Upload ${slug}`;
  await page.goto("/wiki/new");
  await page.getByLabel("标题").fill(title);
  await page.getByLabel("URL 路径").fill(slug);
  const editor = page.locator('[role="textbox"]').first();
  await editor.evaluate((element, base64) => {
    const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
    const transfer = new DataTransfer();
    transfer.items.add(new File([bytes], "pixel.png", { type: "image/png" }));
    element.dispatchEvent(
      new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        clipboardData: transfer,
      }),
    );
  }, png.toString("base64"));

  const image = page.locator('img[src*="/api/wiki-assets/"]').last();
  await expect(image).toBeVisible();
  const url = await image.getAttribute("src");
  expect(url).toBeTruthy();
  remember(url!);

  await page.getByRole("button", { name: "保存" }).click();
  await expect(page).toHaveURL(new RegExp(`/wiki/${slug}$`));
  await expect(
    page.getByRole("heading", { name: title, level: 1 }),
  ).toBeVisible();
  await expect(page.locator(`img[src="${url}"]`)).toBeVisible();
  expect((await request.get(url!)).status()).toBe(200);
});
