import { createHash } from "node:crypto";

import { fileTypeFromBuffer } from "file-type";
import sharp from "sharp";

import {
  selectProfessorDepartmentSource,
  type ProfessorCardSource,
} from "@/lib/professor-card-source";

const CACHE_CONTROL = "public, max-age=31536000, immutable";
const MAX_SOURCE_BYTES = 10 * 1024 * 1024;
const MAX_REDIRECTS = 4;

export type ProfessorPortrait = {
  src256: string;
  src384: string;
  width256: number;
  height256: number;
  width384: number;
  height384: number;
};

export type PortraitStorage = {
  put(input: {
    key: string;
    body: Buffer;
    contentType: "image/webp";
    cacheControl: string;
  }): Promise<void>;
};

export type ExistingPortraitAsset = {
  status: "pending" | "ready" | "failed";
  sourceFingerprint: string | null;
  materializedSourceUrl: string | null;
  contentHash: string | null;
  webp256Key: string | null;
  webp384Key: string | null;
  sourceEtag: string | null;
  sourceLastModified: string | null;
};

export type MaterializedPortrait = {
  kind: "ready";
  sourceFingerprint: string;
  sourceUrl: string;
  sourceEtag: string | null;
  sourceLastModified: string | null;
  contentHash: string;
  webp256Key: string;
  webp384Key: string;
  width256: number;
  height256: number;
  width384: number;
  height384: number;
};

export type UnchangedPortrait = {
  kind: "skipped";
  sourceFingerprint: string;
  sourceUrl: string;
  sourceEtag: string | null;
  sourceLastModified: string | null;
  contentHash: string;
};

export type PortraitMaterializationResult =
  | MaterializedPortrait
  | UnchangedPortrait;

export class PortraitMaterializationError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "PortraitMaterializationError";
    this.code = code;
  }
}

export function isAllowedProfessorPortraitUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      (url.hostname === "cuhk.edu.hk" ||
        url.hostname.endsWith(".cuhk.edu.hk") ||
        url.hostname === "i0.wp.com")
    );
  } catch {
    return false;
  }
}

export function selectProfessorPortraitCandidates(
  sources: ProfessorCardSource[],
): string[] {
  const departmentImage = selectProfessorDepartmentSource(sources)?.imageUrl;
  const portalImage = sources.find(
    (source) =>
      source.source === "cuhk_research_portal" &&
      source.isCurrent &&
      Boolean(source.imageUrl),
  )?.imageUrl;

  return Array.from(
    new Set(
      [departmentImage, portalImage].filter((url): url is string =>
        Boolean(url),
      ),
    ),
  );
}

export function portraitSourceFingerprint(candidates: string[]): string {
  return createHash("sha256").update(candidates.join("\n")).digest("hex");
}

function publicPortraitUrl(key: string): string | null {
  const baseUrl = process.env.MINIO_PUBLIC_URL?.replace(/\/$/, "");
  return baseUrl ? `${baseUrl}/${key}` : null;
}

export function toProfessorPortrait(asset: {
  webp256Key: string | null;
  webp384Key: string | null;
  width256: number | null;
  height256: number | null;
  width384: number | null;
  height384: number | null;
}): ProfessorPortrait | null {
  const src256 = asset.webp256Key ? publicPortraitUrl(asset.webp256Key) : null;
  const src384 = asset.webp384Key ? publicPortraitUrl(asset.webp384Key) : null;
  return src256 &&
    src384 &&
    asset.width256 &&
    asset.height256 &&
    asset.width384 &&
    asset.height384
    ? {
        src256,
        src384,
        width256: asset.width256,
        height256: asset.height256,
        width384: asset.width384,
        height384: asset.height384,
      }
    : null;
}

export function portraitAttemptUpdate(
  status: "pending" | "failed",
  attemptedSourceFingerprint: string,
  now: Date,
  errorCode: string | null = null,
) {
  return {
    status,
    attemptedSourceFingerprint,
    lastAttemptAt: now,
    errorCode,
    updatedAt: now,
  } as const;
}

export function readyPortraitUpdate(
  result: PortraitMaterializationResult,
  now: Date,
) {
  return {
    status: "ready" as const,
    attemptedSourceFingerprint: result.sourceFingerprint,
    sourceFingerprint: result.sourceFingerprint,
    materializedSourceUrl: result.sourceUrl,
    sourceEtag: result.sourceEtag,
    sourceLastModified: result.sourceLastModified,
    contentHash: result.contentHash,
    lastAttemptAt: now,
    errorCode: null,
    updatedAt: now,
    ...(result.kind === "ready"
      ? {
          webp256Key: result.webp256Key,
          webp384Key: result.webp384Key,
          width256: result.width256,
          height256: result.height256,
          width384: result.width384,
          height384: result.height384,
          materializedAt: now,
        }
      : {}),
  };
}

async function readBoundedBody(response: Response): Promise<Buffer> {
  if (!response.body) {
    throw new PortraitMaterializationError(
      "source_empty",
      "Portrait source has no response body",
    );
  }
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_SOURCE_BYTES) {
        await reader.cancel("portrait source exceeds size limit");
        throw new PortraitMaterializationError(
          "source_too_large",
          "Portrait source is larger than 10 MiB",
        );
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  if (totalBytes === 0) {
    throw new PortraitMaterializationError(
      "source_empty",
      "Portrait source is empty",
    );
  }
  return Buffer.concat(chunks, totalBytes);
}

type SourceImageResult =
  | {
      kind: "downloaded";
      bytes: Buffer;
      sourceEtag: string | null;
      sourceLastModified: string | null;
    }
  | { kind: "not_modified" };

async function fetchSourceImage(
  sourceUrl: string,
  fetcher: typeof fetch,
  existing: ExistingPortraitAsset | null,
): Promise<SourceImageResult> {
  let currentUrl = sourceUrl;
  const canRevalidate =
    existing?.materializedSourceUrl === sourceUrl &&
    Boolean(existing.contentHash) &&
    Boolean(existing.webp256Key) &&
    Boolean(existing.webp384Key);
  const headers: Record<string, string> = {
    "user-agent": "CUpedia portrait importer/1.0",
  };
  if (canRevalidate && existing?.sourceEtag) {
    headers["if-none-match"] = existing.sourceEtag;
  }
  if (canRevalidate && existing?.sourceLastModified) {
    headers["if-modified-since"] = existing.sourceLastModified;
  }

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount++) {
    if (!isAllowedProfessorPortraitUrl(currentUrl)) {
      throw new PortraitMaterializationError(
        "source_not_allowed",
        `Portrait source is not allowed: ${currentUrl}`,
      );
    }

    const response = await fetcher(currentUrl, {
      redirect: "manual",
      signal: AbortSignal.timeout(15_000),
      headers,
    });
    if (response.status === 304 && canRevalidate) {
      return { kind: "not_modified" };
    }
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || redirectCount === MAX_REDIRECTS) {
        throw new PortraitMaterializationError(
          "redirect_rejected",
          "Portrait source redirected too many times or without a location",
        );
      }
      currentUrl = new URL(location, currentUrl).toString();
      continue;
    }
    if (!response.ok) {
      throw new PortraitMaterializationError(
        "source_http_error",
        `Portrait source returned HTTP ${response.status}`,
      );
    }

    const contentType = response.headers
      .get("content-type")
      ?.split(";", 1)[0]
      ?.trim()
      .toLowerCase();
    if (!contentType?.startsWith("image/")) {
      throw new PortraitMaterializationError(
        "source_content_type_rejected",
        `Portrait source returned ${contentType ?? "no Content-Type"}`,
      );
    }
    const contentLengthHeader = response.headers.get("content-length");
    const contentLength = contentLengthHeader
      ? Number(contentLengthHeader)
      : null;
    if (
      contentLength !== null &&
      (!Number.isFinite(contentLength) ||
        contentLength < 0 ||
        contentLength > MAX_SOURCE_BYTES)
    ) {
      throw new PortraitMaterializationError(
        "source_too_large",
        "Portrait source has an invalid size or is larger than 10 MiB",
      );
    }
    const bytes = await readBoundedBody(response);
    const detected = await fileTypeFromBuffer(bytes);
    if (!detected?.mime.startsWith("image/")) {
      throw new PortraitMaterializationError(
        "source_not_image",
        "Portrait source is not a recognized image",
      );
    }
    return {
      kind: "downloaded",
      bytes,
      sourceEtag: response.headers.get("etag"),
      sourceLastModified: response.headers.get("last-modified"),
    };
  }

  throw new PortraitMaterializationError(
    "redirect_rejected",
    "Portrait source redirected too many times",
  );
}

async function createVariant(input: Buffer, size: 256 | 384) {
  const { data, info } = await sharp(input, {
    failOn: "error",
    limitInputPixels: 40_000_000,
  })
    .rotate()
    .resize(size, size, { fit: "cover", position: "attention" })
    .webp({ quality: 76, effort: 4 })
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

function transformedContentHash(webp256: Buffer, webp384: Buffer): string {
  return createHash("sha256")
    .update("professor-portrait-webp-v1\0")
    .update(webp256)
    .update("\0")
    .update(webp384)
    .digest("hex")
    .slice(0, 24);
}

export async function materializeProfessorPortrait(input: {
  personId: string;
  sources: ProfessorCardSource[];
  existing?: ExistingPortraitAsset | null;
  storage: PortraitStorage;
  fetcher?: typeof fetch;
}): Promise<PortraitMaterializationResult> {
  const candidates = selectProfessorPortraitCandidates(input.sources);
  const sourceFingerprint = portraitSourceFingerprint(candidates);
  if (candidates.length === 0) {
    throw new PortraitMaterializationError(
      "no_source",
      "Professor has no current portrait source",
    );
  }

  const existing = input.existing ?? null;
  const failures: string[] = [];
  for (const sourceUrl of candidates) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const fetched = await fetchSourceImage(
          sourceUrl,
          input.fetcher ?? fetch,
          existing,
        );
        if (fetched.kind === "not_modified") {
          return {
            kind: "skipped",
            sourceFingerprint,
            sourceUrl,
            sourceEtag: existing?.sourceEtag ?? null,
            sourceLastModified: existing?.sourceLastModified ?? null,
            contentHash: existing!.contentHash!,
          };
        }
        const [webp256, webp384] = await Promise.all([
          createVariant(fetched.bytes, 256),
          createVariant(fetched.bytes, 384),
        ]);
        const contentHash = transformedContentHash(webp256.data, webp384.data);
        if (
          existing?.contentHash === contentHash &&
          existing.webp256Key &&
          existing.webp384Key
        ) {
          return {
            kind: "skipped",
            sourceFingerprint,
            sourceUrl,
            sourceEtag: fetched.sourceEtag,
            sourceLastModified: fetched.sourceLastModified,
            contentHash,
          };
        }
        const baseKey = `professor-portraits/${input.personId}/${contentHash}`;
        const webp256Key = `${baseKey}-256.webp`;
        const webp384Key = `${baseKey}-384.webp`;
        await Promise.all([
          input.storage.put({
            key: webp256Key,
            body: webp256.data,
            contentType: "image/webp",
            cacheControl: CACHE_CONTROL,
          }),
          input.storage.put({
            key: webp384Key,
            body: webp384.data,
            contentType: "image/webp",
            cacheControl: CACHE_CONTROL,
          }),
        ]);
        return {
          kind: "ready",
          sourceFingerprint,
          sourceUrl,
          sourceEtag: fetched.sourceEtag,
          sourceLastModified: fetched.sourceLastModified,
          contentHash,
          webp256Key,
          webp384Key,
          width256: webp256.width,
          height256: webp256.height,
          width384: webp384.width,
          height384: webp384.height,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        failures.push(`${sourceUrl} attempt ${attempt}: ${message}`);
      }
    }
  }

  throw new PortraitMaterializationError(
    "all_sources_failed",
    failures.join("; ").slice(0, 1_000),
  );
}
