import { db } from "../src/db";
import { canteenMenuSources } from "../src/db/schema";
import {
  buildMenuIdentityTransitionAudit,
  fingerprintMenuIdentityTransitionSource,
} from "../src/lib/canteen-menu-identity-transition";
import { fetchMenuFromProvider } from "../src/lib/canteen-menu-source-adapters";
import { previewMenuSync } from "../src/lib/canteen-menu-sync-store";
import { eq } from "drizzle-orm";

function requiredArgument(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index === -1 ? undefined : process.argv[index + 1]?.trim();
  if (!value) {
    throw new Error(
      "Usage: pnpm canteen:identity-transition:audit -- --source-id <uuid>",
    );
  }
  return value;
}

async function main() {
  const sourceId = requiredArgument("--source-id");
  const source = await db.query.canteenMenuSources.findFirst({
    where: eq(canteenMenuSources.id, sourceId),
  });
  if (!source) throw new Error("MENU_SOURCE_NOT_FOUND");

  const fetched = await fetchMenuFromProvider(source);
  const input = { ...fetched, takeOverLegacyItems: false };
  const preview = await previewMenuSync(source.id, input);
  if (
    !preview.blockingReasons.some(
      (reason) => reason.code === "MENU_SYNC_IDENTITY_CHURN",
    )
  ) {
    throw new Error("MENU_IDENTITY_TRANSITION_NOT_APPLICABLE");
  }
  const managed = preview.canonicalState.existingItems.filter(
    (item) => item.menuSourceId === source.id,
  );
  const audit = buildMenuIdentityTransitionAudit(
    managed,
    preview.canonicalState.input,
  );

  process.stdout.write(
    `${JSON.stringify(
      {
        schemaVersion: 3,
        source: {
          provider: source.provider,
          externalOwnerId: source.externalOwnerId,
          externalStoreId: source.externalStoreId,
          configurationFingerprint:
            fingerprintMenuIdentityTransitionSource(source),
        },
        audit,
        decisions: {
          snapshotScope: { status: "unreviewed", rationale: "" },
          replacements: [],
          additions: [],
          removals: [],
          ambiguities: [],
        },
      },
      null,
      2,
    )}\n`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "UNKNOWN_ERROR");
  process.exitCode = 1;
});
