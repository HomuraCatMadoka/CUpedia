import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";
import { randomUUID } from "crypto";

import { requirePrivateMinioBucket } from "@/lib/minio-config";

const endpoint = process.env.MINIO_PORT
  ? `http://${process.env.MINIO_ENDPOINT}:${process.env.MINIO_PORT}`
  : process.env.MINIO_ENDPOINT!;

const s3 = new S3Client({
  endpoint,
  region: process.env.MINIO_REGION ?? "us-east-1",
  credentials: {
    accessKeyId: process.env.MINIO_ACCESS_KEY!,
    secretAccessKey: process.env.MINIO_SECRET_KEY!,
  },
  forcePathStyle: true,
});

const bucket = process.env.MINIO_BUCKET!;

export async function uploadFile(
  file: Buffer,
  filename: string,
  contentType: string,
) {
  const ext = filename.split(".").pop();
  const key = `${randomUUID()}.${ext}`;

  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: file,
      ContentType: contentType,
    }),
  );

  return `${process.env.MINIO_PUBLIC_URL}/${key}`;
}

export async function uploadAsset(
  file: Buffer,
  filename: string,
  contentType: string,
): Promise<{ key: string; url: string }> {
  const ext = filename.split(".").pop();
  const key = `wiki-assets/${randomUUID()}.${ext}`;

  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: file,
      ContentType: contentType,
    }),
  );

  return { key, url: `/api/wiki-assets/${key}` };
}

export async function putPublicObject(
  key: string,
  body: Buffer,
  contentType: string,
  cacheControl: string,
): Promise<void> {
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      CacheControl: cacheControl,
    }),
  );
}

export async function putPrivateObject(
  key: string,
  body: Buffer,
  contentType: string,
  cacheControl: string,
): Promise<void> {
  const privateBucket = requirePrivateMinioBucket();
  await s3.send(
    new PutObjectCommand({
      Bucket: privateBucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      CacheControl: cacheControl,
    }),
  );
}

export async function getObject(key: string) {
  return s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
}

export async function getPrivateObject(key: string) {
  return s3.send(
    new GetObjectCommand({ Bucket: requirePrivateMinioBucket(), Key: key }),
  );
}

export async function deleteObjects(keys: string[]) {
  return deleteObjectsFromBucket(bucket, keys);
}

export async function deletePrivateObjects(keys: string[]) {
  return deleteObjectsFromBucket(requirePrivateMinioBucket(), keys);
}

async function deleteObjectsFromBucket(bucketName: string, keys: string[]) {
  if (keys.length === 0) return;
  const response = await s3.send(
    new DeleteObjectsCommand({
      Bucket: bucketName,
      Delete: { Objects: keys.map((Key) => ({ Key })) },
    }),
  );
  if (response.Errors && response.Errors.length > 0) {
    throw new Error("Object storage did not delete every requested object");
  }
}
