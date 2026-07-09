import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  TARGET_TERMS,
  type PlannerSubjectFile,
  type TargetTerm,
  buildTeachingStaffIndex,
  toTeachingStaffDatabase,
} from "./crawl-teaching-staff-lib";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const DEFAULT_DATA_BASE =
  "https://another-cuhk-course-planner.com/data";
const GITHUB_DATA_API =
  "https://api.github.com/repos/EagleZhen/another-cuhk-course-planner/contents/web/public/data";
const GITHUB_RAW_BASE =
  "https://raw.githubusercontent.com/EagleZhen/another-cuhk-course-planner/main/web/public/data";

const DEFAULT_OUTPUT = resolve(
  root,
  "src/app/(main)/courses/mock/teaching-staff.json",
);

type CliOptions = {
  subjects: string[] | null;
  output: string;
  dryRun: boolean;
  useGithub: boolean;
  delayMs: number;
};

function parseArgs(argv: string[]): CliOptions {
  let subjects: string[] | null = null;
  let output = DEFAULT_OUTPUT;
  let dryRun = false;
  let useGithub = false;
  let delayMs = 150;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dry-run") dryRun = true;
    else if (arg === "--use-github") useGithub = true;
    else if (arg === "--subjects") {
      const value = argv[++i];
      if (!value) throw new Error("--subjects requires a comma-separated list");
      subjects = value.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
    } else if (arg === "--out") {
      const value = argv[++i];
      if (!value) throw new Error("--out requires a path");
      output = resolve(root, value);
    } else if (arg === "--delay-ms") {
      const value = Number(argv[++i]);
      if (!Number.isFinite(value) || value < 0) {
        throw new Error("--delay-ms requires a non-negative number");
      }
      delayMs = value;
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return { subjects, output, dryRun, useGithub, delayMs };
}

function printHelp() {
  console.log(`Usage: pnpm crawl:teaching-staff [options]

Fetch course data from another-cuhk-course-planner and build a Teaching Staff JSON database.

Options:
  --subjects CSCI,MATH   Only crawl listed subject codes (default: all)
  --out <path>           Output JSON path (default: src/app/(main)/courses/mock/teaching-staff.json)
  --dry-run              Print stats without writing the file
  --use-github           Use GitHub raw JSON instead of the live site
  --delay-ms <n>         Delay between subject fetches (default: 150)
  -h, --help             Show this help
`);
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "CUpedia-teaching-staff-crawler",
    },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  return (await res.json()) as T;
}

async function discoverSubjects(useGithub: boolean): Promise<string[]> {
  if (useGithub) {
    const listing = await fetchJson<Array<{ name: string }>>(GITHUB_DATA_API);
    return listing
      .map((entry) => entry.name.replace(/\.json$/i, ""))
      .filter((code) => code.length > 0)
      .sort();
  }

  // Live site has no manifest; fall back to GitHub listing for subject discovery.
  const listing = await fetchJson<Array<{ name: string }>>(GITHUB_DATA_API);
  return listing
    .map((entry) => entry.name.replace(/\.json$/i, ""))
    .filter((code) => code.length > 0)
    .sort();
}

function subjectUrl(subject: string, useGithub: boolean): string {
  const base = useGithub ? GITHUB_RAW_BASE : DEFAULT_DATA_BASE;
  return `${base}/${subject}.json`;
}

async function fetchSubjectFile(
  subject: string,
  useGithub: boolean,
): Promise<PlannerSubjectFile | null> {
  try {
    return await fetchJson<PlannerSubjectFile>(subjectUrl(subject, useGithub));
  } catch (error) {
    console.warn(`  ⚠ skipped ${subject}: ${String(error)}`);
    return null;
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const source = options.useGithub
    ? "github:EagleZhen/another-cuhk-course-planner"
    : "another-cuhk-course-planner.com";

  console.log(`▶ Teaching Staff crawler`);
  console.log(`  source: ${source}`);
  console.log(`  terms:  ${TARGET_TERMS.join(", ")}`);

  const allSubjects = await discoverSubjects(options.useGithub);
  const subjects = options.subjects ?? allSubjects;
  console.log(`  subjects: ${subjects.length}`);

  const subjectFiles: PlannerSubjectFile[] = [];
  for (let i = 0; i < subjects.length; i++) {
    const subject = subjects[i]!;
    process.stdout.write(`  [${i + 1}/${subjects.length}] ${subject} … `);
    const file = await fetchSubjectFile(subject, options.useGithub);
    if (file?.courses?.length) {
      subjectFiles.push(file);
      console.log(`${file.courses.length} courses`);
    } else {
      console.log("no data");
    }
    if (i < subjects.length - 1 && options.delayMs > 0) {
      await sleep(options.delayMs);
    }
  }

  const index = buildTeachingStaffIndex(
    subjectFiles,
    TARGET_TERMS as readonly TargetTerm[],
  );
  const database = toTeachingStaffDatabase(index, {
    source,
    terms: TARGET_TERMS,
    subjectCount: subjectFiles.length,
  });

  console.log(`\n✓ ${database.metadata.staff_count} teaching staff records`);
  console.log(
    `  sample: ${database.staff
      .slice(0, 3)
      .map((s) => `${s["Teaching Staff"]} (${s["Teaching Courses"].length} courses)`)
      .join("; ")}`,
  );

  if (options.dryRun) {
    console.log("\n(dry-run — file not written)");
    return;
  }

  await mkdir(dirname(options.output), { recursive: true });
  await writeFile(options.output, `${JSON.stringify(database, null, 2)}\n`, "utf8");
  console.log(`\n✓ Wrote ${options.output}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
