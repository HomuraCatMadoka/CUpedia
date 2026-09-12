import { constants } from "node:fs";
import { access, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import dotenv from "dotenv";

import { isCanonicalCampusMapUuid } from "@/lib/campus-map/canonical-uuid";
import {
  approveCampusMapOfficialFacilityManifest,
  parseCampusMapOfficialFacilityManifest,
  validateCampusMapOfficialFacilityManifest,
  type CampusMapOfficialFacilityBatch,
} from "@/lib/campus-map/official-facility-manifest";
import {
  buildCampusMapOfficialFacilityManifest,
  fetchCampusMapOfficialFacilitySources,
} from "@/lib/campus-map/official-facility-source";
import type { CampusMapOfficialFacilityProgressRecord } from "@/lib/campus-map/official-facility-import";

const USAGE = `Usage:
  pnpm campus-map:official-facilities -- fetch <manifest.json> --accessed-on YYYY-MM-DD --manifest-version VERSION
  pnpm campus-map:official-facilities -- validate <manifest.json>
  pnpm campus-map:official-facilities -- approve <manifest.json> --reviewed-by NAME --reviewed-on YYYY-MM-DD [--output <approved.json>]
  pnpm campus-map:official-facilities -- publish <approved.json> --batch <canary|res> --progress <progress.json>`;

interface ParsedArguments {
  action: string;
  manifestPath: string;
  flags: Map<string, string>;
}

interface ProgressFile {
  schemaVersion: "cuhk-campus-map-official-facility-progress/1";
  manifestHash: string;
  records: CampusMapOfficialFacilityProgressRecord[];
}

function parseArguments(argv: string[]): ParsedArguments {
  const normalizedArgv = argv[0] === "--" ? argv.slice(1) : argv;
  const [action, manifestPath, ...rest] = normalizedArgv;
  if (!action || !manifestPath || action.startsWith("--")) {
    throw new Error(USAGE);
  }
  const flags = new Map<string, string>();
  for (let index = 0; index < rest.length; index += 2) {
    const name = rest[index];
    const value = rest[index + 1];
    if (!name?.startsWith("--") || !value || value.startsWith("--")) {
      throw new Error(USAGE);
    }
    if (flags.has(name)) throw new Error(`Duplicate option: ${name}`);
    flags.set(name, value);
  }
  return { action, manifestPath: resolve(manifestPath), flags };
}

function requireFlag(flags: Map<string, string>, name: string): string {
  const value = flags.get(name);
  if (!value) throw new Error(`Missing ${name}\n${USAGE}`);
  return value;
}

function assertOnlyFlags(flags: Map<string, string>, allowed: string[]): void {
  const allowedSet = new Set(allowed);
  const unknown = [...flags.keys()].find((key) => !allowedSet.has(key));
  if (unknown) throw new Error(`Unknown option: ${unknown}\n${USAGE}`);
}

async function writeJsonAtomically(
  path: string,
  value: unknown,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporaryPath, path);
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function parseBatch(value: string): CampusMapOfficialFacilityBatch {
  if (value !== "canary" && value !== "res") {
    throw new Error("--batch must be canary or res");
  }
  return value;
}

function progressRecordLooksValid(
  value: unknown,
  manifestHash: string,
): value is CampusMapOfficialFacilityProgressRecord {
  return (
    value !== null &&
    typeof value === "object" &&
    "manifestHash" in value &&
    value.manifestHash === manifestHash &&
    "batch" in value &&
    (value.batch === "canary" || value.batch === "res") &&
    "chunkKey" in value &&
    typeof value.chunkKey === "string" &&
    "status" in value &&
    (value.status === "already-present" || value.status === "published") &&
    "changesetId" in value &&
    (value.changesetId === null || typeof value.changesetId === "string") &&
    "completedAt" in value &&
    typeof value.completedAt === "string" &&
    "bindings" in value &&
    Array.isArray(value.bindings)
  );
}

async function loadProgress(
  path: string,
  manifestHash: string,
): Promise<ProgressFile> {
  if (!(await pathExists(path))) {
    return {
      schemaVersion: "cuhk-campus-map-official-facility-progress/1",
      manifestHash,
      records: [],
    };
  }
  const value = await readJson(path);
  if (
    value === null ||
    typeof value !== "object" ||
    !("schemaVersion" in value) ||
    value.schemaVersion !== "cuhk-campus-map-official-facility-progress/1" ||
    !("manifestHash" in value) ||
    value.manifestHash !== manifestHash ||
    !("records" in value) ||
    !Array.isArray(value.records) ||
    !value.records.every((record) =>
      progressRecordLooksValid(record, manifestHash),
    )
  ) {
    throw new Error("Progress file does not belong to this manifest");
  }
  const records = value.records;
  const recordKeys = records.map(
    (record) => `${record.batch}:${record.chunkKey}`,
  );
  if (new Set(recordKeys).size !== recordKeys.length) {
    throw new Error("Progress file contains duplicate chunk records");
  }
  return {
    schemaVersion: "cuhk-campus-map-official-facility-progress/1",
    manifestHash,
    records,
  };
}

async function recordProgress(
  path: string,
  progress: ProgressFile,
  record: CampusMapOfficialFacilityProgressRecord,
): Promise<void> {
  const existingIndex = progress.records.findIndex(
    (candidate) =>
      candidate.batch === record.batch &&
      candidate.chunkKey === record.chunkKey,
  );
  if (existingIndex < 0) {
    progress.records.push(record);
  } else if (
    progress.records[existingIndex]!.status !== "published" ||
    record.status === "published"
  ) {
    progress.records[existingIndex] = record;
  }
  progress.records.sort((left, right) =>
    `${left.batch === "canary" ? "0" : "1"}:${left.chunkKey}`.localeCompare(
      `${right.batch === "canary" ? "0" : "1"}:${right.chunkKey}`,
    ),
  );
  await writeJsonAtomically(path, progress);
}

export async function runCampusMapOfficialFacilitiesCli(
  argv = process.argv.slice(2),
): Promise<unknown> {
  const { action, manifestPath, flags } = parseArguments(argv);
  if (action === "fetch") {
    assertOnlyFlags(flags, ["--accessed-on", "--manifest-version"]);
    const manifest = buildCampusMapOfficialFacilityManifest({
      sources: await fetchCampusMapOfficialFacilitySources(),
      accessedOn: requireFlag(flags, "--accessed-on"),
      manifestVersion: requireFlag(flags, "--manifest-version"),
    });
    const validation = validateCampusMapOfficialFacilityManifest(manifest);
    if (validation.status === "invalid") {
      throw new Error(
        `Generated manifest is invalid: ${validation.errors.join(", ")}`,
      );
    }
    await writeJsonAtomically(manifestPath, manifest);
    return {
      status: "fetched",
      manifestPath,
      manifestHash: manifest.manifestHash,
      entries: manifest.entries.length,
    };
  }

  if (action === "validate") {
    assertOnlyFlags(flags, []);
    return validateCampusMapOfficialFacilityManifest(
      await readJson(manifestPath),
    );
  }

  if (action === "approve") {
    assertOnlyFlags(flags, ["--reviewed-by", "--reviewed-on", "--output"]);
    const parsed = parseCampusMapOfficialFacilityManifest(
      await readJson(manifestPath),
    );
    if (parsed.status === "invalid") {
      throw new Error(`Invalid manifest: ${parsed.errors.join(", ")}`);
    }
    const approved = approveCampusMapOfficialFacilityManifest(
      parsed.manifest,
      requireFlag(flags, "--reviewed-by"),
      requireFlag(flags, "--reviewed-on"),
    );
    const validation = validateCampusMapOfficialFacilityManifest(approved, {
      requireApproval: true,
    });
    if (validation.status === "invalid") {
      throw new Error(
        `Approved manifest is invalid: ${validation.errors.join(", ")}`,
      );
    }
    const outputPath = resolve(flags.get("--output") ?? manifestPath);
    await writeJsonAtomically(outputPath, approved);
    return {
      status: "approved",
      manifestPath: outputPath,
      manifestHash: approved.manifestHash,
    };
  }

  if (action === "publish") {
    assertOnlyFlags(flags, ["--batch", "--progress"]);
    const value = await readJson(manifestPath);
    const parsed = parseCampusMapOfficialFacilityManifest(value, {
      requireApproval: true,
    });
    if (parsed.status === "invalid") {
      throw new Error(`Invalid approved manifest: ${parsed.errors.join(", ")}`);
    }
    const batch = parseBatch(requireFlag(flags, "--batch"));
    const progressPath = resolve(requireFlag(flags, "--progress"));
    const progress = await loadProgress(
      progressPath,
      parsed.manifest.manifestHash,
    );
    dotenv.config({ path: ".env.local", quiet: true });
    const actorId = process.env.CAMPUS_MAP_OFFICIAL_FACILITY_ACTOR_ID;
    if (!isCanonicalCampusMapUuid(actorId)) {
      throw new Error(
        "CAMPUS_MAP_OFFICIAL_FACILITY_ACTOR_ID must name the trusted operator",
      );
    }
    const { importCampusMapOfficialFacilities } =
      await import("@/lib/campus-map/official-facility-import");
    const result = await importCampusMapOfficialFacilities(
      parsed.manifest,
      {
        actorId,
        clientIp:
          process.env.CAMPUS_MAP_OFFICIAL_FACILITY_CLIENT_IP ?? "127.0.0.1",
      },
      {
        batch,
        onProgress: (record) => recordProgress(progressPath, progress, record),
      },
    );
    return { ...result, progressPath };
  }

  throw new Error(USAGE);
}

const isMain =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  runCampusMapOfficialFacilitiesCli()
    .then((result) => {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      if (
        result !== null &&
        typeof result === "object" &&
        "status" in result &&
        result.status !== "fetched" &&
        result.status !== "approved" &&
        result.status !== "valid" &&
        result.status !== "imported"
      ) {
        process.exitCode = 1;
      }
    })
    .catch((error: unknown) => {
      process.stderr.write(
        `${error instanceof Error ? error.message : "Official facility command failed"}\n`,
      );
      process.exitCode = 1;
    });
}
