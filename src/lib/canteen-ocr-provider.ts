export type OcrRecognizeResult =
  | { ok: true; text: string }
  | { ok: false; error: string };

export type OcrProvider = {
  recognize(buffer: Buffer, mimeType: string): Promise<OcrRecognizeResult>;
};

let providerOverride: OcrProvider | null = null;

export function setOcrProviderForTests(provider: OcrProvider | null) {
  providerOverride = provider;
}

export function createStaticOcrProvider(text: string): OcrProvider {
  return {
    async recognize() {
      return { ok: true, text };
    },
  };
}

export function createFailingOcrProvider(error: string): OcrProvider {
  return {
    async recognize() {
      return { ok: false, error };
    },
  };
}

export async function recognizeWithGoogleVision(
  buffer: Buffer,
  _mimeType: string,
): Promise<OcrRecognizeResult> {
  const apiKey = process.env.GOOGLE_CLOUD_VISION_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "OCR_NOT_CONFIGURED" };
  }

  const body = {
    requests: [
      {
        image: { content: buffer.toString("base64") },
        features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
        imageContext: { languageHints: ["zh-TW", "zh-CN", "en"] },
      },
    ],
  };

  const res = await fetch(
    `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );

  if (!res.ok) {
    if (res.status === 429) return { ok: false, error: "OCR_QUOTA_EXCEEDED" };
    return { ok: false, error: "OCR_PROVIDER_ERROR" };
  }

  const data = (await res.json()) as {
    responses?: Array<{
      fullTextAnnotation?: { text?: string };
      error?: { message?: string };
    }>;
  };

  const first = data.responses?.[0];
  if (first?.error?.message) {
    return { ok: false, error: "OCR_PROVIDER_ERROR" };
  }

  const text = first?.fullTextAnnotation?.text?.trim() ?? "";
  if (!text) {
    return { ok: false, error: "OCR_EMPTY_RESULT" };
  }

  return { ok: true, text };
}

const devMockProvider: OcrProvider = {
  async recognize() {
    return {
      ok: true,
      text: "演示菜品A 18元\n演示菜品B 22\n演示菜品C",
    };
  },
};

export function getOcrProvider(): OcrProvider {
  if (providerOverride) return providerOverride;
  if (
    process.env.CANTEEN_MOCK_DATA === "true" ||
    process.env.CANTEEN_OCR_MOCK === "true" ||
    !process.env.GOOGLE_CLOUD_VISION_API_KEY
  ) {
    return devMockProvider;
  }
  return {
    recognize: recognizeWithGoogleVision,
  };
}
