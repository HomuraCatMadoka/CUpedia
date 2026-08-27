import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import dotenv from "dotenv";

import { isCanonicalCampusMapUuid } from "@/lib/campus-map/canonical-uuid";
import {
  parseCampusMapProviderMappingQaManifest,
  runCampusMapProviderMappingQaFixtures,
  type CampusMapProviderMappingQaAction,
} from "./campus-map-provider-mapping-qa-lib";

const USAGE =
  "Usage: pnpm qa:campus-map-provider-mappings -- <apply|verify|cleanup> <manifest.json>";

export async function runCampusMapProviderMappingQaCli(
  argv = process.argv.slice(2),
) {
  const [requestedAction, manifestPath, ...extra] = argv;
  if (
    extra.length > 0 ||
    !manifestPath ||
    (requestedAction !== "apply" &&
      requestedAction !== "verify" &&
      requestedAction !== "cleanup")
  ) {
    throw new Error(USAGE);
  }
  const parsed = parseCampusMapProviderMappingQaManifest(
    JSON.parse(await readFile(manifestPath, "utf8")) as unknown,
  );
  if (parsed.status === "invalid") {
    throw new Error(`Invalid QA manifest: ${parsed.code}`);
  }

  dotenv.config({ path: ".env.local", quiet: true });
  const actorId = process.env.CAMPUS_MAP_PROVIDER_MAPPING_QA_ACTOR_ID;
  if (!isCanonicalCampusMapUuid(actorId)) {
    throw new Error(
      "CAMPUS_MAP_PROVIDER_MAPPING_QA_ACTOR_ID must name the trusted local QA operator",
    );
  }
  const {
    commandCampusMapProviderMapping,
    getCampusMapProviderMappingGovernance,
    resolveCampusMapProviderSelection,
  } = await import("@/lib/campus-map/provider-mapping-registry");
  return runCampusMapProviderMappingQaFixtures(
    parsed.manifest,
    requestedAction as CampusMapProviderMappingQaAction,
    {
      command: (command) =>
        commandCampusMapProviderMapping(command, { actorId }),
      governance: (identity) =>
        getCampusMapProviderMappingGovernance(identity, { actorId }),
      resolve: (identity) =>
        resolveCampusMapProviderSelection(
          identity.provider,
          identity.providerObjectId,
        ),
    },
  );
}

const isMain =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  runCampusMapProviderMappingQaCli()
    .then((result) => {
      process.stdout.write(`${JSON.stringify(result)}\n`);
      if (result.status === "failed") process.exitCode = 1;
    })
    .catch((error: unknown) => {
      process.stderr.write(
        `${error instanceof Error ? error.message : "QA fixture command failed"}\n`,
      );
      process.exitCode = 1;
    });
}
