import {
  CreateBucketCommand,
  DeleteBucketCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { describe, expect, it, vi } from "vitest";

import {
  createPrivateBucket,
  readProvisioningConfig,
  summarizeStorageError,
  type StorageClient,
} from "../../scripts/provision-private-object-storage";

const validEnvironment = {
  MINIO_ENDPOINT: "https://storage.example.com",
  MINIO_REGION: "us-east-1",
  MINIO_ACCESS_KEY: "access-key",
  MINIO_SECRET_KEY: "secret-key",
  MINIO_BUCKET: "public-assets",
  MINIO_PRIVATE_BUCKET: "private-assets",
  PROVISION_PRIVATE_BUCKET_CONFIRM: "private-assets",
};

describe("readProvisioningConfig", () => {
  it("accepts distinct public and private buckets with exact confirmation", () => {
    expect(readProvisioningConfig(validEnvironment)).toEqual({
      endpoint: "https://storage.example.com",
      region: "us-east-1",
      accessKeyId: "access-key",
      secretAccessKey: "secret-key",
      privateBucket: "private-assets",
    });
  });

  it("rejects a private bucket that matches the public bucket", () => {
    expect(() =>
      readProvisioningConfig({
        ...validEnvironment,
        MINIO_PRIVATE_BUCKET: "public-assets",
        PROVISION_PRIVATE_BUCKET_CONFIRM: "public-assets",
      }),
    ).toThrow("distinct public and private bucket names");
  });

  it("requires the confirmation to exactly match the private bucket", () => {
    expect(() =>
      readProvisioningConfig({
        ...validEnvironment,
        PROVISION_PRIVATE_BUCKET_CONFIRM: "PROVISION",
      }),
    ).toThrow(
      "PROVISION_PRIVATE_BUCKET_CONFIRM must exactly match MINIO_PRIVATE_BUCKET",
    );
  });
});

describe("summarizeStorageError", () => {
  it("reports only the safe error type and HTTP status", () => {
    const error = Object.assign(new Error("UnknownError"), {
      name: "AccessDenied",
      $metadata: { httpStatusCode: 403 },
    });

    expect(summarizeStorageError(error)).toBe(
      "UnknownError (type=AccessDenied, http=403)",
    );
  });
});

describe("createPrivateBucket", () => {
  it("creates a new bucket and proves that anonymous object reads fail", async () => {
    const send = vi
      .fn<StorageClient["send"]>()
      .mockRejectedValueOnce({
        name: "NotFound",
        $metadata: { httpStatusCode: 404 },
      })
      .mockResolvedValue({});
    const anonymousGet = vi.fn().mockResolvedValue({ status: 403 });

    await expect(
      createPrivateBucket(
        { send },
        "private-assets",
        "https://storage.example.com",
        anonymousGet,
      ),
    ).resolves.toEqual({ anonymousStatus: 403 });
    expect(send.mock.calls[0]?.[0]).toBeInstanceOf(HeadBucketCommand);
    expect(send.mock.calls[1]?.[0]).toBeInstanceOf(CreateBucketCommand);
    expect(send.mock.calls[2]?.[0]).toBeInstanceOf(PutObjectCommand);
    expect(send.mock.calls[3]?.[0]).toBeInstanceOf(DeleteObjectCommand);
    expect(send.mock.calls[4]?.[0]).toBeInstanceOf(HeadBucketCommand);
    expect(anonymousGet).toHaveBeenCalledWith(
      expect.stringMatching(
        /^https:\/\/storage\.example\.com\/private-assets\/\.cupedia-private-probe-/,
      ),
    );
  });

  it("refuses to reuse an existing bucket", async () => {
    const send = vi.fn<StorageClient["send"]>().mockResolvedValue({});
    const anonymousGet = vi.fn();

    await expect(
      createPrivateBucket(
        { send },
        "private-assets",
        "https://storage.example.com",
        anonymousGet,
      ),
    ).rejects.toThrow("Refusing to reuse an existing bucket");
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]?.[0]).toBeInstanceOf(HeadBucketCommand);
    expect(anonymousGet).not.toHaveBeenCalled();
  });

  it("does not turn access errors into bucket creation", async () => {
    const accessDenied = Object.assign(new Error("denied"), {
      name: "AccessDenied",
      $metadata: { httpStatusCode: 403 },
    });
    const send = vi.fn<StorageClient["send"]>().mockRejectedValue(accessDenied);

    await expect(
      createPrivateBucket(
        { send },
        "private-assets",
        "https://storage.example.com",
        vi.fn(),
      ),
    ).rejects.toBe(accessDenied);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("removes the probe and fresh bucket when anonymous reads succeed", async () => {
    const send = vi
      .fn<StorageClient["send"]>()
      .mockRejectedValueOnce({ name: "NotFound" })
      .mockResolvedValue({});

    await expect(
      createPrivateBucket(
        { send },
        "private-assets",
        "https://storage.example.com",
        vi.fn().mockResolvedValue({ status: 200 }),
      ),
    ).rejects.toThrow("unexpected HTTP 200");
    expect(send.mock.calls[3]?.[0]).toBeInstanceOf(DeleteObjectCommand);
    expect(send.mock.calls[4]?.[0]).toBeInstanceOf(DeleteBucketCommand);
  });
});
