import { Client } from "pg";
import {
  canteenMenuIdentityPreflightExitCode,
  formatCanteenMenuIdentityPreflightHuman,
  isCanteenMenuIdentityApplicationCommit,
  runCanteenMenuIdentityPreflight,
} from "@/lib/canteen-menu-identity-preflight";
import { CANTEEN_MENU_IDENTITY_PREFLIGHT_CONTRACT as CONTRACT } from "@/lib/canteen-menu-identity-preflight-contract";

type OutputFormat = "human" | "json";

async function main() {
  const generatedAt = new Date();
  let format: OutputFormat;
  try {
    format = parseFormat(process.argv.slice(2));
  } catch {
    writeError(
      "human",
      CONTRACT.resultCodes.configurationError,
      generatedAt,
      isCanteenMenuIdentityApplicationCommit(
        process.env.PREFLIGHT_APPLICATION_COMMIT ?? "",
      )
        ? process.env.PREFLIGHT_APPLICATION_COMMIT
        : undefined,
    );
    process.exitCode = CONTRACT.exitCodes.configurationError;
    return;
  }

  const connectionString = process.env.DATABASE_URL;
  const applicationCommit = process.env.PREFLIGHT_APPLICATION_COMMIT?.trim();
  if (
    !connectionString ||
    !applicationCommit ||
    !isCanteenMenuIdentityApplicationCommit(applicationCommit)
  ) {
    writeError(
      format,
      CONTRACT.resultCodes.configurationError,
      generatedAt,
      isCanteenMenuIdentityApplicationCommit(applicationCommit ?? "")
        ? applicationCommit
        : undefined,
    );
    process.exitCode = CONTRACT.exitCodes.configurationError;
    return;
  }

  const client = new Client({ connectionString });
  try {
    await client.connect();
    const report = await runCanteenMenuIdentityPreflight(client, {
      applicationCommit,
      generatedAt,
    });
    process.stdout.write(
      format === "json"
        ? `${JSON.stringify(report, null, 2)}\n`
        : formatCanteenMenuIdentityPreflightHuman(report),
    );
    process.exitCode = canteenMenuIdentityPreflightExitCode(report);
  } catch {
    writeError(
      format,
      CONTRACT.resultCodes.databaseError,
      generatedAt,
      applicationCommit,
    );
    process.exitCode = CONTRACT.exitCodes.databaseError;
  } finally {
    await client.end().catch(() => undefined);
  }
}

function parseFormat(args: string[]): OutputFormat {
  if (args.length === 0) return "human";
  if (args.length === 1 && args[0] === "--format=json") return "json";
  if (args.length === 1 && args[0] === "--format=human") return "human";
  throw new Error("PREFLIGHT_ARGUMENT_ERROR");
}

function writeError(
  format: OutputFormat,
  resultCode:
    | typeof CONTRACT.resultCodes.configurationError
    | typeof CONTRACT.resultCodes.databaseError,
  generatedAt: Date,
  applicationCommit?: string,
) {
  const error = {
    schemaVersion: CONTRACT.reportSchemaVersion,
    contractVersion: CONTRACT.contractVersion,
    targetIssue: CONTRACT.targetIssue,
    applicationCommit: applicationCommit || "unavailable",
    generatedAt: generatedAt.toISOString(),
    result: "error" as const,
    resultCode,
  };
  process.stdout.write(
    format === "json"
      ? `${JSON.stringify(error, null, 2)}\n`
      : [
          `Canteen menu identity preflight: ${resultCode}`,
          `Contract: ${error.contractVersion}`,
          `Target issue: #${error.targetIssue}`,
          `Application commit: ${error.applicationCommit}`,
          `Generated: ${error.generatedAt}`,
          "No database diagnostics were emitted.",
          "",
        ].join("\n"),
  );
}

void main();
