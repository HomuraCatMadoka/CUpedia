export const LOCAL_E2E_OTP = "123456";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

/** A deterministic OTP for local Playwright only. Fails closed for remote URLs. */
export function isLocalE2eRuntime(): boolean {
  if (
    process.env.E2E_TEST !== "1" ||
    !process.env.AUTH_URL ||
    !process.env.DATABASE_URL
  ) {
    return false;
  }
  try {
    const authUrl = new URL(process.env.AUTH_URL);
    const databaseName = new URL(process.env.DATABASE_URL).pathname.slice(1);
    return (
      LOCAL_HOSTS.has(authUrl.hostname) && /(^|_)e2e($|_)/i.test(databaseName)
    );
  } catch {
    return false;
  }
}

export function getLocalE2eOtp(): string | null {
  return isLocalE2eRuntime() ? LOCAL_E2E_OTP : null;
}
