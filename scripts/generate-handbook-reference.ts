import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, resolve } from "node:path";

type ManifestEntry = {
  file: string;
  programme: string;
  handbookYear: string;
  programmeKind: "major";
};

const scriptDir = import.meta.dirname;
const handbookDir = resolve(scriptDir, "data/handbook");
const outputDir = resolve(scriptDir, "data/handbook-reference");
mkdirSync(outputDir, { recursive: true });
const schema = resolve(scriptDir, "handbook-reference.schema.json");
const manifest = JSON.parse(
  readFileSync(resolve(handbookDir, "manifest.json"), "utf8"),
) as ManifestEntry[];
const force = process.argv.includes("--force");
const requested = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const entries = requested.length
  ? requested.map((file) => {
      const entry = manifest.find((row) => row.file === file);
      if (!entry) throw new Error(`not in manifest: ${file}`);
      return entry;
    })
  : manifest;
const codex = existsSync("/Applications/ChatGPT.app/Contents/Resources/codex")
  ? "/Applications/ChatGPT.app/Contents/Resources/codex"
  : "codex";

const normalize = (html: string) =>
  html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();

for (const entry of entries) {
  const output = resolve(
    outputDir,
    basename(entry.file, ".html") + ".reference.json",
  );
  if (existsSync(output) && !force) {
    console.log(`skip ${entry.file}`);
    continue;
  }
  const source = normalize(
    readFileSync(resolve(handbookDir, entry.file), "utf8"),
  );
  const prompt = `Parse the complete principal undergraduate Major Programme Requirement below into the required JSON schema. Metadata is authoritative: sourceFile=${entry.file}; programme=${entry.programme}; handbookYear=${entry.handbookYear}. title is the programme heading immediately before Applicable to students admitted, without Major Programme Requirement. Preserve explicit categories even when members cannot be enumerated, using textualRule. Put stream alternatives and nested baskets in groups. Expand every slash/or alternative and deduplicate members. Course shorthand inherits the nearest explicit subject, except after a closed parenthetical alternative where the outer subject resumes. Bracketed numeric or subject notation is ambiguous unless explicitly explained; keep the visible current course code and record the ambiguity. Evidence must be a short contiguous verbatim substring of SOURCE after whitespace collapse. Do not include recommended course patterns, postgraduate requirements, or separate senior-year/double-degree programmes in the principal category list; record their existence in ambiguities. Return JSON only and do not call tools.\n\nSOURCE:\n${source}`;
  const env = { ...process.env };
  delete env.OPENAI_API_KEY;
  delete env.CODEX_API_KEY;
  const draft = output + ".draft";
  const run = (task: string, target: string) =>
    spawnSync(
      codex,
      [
        "exec",
        "--ephemeral",
        "--ignore-rules",
        "-m",
        "gpt-5.3-codex-spark",
        "-c",
        'model_reasoning_summary="none"',
        "-c",
        'model_reasoning_effort="high"',
        "-s",
        "read-only",
        "--output-schema",
        schema,
        "--output-last-message",
        target,
        task,
      ],
      {
        cwd: resolve(scriptDir, ".."),
        env,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
  if (!existsSync(draft)) {
    const result = run(prompt, draft);
    if (result.status !== 0) {
      throw new Error(`${entry.file}: ${result.stderr || result.stdout}`);
    }
  }
  const review = `Audit and correct the DRAFT against SOURCE, returning the complete corrected JSON. Keep authoritative metadata unchanged. Check every title, total, category, kind, units, pickN, member, textual rule, group and constraint. The title is the programme heading immediately before Applicable to students admitted. Expand every slash/or alternative, correctly inherit shorthand subjects, restore the outer subject after parenthetical alternatives, and deduplicate all members. Every evidence value must be a short contiguous verbatim substring of SOURCE. Exclude recommended patterns and separate programme blocks. Return JSON only and do not call tools.\n\nDRAFT:\n${readFileSync(draft, "utf8")}\n\nSOURCE:\n${source}`;
  const reviewed = run(review, output);
  if (reviewed.status !== 0) {
    throw new Error(
      `${entry.file} review: ${reviewed.stderr || reviewed.stdout}`,
    );
  }
  const record = JSON.parse(readFileSync(output, "utf8")) as {
    title: string;
    evidence: { title: string; totalUnits: string };
    categories: Array<{
      name: string;
      members: string[];
      textualRule: string | null;
      evidence: string;
      groups: Array<{
        name: string;
        members: string[];
        textualRule: string | null;
        evidence: string;
      }>;
    }>;
  };
  const excerpt = (current: string, candidates: Array<string | null>) => {
    if (source.includes(normalize(current))) return current;
    for (const candidate of candidates) {
      if (!candidate) continue;
      const index = source.indexOf(normalize(candidate));
      if (index >= 0) return source.slice(index, index + 180);
    }
    throw new Error(`${entry.file}: cannot anchor evidence ${current}`);
  };
  const label = (value: string) =>
    value
      .split(" - ")
      .at(-1)!
      .replace(/^\d+\.\s*/, "")
      .replace(/\s*\([^)]*\)\s*$/, "");
  record.evidence.title = excerpt(record.evidence.title, [record.title]);
  const total =
    source.match(/minimum of\s+\d+(?:\s*\[[^\]]+\])?\s*units/i)?.[0] ?? null;
  record.evidence.totalUnits = excerpt(record.evidence.totalUnits, [total]);
  for (const category of record.categories) {
    category.members = [...new Set(category.members)];
    category.evidence = excerpt(category.evidence, [
      label(category.name),
      category.textualRule,
      category.members[0] ?? null,
    ]);
    for (const group of category.groups) {
      group.members = [...new Set(group.members)];
      group.evidence = excerpt(group.evidence, [
        label(group.name),
        group.textualRule,
        group.members[0] ?? null,
      ]);
    }
  }
  writeFileSync(output, JSON.stringify(record, null, 2) + "\n");
  unlinkSync(draft);
  console.log(`generated ${entry.file}`);
}
