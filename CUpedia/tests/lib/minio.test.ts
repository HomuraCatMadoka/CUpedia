import { describe, it, expect, vi } from "vitest";

vi.mock("@aws-sdk/client-s3", () => {
  const send = vi.fn();
  return {
    S3Client: vi.fn(function () { return { send }; }),
    PutObjectCommand: vi.fn(),
    GetObjectCommand: vi.fn(),
    DeleteObjectsCommand: vi.fn(),
  };
});

describe("minio helpers", () => {
  it("uploadAsset is exported", async () => {
    const mod = await import("@/lib/minio");
    expect(mod.uploadAsset).toBeDefined();
    expect(typeof mod.uploadAsset).toBe("function");
  });

  it("getObject is exported", async () => {
    const mod = await import("@/lib/minio");
    expect(mod.getObject).toBeDefined();
    expect(typeof mod.getObject).toBe("function");
  });

  it("deleteObjects is exported", async () => {
    const mod = await import("@/lib/minio");
    expect(mod.deleteObjects).toBeDefined();
    expect(typeof mod.deleteObjects).toBe("function");
  });
});
