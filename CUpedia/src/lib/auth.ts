import NextAuth from "next-auth";
import EmailProvider from "next-auth/providers/email";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db } from "@/db";
import {
  accounts,
  sessions,
  users,
  verificationTokens,
} from "@/db/schema";
import { checkSignIn, refreshTokenFromDb } from "@/lib/auth-callbacks";
import { consumeMagicLinkRateLimit } from "@/lib/magic-link-rate-limit";
import { normalizeEmail } from "@/lib/email";
import { eq, and } from "drizzle-orm";

async function hashToken(token: string, secret: string): Promise<string> {
  const data = new TextEncoder().encode(`${token}${secret}`);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function cleanupVerificationToken(
  identifier: string,
  rawToken: string,
  secret: string
) {
  try {
    const hashed = await hashToken(rawToken, secret);
    await db
      .delete(verificationTokens)
      .where(
        and(
          eq(verificationTokens.identifier, identifier),
          eq(verificationTokens.token, hashed)
        )
      );
  } catch (e) {
    console.error("Failed to cleanup verification token:", e);
  }
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  session: { strategy: "jwt" },
  providers: [
    EmailProvider({
      server: { host: "localhost" },
      from: process.env.EMAIL_FROM,
      async sendVerificationRequest({ identifier, token, url, provider }) {
        const normalized = normalizeEmail(identifier);
        const result = await consumeMagicLinkRateLimit(normalized);

        if (!result.ok) {
          const secret = provider.secret ?? process.env.AUTH_SECRET ?? "";
          await cleanupVerificationToken(normalized, token, secret);
          throw new Error(`RATE_LIMIT_REJECTED:${result.code}`);
        }

        const apiKey = process.env.BREVO_API_KEY;
        if (!apiKey) throw new Error("BREVO_API_KEY is not configured");

        const res = await fetch("https://api.brevo.com/v3/smtp/email", {
          method: "POST",
          headers: {
            "api-key": apiKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            sender: { email: provider.from },
            to: [{ email: normalized }],
            subject: "登录 CUpedia",
            textContent: `点击以下链接登录：${url}`,
            htmlContent: `<p>点击以下链接登录 CUpedia：</p><p><a href="${url}">登录</a></p>`,
          }),
        });

        if (!res.ok) {
          const body = await res.text();
          throw new Error(`Brevo API error ${res.status}: ${body}`);
        }
      },
    }),
  ],
  callbacks: {
    async signIn({ user }) {
      return checkSignIn(user);
    },
    async jwt({ token, user, trigger }) {
      if (user) {
        token.role = user.role ?? "user";
        token.nickname = user.nickname ?? "";
        token.banned = user.banned ?? false;
      }
      return refreshTokenFromDb(token, trigger);
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub!;
        session.user.role = token.role ?? "user";
        session.user.nickname = token.nickname ?? "";
        session.user.banned = token.banned ?? false;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
    newUser: "/nickname",
  },
});
