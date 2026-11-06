import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { users, verifications } from "@/db/schema";
import { sendOtpEmail } from "@/lib/otp-email";

vi.mock("@/lib/otp-email", () => ({ sendOtpEmail: vi.fn() }));
vi.mock("@/lib/e2e-otp", () => ({
  getLocalE2eOtp: () => null,
  isLocalE2eRuntime: () => true,
}));

const origin = "http://localhost:3000";
const oldPassword = "old-test-password";
const changedPassword = "changed-test-password";
const recoveredPassword = "recovered-test-password";

function cookies(response: Response) {
  return response.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
}

describe.skipIf(!process.env.DATABASE_URL)(
  "password change during recovery",
  () => {
    let auth: typeof import("@/lib/auth").auth;
    let db: typeof import("@/db").db;
    const emails: string[] = [];

    beforeAll(async () => {
      vi.stubEnv("AUTH_URL", origin);
      vi.stubEnv("AUTH_SECRET", "local-test-only-secret-for-password-recovery");
      ({ db } = await import("@/db"));
      ({ auth } = await import("@/lib/auth"));
    });

    afterEach(async () => {
      vi.restoreAllMocks();
      vi.mocked(sendOtpEmail).mockClear();
      for (const email of emails.splice(0)) {
        await db
          .delete(verifications)
          .where(eq(verifications.identifier, "forget-password-otp-" + email));
        await db.delete(users).where(eq(users.email, email));
      }
    });

    afterAll(async () => {
      vi.unstubAllEnvs();
      await db?.$client.end();
    });

    function send(
      path: string,
      data: Record<string, string | boolean>,
      cookie = "",
    ) {
      return auth.handler(
        new Request(origin + "/api/auth" + path, {
          method: "POST",
          headers: { origin, cookie, "content-type": "application/json" },
          body: JSON.stringify(data),
        }),
      );
    }

    async function getSession(cookie: string) {
      const response = await auth.handler(
        new Request(origin + "/api/auth/get-session", {
          headers: { cookie },
        }),
      );
      expect(response.ok).toBe(true);
      return response.json();
    }

    async function fixture() {
      const email = "recovery-test-" + randomUUID() + "@cuhk.edu.hk";
      emails.push(email);
      const signup = await send("/sign-up/email", {
        email,
        password: oldPassword,
        name: "改密测试",
        nickname: "改密测试",
      });
      expect(signup.ok).toBe(true);
      const cookie = cookies(signup);
      expect(cookie).not.toBe("");
      expect(
        (await send("/email-otp/request-password-reset", { email })).ok,
      ).toBe(true);
      const [{ otp }] = vi.mocked(sendOtpEmail).mock.lastCall!;
      return {
        cookie,
        change: (revokeOtherSessions: boolean) =>
          send(
            "/change-password",
            {
              currentPassword: oldPassword,
              newPassword: changedPassword,
              revokeOtherSessions,
            },
            cookie,
          ),
        recover: async () => {
          expect(
            (
              await send("/email-otp/reset-password", {
                email,
                otp,
                password: recoveredPassword,
              })
            ).ok,
          ).toBe(true);
        },
        signIn: (password: string) =>
          send("/sign-in/email", { email, password }),
      };
    }

    // Hold the first matching write before it reaches PostgreSQL. The other
    // request uses the same real adapter and database while this write waits.
    async function overlap(
      statementPrefix: string,
      change: () => Promise<Response>,
      recover: () => Promise<void>,
    ) {
      const client = db.$client as unknown as {
        query: (
          statement: string | { text: string },
          ...args: unknown[]
        ) => unknown;
      };
      const query = client.query.bind(client);
      let markPaused!: () => void;
      const paused = new Promise<void>((resolve) => {
        markPaused = resolve;
      });
      let release!: () => void;
      const released = new Promise<void>((resolve) => {
        release = resolve;
      });
      let held = false;
      const spy = vi
        .spyOn(client, "query")
        .mockImplementation((statement, ...args) => {
          const sql =
            typeof statement === "string" ? statement : statement.text;
          if (!held && sql.startsWith(statementPrefix)) {
            held = true;
            markPaused();
            return released.then(() => query(statement, ...args));
          }
          return query(statement, ...args);
        });
      const changeResponse = change();
      try {
        await Promise.race([
          paused,
          changeResponse.then((response) => {
            throw new Error(
              "Password change completed before reaching the expected write (" +
                response.status +
                ")",
            );
          }),
        ]);
        await recover();
      } finally {
        release();
        await changeResponse.catch(() => {});
        spy.mockRestore();
      }
      return changeResponse;
    }

    it("cannot overwrite the recovered password after validating the old password", async () => {
      const account = await fixture();
      const response = await overlap(
        'update "accounts"',
        () => account.change(false),
        account.recover,
      );

      expect((await account.signIn(recoveredPassword)).ok).toBe(true);
      expect((await account.signIn(changedPassword)).status).toBe(401);
      expect(response.status).toBe(401);
    });

    it("cannot establish a replacement session after recovery", async () => {
      const account = await fixture();
      const response = await overlap(
        'insert into "sessions"',
        () => account.change(true),
        account.recover,
      );

      expect((await getSession(cookies(response))) === null).toBe(true);
      expect(cookies(response).length).toBe(0);
      expect(response.status).toBe(401);
      expect(await getSession(account.cookie)).toBeNull();
      expect((await account.signIn(recoveredPassword)).ok).toBe(true);
    });

    it("cannot revoke a new session opened by the account owner after recovery", async () => {
      const account = await fixture();
      let recoveredCookie = "";
      const response = await overlap(
        'delete from "sessions"',
        () => account.change(true),
        async () => {
          await account.recover();
          const login = await account.signIn(recoveredPassword);
          expect(login.ok).toBe(true);
          recoveredCookie = cookies(login);
        },
      );

      expect((await getSession(recoveredCookie)) !== null).toBe(true);
      expect(response.status).toBe(401);
    });

    it.each([false, true])(
      "can change the password without recovery (revoke other sessions: %s)",
      async (revokeOtherSessions) => {
        const account = await fixture();
        const response = await account.change(revokeOtherSessions);
        expect(response.ok).toBe(true);
        if (revokeOtherSessions) {
          expect(await getSession(account.cookie)).toBeNull();
          expect(await getSession(cookies(response))).not.toBeNull();
        } else {
          expect(await getSession(account.cookie)).not.toBeNull();
          expect(cookies(response)).toBe("");
        }
        expect((await account.signIn(oldPassword)).status).toBe(401);
        expect((await account.signIn(changedPassword)).ok).toBe(true);
      },
    );
  },
);
