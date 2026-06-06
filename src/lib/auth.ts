import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { emailOTP } from "better-auth/plugins";
import { createAuthMiddleware, APIError } from "better-auth/api";
import { db } from "@/db";
import { users, sessions, accounts, verifications } from "@/db/schema";
import { shouldRejectOtpRequest } from "@/lib/email";

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
      async sendVerificationOTP({ email, otp, type }) {
        const apiKey = process.env.BREVO_API_KEY;
        if (!apiKey) throw new Error("BREVO_API_KEY is not configured");

        let subject: string;
        let text: string;
        if (type === "sign-in") {
          subject = "CUpedia 登录验证码";
          text = `你的登录验证码是：${otp}，5 分钟内有效。`;
        } else if (type === "email-verification") {
          subject = "CUpedia 邮箱验证码";
          text = `你的验证码是：${otp}，5 分钟内有效。`;
        } else {
          subject = "CUpedia 密码重置验证码";
          text = `你的密码重置验证码是：${otp}，5 分钟内有效。`;
        }

        const res = await fetch("https://api.brevo.com/v3/smtp/email", {
          method: "POST",
          headers: {
            "api-key": apiKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            sender: { email: process.env.EMAIL_FROM, name: "CUpedia" },
            to: [{ email }],
            subject,
            textContent: text,
          }),
        });
        if (!res.ok) {
          const body = await res.text();
          throw new Error(`Brevo API error ${res.status}: ${body}`);
        }
      },
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
