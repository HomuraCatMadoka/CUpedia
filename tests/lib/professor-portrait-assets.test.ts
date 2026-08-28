import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";

import {
  materializeProfessorPortrait,
  portraitAttemptUpdate,
  portraitSourceFingerprint,
  selectProfessorPortraitCandidates,
  type ExistingPortraitAsset,
  type PortraitStorage,
} from "@/lib/professor-portrait-assets";
import type { ProfessorCardSource } from "@/lib/professor-card-source";

const PNG = sharp({
  create: {
    width: 4,
    height: 4,
    channels: 3,
    background: { r: 110, g: 140, b: 180 },
  },
})
  .png()
  .toBuffer();

const OTHER_PNG = sharp({
  create: {
    width: 4,
    height: 4,
    channels: 3,
    background: { r: 180, g: 90, b: 70 },
  },
})
  .png()
  .toBuffer();

async function imageResponse(init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  if (!headers.has("content-type")) headers.set("content-type", "image/png");
  return new Response(Uint8Array.from(await PNG), { ...init, headers });
}

function existingFrom(
  result: Extract<
    Awaited<ReturnType<typeof materializeProfessorPortrait>>,
    { kind: "ready" }
  >,
  status: ExistingPortraitAsset["status"] = "ready",
): ExistingPortraitAsset {
  return {
    status,
    sourceFingerprint: result.sourceFingerprint,
    materializedSourceUrl: result.sourceUrl,
    contentHash: result.contentHash,
    webp256Key: result.webp256Key,
    webp384Key: result.webp384Key,
    sourceEtag: result.sourceEtag,
    sourceLastModified: result.sourceLastModified,
  };
}

function source(
  values: Partial<ProfessorCardSource> = {},
): ProfessorCardSource {
  return {
    source: "cuhk_department:cse",
    sourceKey: "person",
    profileUrl: "https://www.cse.cuhk.edu.hk/people/person/",
    profileVerifiedAt: "2026-08-01T00:00:00Z",
    appointmentKind: "regular",
    isCurrent: true,
    imageUrl: "https://www.cse.cuhk.edu.hk/photo.png",
    ...values,
  };
}

describe("professor portrait assets", () => {
  it("orders verified department and Research Portal candidates", () => {
    const portal = source({
      source: "cuhk_research_portal",
      sourceKey: "portal",
      imageUrl: "https://research.cuhk.edu.hk/photo.png",
    });
    expect(selectProfessorPortraitCandidates([portal, source()])).toEqual([
      "https://www.cse.cuhk.edu.hk/photo.png",
      "https://research.cuhk.edu.hk/photo.png",
    ]);
  });

  it("creates immutable 256px and 384px WebP objects", async () => {
    const uploads: Parameters<PortraitStorage["put"]>[0][] = [];
    const result = await materializeProfessorPortrait({
      personId: "staff-1",
      sources: [source()],
      storage: { put: async (input) => void uploads.push(input) },
      fetcher: vi.fn(async () =>
        imageResponse({ headers: { "content-type": "image/png" } }),
      ) as typeof fetch,
    });

    expect(result.kind).toBe("ready");
    expect(uploads.map((upload) => upload.key)).toEqual([
      expect.stringMatching(/^professor-portraits\/staff-1\/.+-256\.webp$/),
      expect.stringMatching(/^professor-portraits\/staff-1\/.+-384\.webp$/),
    ]);
    expect(uploads.every((upload) => upload.contentType === "image/webp")).toBe(
      true,
    );
    expect(uploads[0]?.cacheControl).toContain("immutable");
    expect(await sharp(uploads[0]!.body).metadata()).toMatchObject({
      format: "webp",
      width: 256,
      height: 256,
    });
    expect(await sharp(uploads[1]!.body).metadata()).toMatchObject({
      format: "webp",
      width: 384,
      height: 384,
    });
  });

  it("falls back to the Portal candidate when the department source fails", async () => {
    const portal = source({
      source: "cuhk_research_portal",
      sourceKey: "portal",
      imageUrl: "https://research.cuhk.edu.hk/photo.png",
    });
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(await imageResponse());
    const result = await materializeProfessorPortrait({
      personId: "staff-1",
      sources: [source(), portal],
      storage: { put: async () => undefined },
      fetcher: fetcher as typeof fetch,
    });

    expect(result.kind).toBe("ready");
    if (result.kind === "ready") {
      expect(result.sourceUrl).toBe(portal.imageUrl);
    }
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("revalidates unchanged bytes and skips object writes", async () => {
    const first = await materializeProfessorPortrait({
      personId: "staff-1",
      sources: [source()],
      storage: { put: async () => undefined },
      fetcher: vi.fn(async () => imageResponse()) as typeof fetch,
    });
    expect(first.kind).toBe("ready");
    if (first.kind !== "ready") return;
    const fetcher = vi.fn(async () => imageResponse());
    const storage = { put: vi.fn(async () => undefined) };
    const second = await materializeProfessorPortrait({
      personId: "staff-1",
      sources: [source()],
      existing: existingFrom(first),
      storage,
      fetcher: fetcher as typeof fetch,
    });

    expect(second.kind).toBe("skipped");
    expect(fetcher).toHaveBeenCalledOnce();
    expect(storage.put).not.toHaveBeenCalled();
  });

  it("retries a failed asset even when it retained old object keys", async () => {
    const sources = [source()];
    const fetcher = vi.fn(async () => imageResponse());
    const initial = await materializeProfessorPortrait({
      personId: "staff-1",
      sources,
      storage: { put: async () => undefined },
      fetcher: vi.fn(async () => imageResponse()) as typeof fetch,
    });
    expect(initial.kind).toBe("ready");
    if (initial.kind !== "ready") return;
    const existing = existingFrom(initial, "failed");

    const result = await materializeProfessorPortrait({
      personId: "staff-1",
      sources,
      existing,
      storage: { put: async () => undefined },
      fetcher: fetcher as typeof fetch,
    });

    expect(result.kind).toBe("skipped");
    expect(fetcher).toHaveBeenCalled();
  });

  it("detects changed image bytes served from the same source URL", async () => {
    const sources = [source()];
    const first = await materializeProfessorPortrait({
      personId: "staff-1",
      sources,
      storage: { put: async () => undefined },
      fetcher: vi.fn(async () => imageResponse()) as typeof fetch,
    });
    expect(first.kind).toBe("ready");
    if (first.kind !== "ready") return;

    const result = await materializeProfessorPortrait({
      personId: "staff-1",
      sources,
      existing: existingFrom(first),
      storage: { put: async () => undefined },
      fetcher: vi.fn(
        async () =>
          new Response(Uint8Array.from(await OTHER_PNG), {
            headers: { "content-type": "image/png" },
          }),
      ) as typeof fetch,
    });

    expect(result.kind).toBe("ready");
    expect(result).not.toEqual(
      expect.objectContaining({ contentHash: first.contentHash }),
    );
  });

  it("rejects a non-image HTTP Content-Type even when bytes decode", async () => {
    const storage = { put: vi.fn(async () => undefined) };
    await expect(
      materializeProfessorPortrait({
        personId: "staff-1",
        sources: [source()],
        storage,
        fetcher: vi.fn(async () =>
          imageResponse({ headers: { "content-type": "text/html" } }),
        ) as typeof fetch,
      }),
    ).rejects.toMatchObject({ code: "all_sources_failed" });
    expect(storage.put).not.toHaveBeenCalled();
  });

  it("preserves last-ready fields when an attempt fails", () => {
    const previous = {
      sourceFingerprint: "last-ready",
      webp256Key: "old-256.webp",
      webp384Key: "old-384.webp",
      contentHash: "old-hash",
    };
    const failed = {
      ...previous,
      ...portraitAttemptUpdate(
        "failed",
        portraitSourceFingerprint(["https://www.cuhk.edu.hk/new.png"]),
        new Date("2026-08-28T00:00:00Z"),
        "all_sources_failed",
      ),
    };

    expect(failed).toMatchObject(previous);
    expect(failed.status).toBe("failed");
    expect(failed.attemptedSourceFingerprint).not.toBe(
      failed.sourceFingerprint,
    );
  });

  it("uses source validators and accepts 304 without object writes", async () => {
    const sources = [source()];
    const first = await materializeProfessorPortrait({
      personId: "staff-1",
      sources,
      storage: { put: async () => undefined },
      fetcher: vi.fn(async () =>
        imageResponse({
          headers: {
            "content-type": "image/png",
            etag: '"portrait-v1"',
            "last-modified": "Fri, 28 Aug 2026 00:00:00 GMT",
          },
        }),
      ) as typeof fetch,
    });
    expect(first.kind).toBe("ready");
    if (first.kind !== "ready") return;
    const fetcher = vi.fn(
      async (_url: URL | RequestInfo, init?: RequestInit) => {
        expect(new Headers(init?.headers).get("if-none-match")).toBe(
          '"portrait-v1"',
        );
        return new Response(null, { status: 304 });
      },
    );
    const storage = { put: vi.fn(async () => undefined) };

    const result = await materializeProfessorPortrait({
      personId: "staff-1",
      sources,
      existing: existingFrom(first),
      storage,
      fetcher: fetcher as typeof fetch,
    });

    expect(result.kind).toBe("skipped");
    expect(storage.put).not.toHaveBeenCalled();
  });

  it("rejects redirects outside the portrait host allowlist", async () => {
    const storage = { put: vi.fn(async () => undefined) };
    const fetcher = vi.fn(
      async () =>
        new Response(null, {
          status: 302,
          headers: { location: "https://example.com/private-image" },
        }),
    );

    await expect(
      materializeProfessorPortrait({
        personId: "staff-1",
        sources: [source()],
        storage,
        fetcher: fetcher as typeof fetch,
      }),
    ).rejects.toMatchObject({ code: "all_sources_failed" });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(storage.put).not.toHaveBeenCalled();
  });

  it("cancels a streamed response as soon as it exceeds 10 MiB", async () => {
    let cancellations = 0;
    const oversizedResponse = () => {
      let emitted = 0;
      return new Response(
        new ReadableStream<Uint8Array>({
          pull(controller) {
            if (emitted < 7) {
              emitted++;
              controller.enqueue(new Uint8Array(2 * 1024 * 1024));
            } else {
              controller.close();
            }
          },
          cancel() {
            cancellations++;
          },
        }),
        { headers: { "content-type": "image/jpeg" } },
      );
    };
    const storage = { put: vi.fn(async () => undefined) };

    await expect(
      materializeProfessorPortrait({
        personId: "staff-1",
        sources: [source()],
        storage,
        fetcher: vi.fn(async () => oversizedResponse()) as typeof fetch,
      }),
    ).rejects.toMatchObject({ code: "all_sources_failed" });
    expect(cancellations).toBe(2);
    expect(storage.put).not.toHaveBeenCalled();
  });

  it("reports storage failures without producing a ready result", async () => {
    const storage = {
      put: vi.fn(async () => {
        throw new Error("storage unavailable");
      }),
    };

    await expect(
      materializeProfessorPortrait({
        personId: "staff-1",
        sources: [source()],
        storage,
        fetcher: vi.fn(async () => imageResponse()) as typeof fetch,
      }),
    ).rejects.toMatchObject({ code: "all_sources_failed" });
  });
});
