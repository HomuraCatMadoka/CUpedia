import { createHash, timingSafeEqual } from "node:crypto";

function secretDigest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

export function hasBearerSecret(request: Request, secret: string): boolean {
  const value = request.headers.get("authorization");
  if (!value?.startsWith("Bearer ")) return false;
  return timingSafeEqual(secretDigest(value.slice(7)), secretDigest(secret));
}
