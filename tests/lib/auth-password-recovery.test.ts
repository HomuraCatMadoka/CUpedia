import { afterEach, expect, it, vi } from "vitest";
import { sendOtpEmail } from "@/lib/otp-email";

vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/lib/otp-email", () => ({ sendOtpEmail: vi.fn() }));
vi.mock("better-auth/adapters/drizzle", async () => {
  const { memoryAdapter } = await import("better-auth/adapters/memory");
  return {
    drizzleAdapter: () =>
      memoryAdapter({ user: [], account: [], session: [], verification: [] }),
  };
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

it("rejects a password sign-in that was still creating its session during recovery", async () => {
  const origin = "http://localhost:3000";
  vi.stubEnv("AUTH_URL", origin);
  vi.stubEnv("AUTH_SECRET", "local-test-only-secret-for-password-recovery");
  vi.stubEnv("SKIP_EMAIL_WHITELIST", "false");
  const { auth } = await import("@/lib/auth");
  const email = "1155123456@link.cuhk.edu.hk";
  const oldPassword = "old-test-password";
  const newPassword = "new-test-password";
  const send = (path: string, body: Record<string, string>) =>
    auth.handler(
      new Request(`${origin}/api/auth${path}`, {
        method: "POST",
        headers: { origin, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    );

  const signup = await send("/sign-up/email", {
    email,
    password: oldPassword,
    name: "测试用户",
    nickname: "测试用户",
  });
  expect(signup.ok).toBe(true);
  const { user } = (await signup.json()) as { user: { id: string } };
  expect((await send("/email-otp/request-password-reset", { email })).ok).toBe(
    true,
  );
  const [{ otp }] = vi.mocked(sendOtpEmail).mock.lastCall!;

  const { adapter, internalAdapter } = await auth.$context;
  const create = adapter.create.bind(adapter);
  let reachInsert!: () => void;
  const reachedInsert = new Promise<void>((resolve) => {
    reachInsert = resolve;
  });
  let resumeInsert!: () => void;
  const insertAllowed = new Promise<void>((resolve) => {
    resumeInsert = resolve;
  });
  // Pause after the old password is accepted, before the session row exists.
  vi.spyOn(adapter, "create").mockImplementationOnce(async (input) => {
    expect(input.model).toBe("session");
    reachInsert();
    await insertAllowed;
    return create(input);
  });

  const signIn = send("/sign-in/email", { email, password: oldPassword });
  try {
    await Promise.race([
      reachedInsert,
      signIn.then(() => {
        throw new Error("Sign-in finished before reaching the session insert");
      }),
    ]);
    const reset = await send("/email-otp/reset-password", {
      email,
      otp,
      password: newPassword,
    });
    expect(reset.ok).toBe(true);
  } finally {
    resumeInsert();
  }

  const staleSignIn = await signIn;
  expect(staleSignIn.status).toBe(401);
  expect(staleSignIn.headers.get("set-cookie")).toBeNull();
  expect(await internalAdapter.listSessions(user.id)).toHaveLength(0);
  expect(
    (await send("/sign-in/email", { email, password: newPassword })).ok,
  ).toBe(true);
});
