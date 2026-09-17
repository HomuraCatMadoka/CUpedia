import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import dotenv from "dotenv";

import { isCanonicalCampusMapUuid } from "@/lib/campus-map/canonical-uuid";
import {
  campusMapProviderMappingReleaseManifestHash,
  parseCampusMapProviderMappingReleaseManifest,
  runCampusMapProviderMappingRelease,
  type CampusMapProviderMappingReleaseAction,
  type CampusMapProviderMappingReleasePorts,
} from "@/lib/campus-map/provider-mapping-release";

const USAGE =
  "Usage: pnpm campus-map:provider-mapping-release -- <validate|apply|verify> <manifest.json>";

export async function runCampusMapProviderMappingReleaseCli(
  argv = process.argv.slice(2),
) {
  const normalizedArgv = argv[0] === "--" ? argv.slice(1) : argv;
  const [requestedAction, manifestPath, ...extra] = normalizedArgv;
  if (
    extra.length > 0 ||
    !manifestPath ||
    (requestedAction !== "validate" &&
      requestedAction !== "apply" &&
      requestedAction !== "verify")
  ) {
    throw new Error(USAGE);
  }
  const parsed = parseCampusMapProviderMappingReleaseManifest(
    JSON.parse(await readFile(manifestPath, "utf8")) as unknown,
  );
  if (parsed.status === "invalid") {
    throw new Error(`Invalid release manifest: ${parsed.code}`);
  }
  const summary = {
    manifestHash: campusMapProviderMappingReleaseManifestHash(parsed.manifest),
    mappings: parsed.manifest.mappings.length,
    verifiedExisting: parsed.manifest.verifyExisting.length,
    unresolved: parsed.manifest.unresolved.length,
  };
  if (requestedAction === "validate") {
    return { status: "valid", ...summary };
  }

  dotenv.config({ path: ".env.local", quiet: true });
  const actorId = process.env.CAMPUS_MAP_PROVIDER_MAPPING_RELEASE_ACTOR_ID;
  if (!isCanonicalCampusMapUuid(actorId)) {
    throw new Error(
      "CAMPUS_MAP_PROVIDER_MAPPING_RELEASE_ACTOR_ID must name the trusted release operator",
    );
  }
  const [
    { getCampusMapCurrentPlace, listCampusMapBrowseBuildings },
    {
      CampusMapProvenanceIdentityConflictError,
      withCampusMapFactStoreTransaction,
    },
    {
      commandCampusMapProviderMapping,
      getCampusMapProviderMappingGovernance,
      resolveCampusMapProviderSelection,
    },
  ] = await Promise.all([
    import("@/lib/campus-map/fact-store"),
    import("@/lib/campus-map/fact-store-transaction"),
    import("@/lib/campus-map/provider-mapping-registry"),
  ]);
  let buildingsById: Set<string> | null = null;
  const ports: CampusMapProviderMappingReleasePorts = {
    governance: async (identity) => {
      const result = await getCampusMapProviderMappingGovernance(identity, {
        actorId,
      });
      if (result.status === "ok") {
        const latestEvent = result.events.at(-1) ?? null;
        return {
          status: "ok",
          activeTarget: result.activeTarget,
          activeProvenance: result.activeProvenance,
          latestEvent,
        };
      }
      return {
        status: "failed",
        code:
          result.status === "validation-failed"
            ? (result.errors[0]?.code ?? "validation-failed")
            : result.code,
      };
    },
    validateTarget: async (target) => {
      if (target.kind === "place") {
        return (await getCampusMapCurrentPlace(target.placeId))
          ? "valid"
          : "not-found";
      }
      buildingsById ??= new Set(
        (await listCampusMapBrowseBuildings()).map(
          (building) => building.buildingId,
        ),
      );
      return buildingsById.has(target.buildingId) ? "valid" : "not-found";
    },
    resolveProvenance: async (sources) => {
      try {
        return {
          status: "ok",
          provenanceIds: await withCampusMapFactStoreTransaction((store) =>
            store.resolveProvenanceSources(sources),
          ),
        };
      } catch (error) {
        return {
          status: "failed",
          code:
            error instanceof CampusMapProvenanceIdentityConflictError
              ? "provenance-identity-conflict"
              : "provenance-unavailable",
        };
      }
    },
    command: (command) => commandCampusMapProviderMapping(command, { actorId }),
    resolve: (identity) =>
      resolveCampusMapProviderSelection(
        identity.provider,
        identity.providerObjectId,
      ),
  };
  return {
    ...(await runCampusMapProviderMappingRelease(
      parsed.manifest,
      requestedAction as CampusMapProviderMappingReleaseAction,
      ports,
    )),
    ...summary,
  };
}

const isMain =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  runCampusMapProviderMappingReleaseCli()
    .then((result) => {
      process.stdout.write(`${JSON.stringify(result)}\n`);
      if (result.status === "failed") process.exitCode = 1;
    })
    .catch((error: unknown) => {
      process.stderr.write(
        `${error instanceof Error ? error.message : "Provider mapping release failed"}\n`,
      );
      process.exitCode = 1;
    });
}
