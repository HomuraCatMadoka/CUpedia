import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkStringify from "remark-stringify";
import { visit } from "unist-util-visit";
import type { Link, Image } from "mdast";
import type { Parent } from "unist";
import path from "path";
import fs from "fs";

const METADATA_RE = /^(Owner|Verification|Tags):\s*.+$/;

const IMAGE_RE = /\.(png|jpe?g|gif|webp|svg|bmp|ico)(\?|$)/i;
const IMAGE_HOST_RE = /docimg\d*\.docs\.qq\.com\/image\//i;

function isLikelyImageUrl(url: string): boolean {
  return IMAGE_RE.test(url) || IMAGE_HOST_RE.test(url);
}

function hasVisibleText(node: {
  children?: { type: string; value?: string }[];
}): boolean {
  if (!node.children || node.children.length === 0) return false;
  return node.children.some(
    (c) => (c.type === "text" && c.value?.trim() !== "") || c.type === "image",
  );
}

export function stripMetadata(content: string): string {
  const lines = content.split("\n");
  if (lines.length === 0) return content;

  const titleIdx = lines.findIndex((l) => l.startsWith("# "));
  if (titleIdx === -1) return content;

  let i = titleIdx + 1;
  if (i < lines.length && lines[i].trim() === "") i++;

  const metaStart = i;
  while (i < lines.length && METADATA_RE.test(lines[i])) {
    i++;
  }
  if (i === metaStart) return content;

  while (i < lines.length && lines[i].trim() === "") {
    i++;
  }

  const result = [...lines.slice(0, titleIdx + 1), "", ...lines.slice(i)];
  return result.join("\n");
}

const UNSAFE_SCHEMES = /^(javascript|data|vbscript):/i;

export function convertLinks(
  content: string,
  relativeDir: string,
  pathToSlug: Map<string, string>,
): string {
  const tree = unified().use(remarkParse).use(remarkGfm).parse(content);

  visit(tree, "link", (node: Link, index, parent) => {
    const url = node.url;

    if (UNSAFE_SCHEMES.test(url)) {
      node.url = "";
      return;
    }

    // Convert empty-text links: [](image-url) → ![](image-url)
    if (!hasVisibleText(node) && url) {
      if (isLikelyImageUrl(url)) {
        const img: Image = { type: "image", url, alt: "", title: null };
        if (parent && typeof index === "number") {
          (parent as Parent).children.splice(index, 1, img);
        }
        return;
      }
      // Make non-image empty links visible with their URL as text
      if (/^https?:\/\//i.test(url)) {
        try {
          const hostname = new URL(url).hostname;
          node.children = [{ type: "text", value: hostname }];
        } catch {
          node.children = [{ type: "text", value: url }];
        }
        return;
      }
    }

    if (/^https?:\/\//i.test(url) || !url.endsWith(".md")) return;

    let decoded: string;
    try {
      decoded = decodeURIComponent(url);
    } catch {
      return;
    }

    const resolved = path.posix.join(relativeDir, decoded);
    const normalized = path.posix.normalize(resolved);
    const slug = pathToSlug.get(normalized);

    if (slug) {
      node.url = `/wiki/${slug}`;
    } else {
      console.warn(`Unresolved internal link: ${decoded}`);
    }
  });

  return unified().use(remarkStringify).use(remarkGfm).stringify(tree);
}

const ALLOWED_IMAGE_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
]);
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;

export async function resolveImagePath(
  imageUrl: string,
  fileDir: string,
  exportRoot: string,
): Promise<string> {
  let decoded: string;
  try {
    decoded = decodeURIComponent(imageUrl);
  } catch {
    throw new Error(`Malformed image URL encoding: ${imageUrl}`);
  }

  if (decoded.includes("\0") || path.isAbsolute(decoded)) {
    throw new Error(`Unsafe image path: ${imageUrl}`);
  }

  const candidatePath = path.resolve(fileDir, decoded);
  const exportRootResolved = path.resolve(exportRoot);

  // Pre-check path traversal before touching the filesystem
  const preRelative = path.relative(exportRootResolved, candidatePath);
  if (
    preRelative === ".." ||
    preRelative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(preRelative)
  ) {
    throw new Error(`Image path escapes export root: ${imageUrl}`);
  }

  const candidateLstat = await fs.promises.lstat(candidatePath);

  if (candidateLstat.isSymbolicLink()) {
    throw new Error(`Symlink image paths are not allowed: ${imageUrl}`);
  }

  const candidateReal = await fs.promises.realpath(candidatePath);
  return candidateReal;
}

export async function validateImageFile(
  filePath: string,
): Promise<{ contentType: string }> {
  const ext = path.extname(filePath).toLowerCase();
  if (!ALLOWED_IMAGE_EXTENSIONS.has(ext)) {
    throw new Error(`Unsupported image extension: ${ext}`);
  }

  const stat = await fs.promises.stat(filePath);
  if (stat.size > MAX_IMAGE_SIZE) {
    throw new Error(`Image exceeds 10 MiB limit: ${filePath}`);
  }

  const { fileTypeFromBuffer } = await import("file-type");
  const buffer = await fs.promises.readFile(filePath);
  const detected = await fileTypeFromBuffer(buffer);

  const ALLOWED_MIMES = new Set([
    "image/png",
    "image/jpeg",
    "image/gif",
    "image/webp",
  ]);

  if (!detected || !ALLOWED_MIMES.has(detected.mime)) {
    throw new Error(
      `Unsupported image type for ${filePath}: detected ${detected?.mime ?? "unknown"}`,
    );
  }

  return { contentType: detected.mime };
}

type UploadFn = (
  buffer: Buffer,
  filename: string,
  contentType: string,
) => Promise<{ key: string; url: string }>;

export async function processImages(
  content: string,
  fileDir: string,
  exportRoot: string,
  upload: UploadFn,
): Promise<string> {
  const tree = unified().use(remarkParse).use(remarkGfm).parse(content);
  const imageNodes: Image[] = [];

  visit(tree, "image", (node: Image) => {
    imageNodes.push(node);
  });

  for (const node of imageNodes) {
    const url = node.url;

    if (/^https?:\/\//i.test(url)) {
      console.warn(`External image skipped: ${url}`);
      continue;
    }

    try {
      const resolvedPath = await resolveImagePath(url, fileDir, exportRoot);
      const { contentType } = await validateImageFile(resolvedPath);
      const buffer = await fs.promises.readFile(resolvedPath);
      const filename = path.basename(resolvedPath);
      const { url: assetUrl } = await upload(buffer, filename, contentType);
      node.url = assetUrl;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`Image processing failed for ${url}: ${msg}`);
    }
  }

  return unified().use(remarkStringify).use(remarkGfm).stringify(tree);
}
