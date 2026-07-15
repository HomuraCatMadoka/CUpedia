import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthEndpoint } from "better-auth/api";
import { checkRegistrationOtp } from "@/lib/registration-otp";

const PATH = "/register/check-otp";

function parseBody(body: unknown): { email: string; otp: string } | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return null;
  }
  const { email, otp } = body as Record<string, unknown>;
  if (
    typeof email !== "string" ||
    typeof otp !== "string" ||
    !/^\d{6}$/.test(otp)
  ) {
    return null;
  }
  return { email, otp };
}

export function registrationOtpPlugin() {
  return {
    id: "registration-otp",
    endpoints: {
      checkRegistrationOtp: createAuthEndpoint(
        PATH,
        { method: "POST" },
        async (ctx) => {
          const body = parseBody(ctx.body);
          if (!body) {
            throw new APIError("BAD_REQUEST", {
              message: "验证码无效或已过期",
            });
          }
          if (!(await checkRegistrationOtp(body.email, body.otp))) {
            throw new APIError("BAD_REQUEST", {
              message: "验证码无效或已过期",
            });
          }
          return ctx.json({ ok: true });
        },
      ),
    },
    rateLimit: [
      {
        pathMatcher: (path: string) => path === PATH,
        window: 60,
        max: 3,
      },
    ],
  } satisfies BetterAuthPlugin;
}
