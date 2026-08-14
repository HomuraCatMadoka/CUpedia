import { syncEnabledCanteenMenuSources } from "../src/lib/canteen-menu-source-sync";

async function main() {
  const results = await syncEnabledCanteenMenuSources();
  process.stdout.write(`${JSON.stringify({ results }, null, 2)}\n`);
  if (
    results.some((result) =>
      ["blocked", "provider-failure", "superseded"].includes(result.status),
    )
  ) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
