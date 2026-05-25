export function register() {
  if (
    process.env.SKIP_EMAIL_WHITELIST === "true" &&
    process.env.NODE_ENV === "production"
  ) {
    throw new Error(
      "SKIP_EMAIL_WHITELIST must not be enabled in production. " +
        "Remove it from your environment variables.",
    );
  }
}
