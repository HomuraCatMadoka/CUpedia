import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  recognizeWithGoogleVision,
  setOcrProviderForTests,
} from "@/lib/canteen-ocr-provider";

describe("recognizeWithGoogleVision", () => {
  const prevKey = process.env.GOOGLE_CLOUD_VISION_API_KEY;

  beforeEach(() => {
    setOcrProviderForTests(null);
    process.env.GOOGLE_CLOUD_VISION_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          responses: [{ fullTextAnnotation: { text: "菜品甲 12元" } }],
        }),
      }),
    );
  });

  afterEach(() => {
    process.env.GOOGLE_CLOUD_VISION_API_KEY = prevKey;
    vi.unstubAllGlobals();
  });

  it("returns OCR_NOT_CONFIGURED without API key", async () => {
    delete process.env.GOOGLE_CLOUD_VISION_API_KEY;
    const result = await recognizeWithGoogleVision(Buffer.from("x"), "image/png");
    expect(result).toEqual({ ok: false, error: "OCR_NOT_CONFIGURED" });
  });

  it("maps HTTP 429 to OCR_QUOTA_EXCEEDED", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 429,
    } as Response);
    const result = await recognizeWithGoogleVision(Buffer.from("x"), "image/png");
    expect(result).toEqual({ ok: false, error: "OCR_QUOTA_EXCEEDED" });
  });

  it("maps other HTTP errors to OCR_PROVIDER_ERROR", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 500,
    } as Response);
    const result = await recognizeWithGoogleVision(Buffer.from("x"), "image/png");
    expect(result).toEqual({ ok: false, error: "OCR_PROVIDER_ERROR" });
  });

  it("maps empty annotation to OCR_EMPTY_RESULT", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ responses: [{ fullTextAnnotation: { text: "  " } }] }),
    } as Response);
    const result = await recognizeWithGoogleVision(Buffer.from("x"), "image/png");
    expect(result).toEqual({ ok: false, error: "OCR_EMPTY_RESULT" });
  });

  it("returns trimmed text on success", async () => {
    const result = await recognizeWithGoogleVision(Buffer.from("x"), "image/png");
    expect(result).toEqual({ ok: true, text: "菜品甲 12元" });
  });
});
