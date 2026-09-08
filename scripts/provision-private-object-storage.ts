import {
  CreateBucketCommand,
  DeleteBucketCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
  ListBucketsCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";

import { requirePrivateMinioBucket } from "@/lib/minio-config";

type StorageCommand =
  | CreateBucketCommand
  | DeleteBucketCommand
  | DeleteObjectCommand
  | HeadBucketCommand
  | ListBucketsCommand
  | PutObjectCommand;

export type StorageClient = {
  send(command: StorageCommand): Promise<unknown>;
};

type ProvisioningEnvironment = Record<string, string | undefined>;

export type ProvisioningConfig = {
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  privateBucket: string;
};

function requireValue(environment: ProvisioningEnvironment, key: string) {
  const value = environment[key]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

export function readProvisioningConfig(
  environment: ProvisioningEnvironment,
): ProvisioningConfig {
  const endpointHost = requireValue(environment, "MINIO_ENDPOINT");
  const privateBucket = requirePrivateMinioBucket(environment);
  const confirmation = requireValue(
    environment,
    "PROVISION_PRIVATE_BUCKET_CONFIRM",
  );

  if (confirmation !== privateBucket) {
    throw new Error(
      "PROVISION_PRIVATE_BUCKET_CONFIRM must exactly match MINIO_PRIVATE_BUCKET",
    );
  }

  return {
    endpoint: environment.MINIO_PORT?.trim()
      ? `http://${endpointHost}:${environment.MINIO_PORT.trim()}`
      : endpointHost,
    region: environment.MINIO_REGION?.trim() || "us-east-1",
    accessKeyId: requireValue(environment, "MINIO_ACCESS_KEY"),
    secretAccessKey: requireValue(environment, "MINIO_SECRET_KEY"),
    privateBucket,
  };
}

function errorDetails(error: unknown) {
  if (!error || typeof error !== "object") {
    return { name: undefined, status: undefined };
  }

  const candidate = error as {
    name?: string;
    Code?: string;
    $metadata?: { httpStatusCode?: number };
  };
  return {
    name: candidate.name ?? candidate.Code,
    status: candidate.$metadata?.httpStatusCode,
  };
}

export function summarizeStorageError(error: unknown): string {
  if (error instanceof AggregateError) {
    const nested = error.errors.map(summarizeStorageError).join("; ");
    return `${error.message}: ${nested}`;
  }

  const { name, status } = errorDetails(error);
  const message = error instanceof Error ? error.message : "Unknown error";
  const details = [
    name && name !== message ? `type=${name}` : undefined,
    status ? `http=${status}` : undefined,
  ].filter(Boolean);
  return details.length > 0 ? `${message} (${details.join(", ")})` : message;
}

function privateObjectUrl(endpoint: string, bucket: string, key: string) {
  const baseUrl = endpoint.replace(/\/$/, "");
  return `${baseUrl}/${encodeURIComponent(bucket)}/${encodeURIComponent(key)}`;
}

function bucketNames(response: unknown) {
  if (!response || typeof response !== "object") {
    throw new Error("Object storage returned an invalid bucket list");
  }
  const buckets = (response as { Buckets?: Array<{ Name?: string }> }).Buckets;
  if (!Array.isArray(buckets)) return [];
  return buckets.flatMap((bucket) =>
    typeof bucket.Name === "string" ? [bucket.Name] : [],
  );
}

export async function createPrivateBucket(
  client: StorageClient,
  privateBucket: string,
  endpoint: string,
  anonymousGet: (url: string) => Promise<{ status: number }>,
) {
  const existingBuckets = bucketNames(
    await client.send(new ListBucketsCommand({})),
  );
  if (existingBuckets.includes(privateBucket)) {
    throw new Error(
      "Refusing to reuse an existing bucket because its anonymous access cannot be proven through the S3 API",
    );
  }

  await client.send(new CreateBucketCommand({ Bucket: privateBucket }));
  const probeKey = `.cupedia-private-probe-${randomUUID()}`;
  let probeCreated = false;

  try {
    await client.send(
      new PutObjectCommand({
        Bucket: privateBucket,
        Key: probeKey,
        Body: "CUpedia private bucket access probe",
        ContentType: "text/plain",
      }),
    );
    probeCreated = true;

    const response = await anonymousGet(
      privateObjectUrl(endpoint, privateBucket, probeKey),
    );
    if (response.status !== 401 && response.status !== 403) {
      throw new Error(
        `Anonymous private-bucket probe returned unexpected HTTP ${response.status}`,
      );
    }

    await client.send(
      new DeleteObjectCommand({ Bucket: privateBucket, Key: probeKey }),
    );
    probeCreated = false;
    await client.send(new HeadBucketCommand({ Bucket: privateBucket }));
    return { anonymousStatus: response.status };
  } catch (error) {
    const rollbackErrors: unknown[] = [];
    if (probeCreated) {
      try {
        await client.send(
          new DeleteObjectCommand({ Bucket: privateBucket, Key: probeKey }),
        );
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError);
      }
    }
    try {
      await client.send(new DeleteBucketCommand({ Bucket: privateBucket }));
    } catch (rollbackError) {
      rollbackErrors.push(rollbackError);
    }

    if (rollbackErrors.length > 0) {
      throw new AggregateError(
        [error, ...rollbackErrors],
        "Private bucket verification failed and rollback was incomplete",
      );
    }
    throw error;
  }
}

export async function main(environment: ProvisioningEnvironment = process.env) {
  const config = readProvisioningConfig(environment);
  const s3 = new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    forcePathStyle: true,
  });
  const client: StorageClient = {
    send: (command) => {
      if (command instanceof CreateBucketCommand) return s3.send(command);
      if (command instanceof DeleteBucketCommand) return s3.send(command);
      if (command instanceof DeleteObjectCommand) return s3.send(command);
      if (command instanceof HeadBucketCommand) return s3.send(command);
      if (command instanceof ListBucketsCommand) return s3.send(command);
      if (command instanceof PutObjectCommand) return s3.send(command);
      throw new Error("Unsupported object-storage command");
    },
  };

  const result = await createPrivateBucket(
    client,
    config.privateBucket,
    config.endpoint,
    (url) =>
      fetch(url, {
        method: "GET",
        redirect: "manual",
        cache: "no-store",
      }),
  );
  console.log(`Created private object-storage bucket: ${config.privateBucket}`);
  console.log(
    `Verified that anonymous object reads are denied (HTTP ${result.anonymousStatus}).`,
  );
}

const entrypoint = process.argv[1];
if (entrypoint && import.meta.url === pathToFileURL(entrypoint).href) {
  void main().catch((error: unknown) => {
    console.error(summarizeStorageError(error));
    process.exitCode = 1;
  });
}
