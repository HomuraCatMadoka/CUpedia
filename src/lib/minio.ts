import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";
import { randomUUID } from "crypto";

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

export async function getObject(key: string) {
  return s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
}

export async function deleteObjects(keys: string[]) {
  if (keys.length === 0) return;
  await s3.send(
    new DeleteObjectsCommand({
      Bucket: bucket,
      Delete: { Objects: keys.map((Key) => ({ Key })) },
    }),
  );
}
