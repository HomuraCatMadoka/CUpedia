import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { emailOTP } from "better-auth/plugins";
import { createAuthMiddleware, APIError } from "better-auth/api";
import { db } from "@/db";
import { users, sessions, accounts, verifications } from "@/db/schema";
import { shouldRejectOtpRequest } from "@/lib/email";
import { sendOtpEmail } from "@/lib/otp-email";

export const auth = betterAuth({
  secret: process.env.AUTH_SECRET,
  baseURL: process.env.AUTH_URL,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: users,
      session: sessions,
      account: accounts,
      verification: verifications,
    },
  }),
  user: {
    additionalFields: {
      nickname: { type: "string", required: false, defaultValue: "" },
      role: {
        type: ["user", "admin"],
        required: false,
        defaultValue: "user",
        input: false,
      },
      banned: {
        type: "boolean",
        required: false,
        defaultValue: false,
        input: false,
      },
    },
  },
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
  },
  plugins: [
    emailOTP({
      sendVerificationOTP: sendOtpEmail,
      otpLength: 6,
      expiresIn: 300,
    }),
  ],
  hooks: {
    // Enforce the eligible-account whitelist server-side at the email-OTP
    // boundary — the client pages check too, but that is bypassable.
    before: createAuthMiddleware(async (ctx) => {
      const email = (ctx.body as { email?: unknown } | undefined)?.email;
      if (shouldRejectOtpRequest(ctx.path, email)) {
        throw new APIError("BAD_REQUEST", { message: "仅支持 CUHK 邮箱" });
      }
    }),
  },
  advanced: {
    database: { generateId: "uuid" },
  },
  // Disable the per-IP request rate limit only under e2e, where many serial
  // sign-ins in one window would otherwise trip better-auth's 429 default.
  rateLimit: { enabled: process.env.E2E_TEST !== "1" },
  session: {
    cookieCache: {
      enabled: true,
      maxAge: 300,
    },
  },
});
