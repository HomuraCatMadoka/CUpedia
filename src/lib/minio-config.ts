export function requirePrivateMinioBucket(
  environment: Record<string, string | undefined> = process.env,
) {
  const publicBucket = environment.MINIO_BUCKET?.trim();
  const privateBucket = environment.MINIO_PRIVATE_BUCKET?.trim();
  if (!publicBucket || !privateBucket || publicBucket === privateBucket) {
    throw new Error(
      "Object storage requires distinct public and private bucket names",
    );
  }
  return privateBucket;
}
