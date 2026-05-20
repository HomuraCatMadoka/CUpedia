import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { stripMetadata, convertLinks, resolveImagePath, validateImageFile, processImages } from "../../scripts/import-notion-transforms";
import fs from "fs";
import path from "path";
import os from "os";

describe("stripMetadata", () => {
  it("removes Owner, Verification, Tags after title", () => {
    const input = `# 入学准备（必读）

Owner: Andrew
Verification: Verified
Tags: 入学前

# 来港前

正文内容`;
    const result = stripMetadata(input);
    expect(result).toBe(`# 入学准备（必读）

# 来港前

正文内容`);
  });

  it("removes only Owner line when others are absent", () => {
    const input = `# 简单页面

Owner: Andrew

正文`;
    const result = stripMetadata(input);
    expect(result).toBe(`# 简单页面

正文`);
  });

  it("does not touch content without metadata", () => {
    const input = `# 纯内容

这里没有元数据`;
    const result = stripMetadata(input);
    expect(result).toBe(input);
  });

  it("does not strip metadata-like lines deep in content", () => {
    const input = `# 标题

正文

Owner: 这不是元数据，是正文里的`;
    const result = stripMetadata(input);
    expect(result).toBe(input);
  });
});

describe("convertLinks", () => {
  const pathToSlug = new Map([
    ["入学准备（必读）/生活物品 afea2c2e1ae541e88b320cabc0d2864c.md", "入学准备-必读/生活物品"],
    ["序/第一版编者按（2021ver） 6d69ec3e2aa34f7393a6ea630a5b7425.md", "序/第一版编者按-2021ver"],
  ]);

  it("converts a URL-encoded Notion link to wiki route", () => {
    const input = `[生活物品](%E5%85%A5%E5%AD%A6%E5%87%86%E5%A4%87%EF%BC%88%E5%BF%85%E8%AF%BB%EF%BC%89/%E7%94%9F%E6%B4%BB%E7%89%A9%E5%93%81%20afea2c2e1ae541e88b320cabc0d2864c.md)`;
    const result = convertLinks(input, ".", pathToSlug);
    expect(result).toContain("/wiki/入学准备-必读/生活物品");
  });

  it("resolves relative paths from nested dirs", () => {
    const input = `[第一版编者按（2021ver）](%E5%BA%8F/%E7%AC%AC%E4%B8%80%E7%89%88%E7%BC%96%E8%80%85%E6%8C%89%EF%BC%882021ver%EF%BC%89%206d69ec3e2aa34f7393a6ea630a5b7425.md)`;
    const result = convertLinks(input, ".", pathToSlug);
    expect(result).toContain("/wiki/序/第一版编者按-2021ver");
  });

  it("leaves external links unchanged", () => {
    const input = `[顺丰](https://htm.sf-express.com/hk/tc/)`;
    const result = convertLinks(input, ".", pathToSlug);
    expect(result).toContain("https://htm.sf-express.com/hk/tc/");
  });

  it("leaves unmatched .md links unchanged", () => {
    const input = `[未知页面](unknown%20abc123.md)`;
    const result = convertLinks(input, ".", pathToSlug);
    expect(result).toContain("unknown%20abc123.md");
  });

  it("does not touch image links", () => {
    const input = `![Untitled](images/Untitled.png)`;
    const result = convertLinks(input, ".", pathToSlug);
    expect(result).toContain("images/Untitled.png");
  });

  it("blocks javascript: scheme links", () => {
    const input = `[click](javascript:alert(1))`;
    const result = convertLinks(input, ".", pathToSlug);
    expect(result).not.toContain("javascript:");
  });

  it("blocks data: scheme links", () => {
    const input = `[click](data:text/html,<h1>hi</h1>)`;
    const result = convertLinks(input, ".", pathToSlug);
    expect(result).not.toContain("data:");
  });
});

describe("resolveImagePath", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "import-test-"));
    fs.mkdirSync(path.join(tmpDir, "subdir"));
    fs.writeFileSync(path.join(tmpDir, "subdir", "image.png"), "fake-png");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it("resolves a valid relative image path", async () => {
    const result = await resolveImagePath("subdir/image.png", tmpDir, tmpDir);
    const expected = fs.realpathSync(path.join(tmpDir, "subdir", "image.png"));
    expect(result).toBe(expected);
  });

  it("decodes URL-encoded paths", async () => {
    fs.writeFileSync(path.join(tmpDir, "subdir", "图片.png"), "fake");
    const encoded = "subdir/%E5%9B%BE%E7%89%87.png";
    const result = await resolveImagePath(encoded, tmpDir, tmpDir);
    const expected = fs.realpathSync(path.join(tmpDir, "subdir", "图片.png"));
    expect(result).toBe(expected);
  });

  it("rejects absolute paths", async () => {
    await expect(resolveImagePath("/etc/passwd", tmpDir, tmpDir)).rejects.toThrow("Unsafe image path");
  });

  it("rejects paths with NUL bytes", async () => {
    await expect(resolveImagePath("sub\0dir/img.png", tmpDir, tmpDir)).rejects.toThrow("Unsafe image path");
  });

  it("rejects paths escaping export root via ..", async () => {
    await expect(resolveImagePath("../../etc/passwd", tmpDir, tmpDir)).rejects.toThrow("escapes export root");
  });

  it("rejects symlinks", async () => {
    const linkPath = path.join(tmpDir, "link.png");
    fs.symlinkSync("/etc/passwd", linkPath);
    await expect(resolveImagePath("link.png", tmpDir, tmpDir)).rejects.toThrow("Symlink");
  });

  it("rejects non-existent files", async () => {
    await expect(resolveImagePath("nope.png", tmpDir, tmpDir)).rejects.toThrow();
  });
});

describe("validateImageFile", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "validate-img-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it("rejects unsupported extensions", async () => {
    const svgPath = path.join(tmpDir, "icon.svg");
    fs.writeFileSync(svgPath, "<svg></svg>");
    await expect(validateImageFile(svgPath)).rejects.toThrow("Unsupported image extension");
  });

  it("rejects files over 10 MiB", async () => {
    const bigPath = path.join(tmpDir, "big.png");
    fs.writeFileSync(bigPath, Buffer.alloc(11 * 1024 * 1024));
    await expect(validateImageFile(bigPath)).rejects.toThrow("10 MiB");
  });

  it("accepts a real PNG file", async () => {
    const pngPath = path.join(tmpDir, "real.png");
    const pngSignature = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
      0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xde,
      0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41, 0x54,
      0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00, 0x00,
      0x00, 0x02, 0x00, 0x01, 0xe2, 0x21, 0xbc, 0x33,
      0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44,
      0xae, 0x42, 0x60, 0x82,
    ]);
    fs.writeFileSync(pngPath, pngSignature);
    const result = await validateImageFile(pngPath);
    expect(result.contentType).toBe("image/png");
  });

  it("accepts mismatched extension if detected MIME is allowed (png extension, jpeg content)", async () => {
    const fakePath = path.join(tmpDir, "fake.png");
    // Minimal JPEG: SOI + APP0 header
    const jpegBytes = Buffer.from([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46,
      0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01,
      0x00, 0x01, 0x00, 0x00, 0xff, 0xd9,
    ]);
    fs.writeFileSync(fakePath, jpegBytes);
    const result = await validateImageFile(fakePath);
    expect(result.contentType).toBe("image/jpeg");
  });

  it("rejects file with unrecognized magic bytes", async () => {
    const badPath = path.join(tmpDir, "bad.png");
    fs.writeFileSync(badPath, Buffer.from("not an image at all"));
    await expect(validateImageFile(badPath)).rejects.toThrow("Unsupported");
  });
});

describe("processImages", () => {
  let tmpDir: string;
  const PNG_BYTES = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xde,
    0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41, 0x54,
    0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00, 0x00,
    0x00, 0x02, 0x00, 0x01, 0xe2, 0x21, 0xbc, 0x33,
    0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44,
    0xae, 0x42, 0x60, 0x82,
  ]);

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "proc-img-"));
    fs.mkdirSync(path.join(tmpDir, "subdir"));
    fs.writeFileSync(path.join(tmpDir, "subdir", "Untitled.png"), PNG_BYTES);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  const mockUpload = vi.fn().mockResolvedValue({
    key: "wiki-assets/test-uuid.png",
    url: "/api/wiki-assets/wiki-assets/test-uuid.png",
  });

  it("replaces local image URLs with uploaded asset URLs", async () => {
    mockUpload.mockClear();
    const input = `# Title\n\n![Untitled](subdir/Untitled.png)\n`;
    const result = await processImages(input, tmpDir, tmpDir, mockUpload);
    expect(result).toContain("/api/wiki-assets/");
    expect(result).not.toContain("subdir/Untitled.png");
    expect(mockUpload).toHaveBeenCalledOnce();
  });

  it("leaves external http images with a warning", async () => {
    mockUpload.mockClear();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const input = `![ext](https://example.com/img.png)\n`;
    const result = await processImages(input, tmpDir, tmpDir, mockUpload);
    expect(result).toContain("https://example.com/img.png");
    expect(mockUpload).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("does not touch image-like text in code blocks", async () => {
    mockUpload.mockClear();
    const input = "```\n![not-real](fake.png)\n```\n";
    const result = await processImages(input, tmpDir, tmpDir, mockUpload);
    expect(result).toContain("![not-real](fake.png)");
    expect(mockUpload).not.toHaveBeenCalled();
  });
});
