/** The browser-facing origin can differ from Next.js's internal listener. */
export function getConfiguredSiteOrigin(): string | null {
  const authUrl = process.env.AUTH_URL;
  if (!authUrl) return null;

  try {
    const url = new URL(authUrl);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.origin
      : null;
  } catch {
    return null;
  }
}
