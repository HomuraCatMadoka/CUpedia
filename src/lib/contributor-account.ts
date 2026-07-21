import { and, eq, isNotNull, ne } from "drizzle-orm";
import { db } from "@/db";
import { accounts } from "@/db/schema";
import { requireAuth } from "@/lib/auth-guard";

export type MissingContributorSetup = {
  nickname: boolean;
  password: boolean;
};

export class AccountSetupRequiredError extends Error {
  readonly code = "ACCOUNT_SETUP_REQUIRED";

  constructor(readonly needs: MissingContributorSetup) {
    super("ACCOUNT_SETUP_REQUIRED");
    this.name = "AccountSetupRequiredError";
  }
}

export async function getContributorSetup(user: {
  id: string;
  nickname: string;
}) {
  const credential = await db.query.accounts.findFirst({
    where: and(
      eq(accounts.userId, user.id),
      eq(accounts.providerId, "credential"),
      isNotNull(accounts.password),
      ne(accounts.password, ""),
    ),
    columns: { id: true },
  });
  return {
    nickname: user.nickname.trim().length === 0,
    password: !credential,
  };
}

export async function requireCompleteContributor() {
  const user = await requireAuth();
  return assertContributorComplete(user);
}

export async function assertContributorComplete<
  T extends { id: string; nickname: string },
>(user: T): Promise<T> {
  const needs = await getContributorSetup(user);

  if (needs.nickname || needs.password) {
    throw new AccountSetupRequiredError(needs);
  }

  return user;
}
