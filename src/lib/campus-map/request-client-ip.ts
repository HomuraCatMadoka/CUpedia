export function requestClientIp(requestHeaders: Headers): string {
  const forwarded = requestHeaders
    .get("x-forwarded-for")
    ?.split(",")[0]
    ?.trim();
  return forwarded || requestHeaders.get("x-real-ip")?.trim() || "unknown";
}
