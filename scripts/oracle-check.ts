// Dev-only oracle 校验：把自爬 courses.json 与第三方数据（AGPL 课程数据集）对照。
// 第三方数据只在本地当校验参照，绝不入库/提交（见 docs/adr/0005）。
//
// 提供 oracle 来源二选一（缺省则打印用法后退出）：
//   ORACLE_DIR=/path/to/dataset             本地克隆目录，读 <SUBJECT>.json
//   ORACLE_BASE_URL=https://raw.githubusercontent.com/.../data   按 subject 拉取
//
// 报告：每个 subject 的课号集合差异（自爬独有 / oracle 独有）+ 自爬侧关键字段缺失计数。
// 防御式从 oracle JSON 文本抽课号，不假设其字段名。报告性质，不作硬门禁。
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, existsSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CODE_RE = /\b[A-Z]{3,4}\d{4}\b/g;

type RawCourse = {
  code?: string;
  subject?: string;
  title?: string;
  units?: unknown;
};

async function oracleCodes(subject: string): Promise<Set<string> | null> {
  const dir = process.env.ORACLE_DIR;
  const base = process.env.ORACLE_BASE_URL;
  let text: string | null = null;
  if (dir) {
    const f = resolve(dir, `${subject}.json`);
    text = existsSync(f) ? readFileSync(f, "utf8") : null;
  } else if (base) {
    const r = await fetch(`${base.replace(/\/$/, "")}/${subject}.json`);
    text = r.ok ? await r.text() : null;
  }
  if (text == null) return null;
  return new Set(text.match(CODE_RE) ?? []);
}

function bySubject(courses: RawCourse[]): Map<string, Set<string>> {
  const m = new Map<string, Set<string>>();
  for (const c of courses) {
    const code = (c.code ?? "").toUpperCase();
    const subject = (
      c.subject ??
      code.match(/^[A-Z]{3,4}/)?.[0] ??
      ""
    ).toUpperCase();
    if (!subject || !code) continue;
    (m.get(subject) ?? m.set(subject, new Set()).get(subject)!).add(code);
  }
  return m;
}

async function main() {
  if (!process.env.ORACLE_DIR && !process.env.ORACLE_BASE_URL) {
    console.log(
      "Set ORACLE_DIR (local dataset clone) or ORACLE_BASE_URL. Skipping.",
    );
    return;
  }
  const courses = JSON.parse(
    readFileSync(resolve(__dirname, "data/courses.json"), "utf8"),
  ) as RawCourse[];

  const emptyFields = courses.filter(
    (c) => !c.title || c.units == null || c.units === "",
  ).length;
  console.log(
    `courses.json: ${courses.length} rows, ${emptyFields} with empty title/units`,
  );

  const ours = bySubject(courses);
  let onlyOurs = 0;
  let onlyOracle = 0;
  let compared = 0;
  for (const [subject, ourCodes] of [...ours].sort()) {
    const oracle = await oracleCodes(subject);
    if (!oracle) continue;
    compared++;
    const missingFromOurs = [...oracle].filter((c) => !ourCodes.has(c));
    const extraInOurs = [...ourCodes].filter((c) => !oracle.has(c));
    onlyOurs += extraInOurs.length;
    onlyOracle += missingFromOurs.length;
    if (missingFromOurs.length || extraInOurs.length) {
      console.log(
        `  ${subject}: ours=${ourCodes.size} oracle=${oracle.size} | ` +
          `oracle-only ${missingFromOurs.length} ${missingFromOurs.slice(0, 5).join(",")} | ` +
          `ours-only ${extraInOurs.length} ${extraInOurs.slice(0, 5).join(",")}`,
      );
    }
  }
  console.log(
    `compared ${compared} subjects | oracle-only ${onlyOracle} (possible scrape gaps) | ours-only ${onlyOurs}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
