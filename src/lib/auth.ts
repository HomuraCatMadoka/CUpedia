import {
  betterAuth,
  getCurrentAdapter,
  type Account,
  type AuthContext,
} from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { emailOTP } from "better-auth/plugins";
import { createAuthMiddleware, APIError } from "better-auth/api";
import { and, eq, exists } from "drizzle-orm";
import { db } from "@/db";
import { users, sessions, accounts, verifications } from "@/db/schema";
import { normalizeEmail, shouldRejectOtpRequest } from "@/lib/email";
import { sendOtpEmail } from "@/lib/otp-email";
import { getLocalE2eOtp, isLocalE2eRuntime } from "@/lib/e2e-otp";
import { validateSignupNickname } from "@/lib/nickname";

function passwordChanged() {
  return new APIError("UNAUTHORIZED", {
    message: "密码已更新，请重新登录",
  });
}

function guardPasswordRequest(
  {
    adapter,
    password,
    internalAdapter,
  }: Pick<AuthContext, "adapter" | "password" | "internalAdapter">,
  changingPassword: boolean,
) {
  let verifiedHash: string | undefined;
  let changedCredential: { id: string; hash: string } | undefined;
  const guardedAdapter: typeof internalAdapter = {
    ...internalAdapter,
    createSession: async (...args) => {
      const session = await internalAdapter.createSession(...args);
      if (!session) return session;

      // Check after the insert, before Better Auth sends the session cookie.
      // A reset that updates the password later will see and revoke this row.
      let passwordIsCurrent = false;
      try {
        const credential = await internalAdapter.findCredentialAccount(
          session.userId,
        );
        const expectedHash = changedCredential?.hash ?? verifiedHash;
        passwordIsCurrent =
          expectedHash !== undefined && credential?.password === expectedHash;
      } finally {
        if (!passwordIsCurrent) {
          await internalAdapter.deleteSession(session.token);
        }
      }
      if (!passwordIsCurrent) throw passwordChanged();
      return session;
    },
  };

  if (changingPassword) {
    guardedAdapter.updateAccount = async (id, data) => {
      if (!verifiedHash || !data.password) throw passwordChanged();
      // A recovery that already replaced the verified password wins.
      const updated = await (
        await getCurrentAdapter(adapter)
      ).update<Account>({
        model: "account",
        where: [
          { field: "id", value: id },
          { field: "password", value: verifiedHash },
        ],
        update: data,
      });
      if (!updated) throw passwordChanged();
      changedCredential = { id, hash: data.password };
      return updated;
    };
    guardedAdapter.deleteUserSessions = async (userId) => {
      if (!changedCredential) throw passwordChanged();
      // Check the password and delete sessions in one statement so a stale
      // change cannot revoke sessions opened after recovery.
      const currentCredential = db
        .select({ id: accounts.id })
        .from(accounts)
        .where(
          and(
            eq(accounts.id, changedCredential.id),
            eq(accounts.userId, userId),
            eq(accounts.password, changedCredential.hash),
          ),
        );
      await db
        .delete(sessions)
        .where(and(eq(sessions.userId, userId), exists(currentCredential)));
    };
  }

  return {
    internalAdapter: guardedAdapter,
    password: {
      ...password,
      verify: async (input: Parameters<typeof password.verify>[0]) => {
        const valid = await password.verify(input);
        if (valid) verifiedHash = input.hash;
        return valid;
      },
    },
  };
}

export const auth = betterAuth({
  secret: process.env.AUTH_SECRET,
  baseURL: process.env.AUTH_URL,
  database: drizzleAdapter(db, {
    provider: "pg",
    transaction: true,
    schema: {
      user: users,
      session: sessions,
      account: accounts,
      verification: verifications,
    },
  }),
  user: {
    fields: { name: "nickname" },
    additionalFields: {
      nickname: { type: "string", required: true },
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
    requireEmailVerification: false,
    autoSignIn: true,
    revokeSessionsOnPasswordReset: true,
  },
  disabledPaths: [
    "/send-verification-email",
    "/verify-email",
    "/email-otp/verify-email",
  ],
  plugins: [
    emailOTP({
      sendVerificationOTP: sendOtpEmail,
      generateOTP: () => getLocalE2eOtp() ?? undefined,
      disableSignUp: true,
      otpLength: 6,
      expiresIn: 600,
      // Delayed emails must not invalidate a code the user already received.
      // Resends reuse the active code and refresh its ten-minute expiry.
      resendStrategy: "reuse",
    }),
  ],
  hooks: {
    // Enforce email eligibility server-side for registration and OTP sign-in.
    before: createAuthMiddleware(async (ctx) => {
      const changingPassword = ctx.path === "/change-password";
      if (ctx.path === "/sign-in/email" || changingPassword) {
        return {
          context: {
            context: guardPasswordRequest(ctx.context, changingPassword),
          },
        };
      }
      const body = ctx.body as
        | {
            email?: unknown;
            name?: unknown;
            nickname?: unknown;
            type?: unknown;
          }
        | undefined;
      const email = body?.email;
      if (shouldRejectOtpRequest(ctx.path, email, body?.type)) {
        throw new APIError("BAD_REQUEST", { message: "仅支持 CUHK 邮箱" });
      }
      const sendsOtp = ctx.path === "/email-otp/send-verification-otp";
      if (sendsOtp && body?.type === "email-verification") {
        throw new APIError("BAD_REQUEST", { message: "注册无需邮箱验证码" });
      }
      const isOtpLogin =
        ctx.path === "/sign-in/email-otp" ||
        (sendsOtp && body?.type === "sign-in");
      if (isOtpLogin && typeof email === "string") {
        const account = await ctx.context.internalAdapter.findUserByEmail(
          normalizeEmail(email),
        );
        if (!account) {
          throw new APIError("BAD_REQUEST", {
            message: "账号尚未注册，请先注册",
          });
        }
        // Proving ownership of an unverified address must also replace the
        // password set by whoever registered it. Use the recovery flow for that.
        if (!account.user.emailVerified) {
          throw new APIError("BAD_REQUEST", {
            message: "请使用密码登录，忘记密码可通过邮件重置",
          });
        }
      }
      if (ctx.path === "/sign-up/email") {
        const nickname = validateSignupNickname(body?.nickname);
        if (!nickname.ok) {
          throw new APIError("BAD_REQUEST", { message: nickname.error });
        }
        if (body) body.nickname = nickname.nickname;
      }
      if (ctx.path === "/update-user" && body) {
        for (const field of ["name", "nickname"] as const) {
          if (body[field] === undefined) continue;
          const nickname = validateSignupNickname(body[field]);
          if (!nickname.ok) {
            throw new APIError("BAD_REQUEST", { message: nickname.error });
          }
          body[field] = nickname.nickname;
        }
      }
    }),
  },
  advanced: {
    database: { generateId: "uuid" },
  },
  // Disable the per-IP request rate limit only under e2e, where many serial
  // sign-ins in one window would otherwise trip better-auth's 429 default.
  rateLimit: { enabled: !isLocalE2eRuntime() },
  session: {
    expiresIn: 60 * 60 * 24 * 365,
    updateAge: 60 * 60 * 24,
    // Every session read must see sessions revoked during password recovery.
    cookieCache: { enabled: false },
  },
});
