import { readFile } from "node:fs/promises";
import { db } from "../src/db";
import { canteenMenuSources } from "../src/db/schema";
import { parseMenuIdentityTransitionArtifact } from "../src/lib/canteen-menu-identity-transition";
import { fetchMenuFromProvider } from "../src/lib/canteen-menu-source-adapters";
import { applyApprovedMenuIdentityTransition } from "../src/lib/canteen-menu-sync-store";
import { readMenuSyncDatabaseNow } from "../src/lib/canteen-menu-sync-clock";
import { menuObservationContextAt } from "../src/lib/canteen-menu-sync-window";
import { eq } from "drizzle-orm";

function requiredArgument(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index === -1 ? undefined : process.argv[index + 1]?.trim();
  if (!value) {
    throw new Error(
      "Usage: pnpm canteen:identity-transition:apply -- --source-id <uuid> --artifact <reviewed.json>",
    );
  }
  return value;
}

async function main() {
  const sourceId = requiredArgument("--source-id");
  const artifactPath = requiredArgument("--artifact");
  const artifact = parseMenuIdentityTransitionArtifact(
    JSON.parse(await readFile(artifactPath, "utf8")),
  );
  const source = await db.query.canteenMenuSources.findFirst({
    where: eq(canteenMenuSources.id, sourceId),
  });
  if (!source) throw new Error("MENU_SOURCE_NOT_FOUND");

  const fetched = await fetchMenuFromProvider(
    source,
    menuObservationContextAt(await readMenuSyncDatabaseNow(db)),
  );
  const evaluation = await applyApprovedMenuIdentityTransition(
    source.id,
    { ...fetched, takeOverLegacyItems: false },
    artifact,
  );
  process.stdout.write(
    `${JSON.stringify({
      sourceId: source.id,
      status: evaluation.plan.actions.length === 0 ? "unchanged" : "applied",
      itemCount: evaluation.canonicalState.input.items.length,
      createdCount: evaluation.plan.actions.filter(
        (action) => action.action === "create",
      ).length,
      updatedCount: evaluation.plan.actions.filter((action) =>
        ["update", "reactivate"].includes(action.action),
      ).length,
      deactivatedCount: evaluation.plan.actions.filter(
        (action) => action.action === "deactivate",
      ).length,
    })}\n`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "UNKNOWN_ERROR");
  process.exitCode = 1;
});
