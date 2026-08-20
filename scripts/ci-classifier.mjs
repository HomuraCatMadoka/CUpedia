#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const PLAN_VERSION = 1;

const DOCS_ONLY = [
  /^docs\//,
  /^(?:README|CONTRIBUTING|SECURITY|CODE_OF_CONDUCT)\.md$/,
  /^(?:AGENTS|CLAUDE)\.md$/,
  /^\.github\/(?:ISSUE_TEMPLATE\/|pull_request_template\.md$)/,
];

// These paths can change the test harness, build, persistence, authentication,
// or shared application surface. They intentionally precede every ordinary
// domain rule and therefore fail closed to the full plan.
const FULL_RISK = [
  /^\.github\/workflows\//,
  /^scripts\/ci-(?:classifier|gate)\.mjs$/,
  /^tests\/ci-(?:classifier|gate|topology)\.test\.ts$/,
  /^(?:package\.json|pnpm-lock\.yaml)$/,
  /^(?:next|playwright|vitest|eslint|postcss|drizzle)\.config\./,
  /^tsconfig(?:\.[^.]+)?\.json$/,
  /^(?:Dockerfile|docker-compose\.yml|Caddyfile|init-zhparser\.sql)$/,
  /^e2e\/(?:fixtures|helpers)\//,
  /^e2e\/(?:policy|provision|runtime)\.ts$/,
  /^scripts\/run-e2e-shards\.ts$/,
  /^docs\/campus-transport\/data\//,
  /^docs\/operations\/artifacts\//,
  /^docs\/contracts\//,
  /^src\/db\//,
  /^src\/lib\/(?:auth(?:-guard|-client)?|contributor-account|email|e2e-otp|otp-email|minio|pg-errors|site-settings)\.[^/]+$/,
  /^src\/lib\/.*(?:actions|queries|store|storage|mutation|persistence|concurrency).*\.[^/]+$/,
  /^src\/lib\/campus-transport\/.*(?:store|operations).*\.[^/]+$/,
  /^src\/app\/(?:\(auth\)|admin|api)\//,
  /^src\/app\/(?:layout|providers|globals)\.[^/]+$/,
  /^src\/app\/\(main\)\/layout\.[^/]+$/,
  /^src\/components\/(?:ui|layout|auth|admin|editor|user)\//,
  /^src\/(?:instrumentation|middleware)\.[^/]+$/,
  /^tests\/(?:db|e2e|fixtures|helpers)\//,
  /^tests\/(?:setup|empty)\.[^/]+$/,
];

const DOMAIN_RULES = [
  {
    domain: "homepage",
    paths: [
      /^src\/components\/home\//,
      /^src\/components\/homepage\/(?!announcement-)/,
      /^tests\/components\/(?:danmaku-banner|homepage)/,
      /^e2e\/homepage\.spec\.ts$/,
    ],
    chromium: ["e2e/homepage.spec.ts"],
  },
  {
    domain: "announcements",
    paths: [
      /^src\/components\/homepage\/announcement-/,
      /^tests\/(?:components|lib)\/announcement-/,
      /^tests\/components\/use-unsaved-announcement-/,
    ],
    chromium: ["e2e/homepage.spec.ts"],
  },
  {
    domain: "campus-bus",
    paths: [
      /^src\/components\/campus-transport\//,
      /^tests\/(?:api|components|lib)\/campus-(?:bus|transport|route)/,
      /^e2e\/campus-bus\.spec\.ts$/,
    ],
    chromium: ["e2e/campus-bus.spec.ts"],
  },
  {
    domain: "canteen",
    paths: [
      /^src\/components\/canteen\//,
      /^tests\/(?:api|components|lib)\/(?:canteen|danmaku)/,
      /^e2e\/canteen-[^/]+\.spec\.ts$/,
    ],
    chromium: ["e2e/canteen-*.spec.ts"],
  },
  {
    domain: "college-picker",
    paths: [
      /^src\/lib\/college-picker\//,
      /^tests\/(?:components\/college-picker|lib\/college-picker)/,
      /^e2e\/college-picker\.spec\.ts$/,
    ],
    chromium: ["e2e/college-picker.spec.ts"],
  },
  {
    domain: "course-tree",
    paths: [
      /^src\/lib\/course-tree\//,
      /^tests\/(?:components\/course-tree|lib\/course-tree)/,
      /^e2e\/course-tree\.spec\.ts$/,
    ],
    chromium: ["e2e/course-tree.spec.ts"],
  },
  {
    domain: "courses",
    paths: [
      /^src\/components\/courses\//,
      /^src\/lib\/(?:course-review-(?!actions)|handbook-|normalizeCourse|parseHandbookLeaf)/,
      /^tests\/(?:components|lib)\/(?:course-|my-course)/,
      /^e2e\/course-review[^/]*\.spec\.ts$/,
    ],
    chromium: ["e2e/course-review*.spec.ts"],
  },
  {
    domain: "professors",
    paths: [
      /^src\/components\/professors\//,
      /^tests\/(?:api|components|lib)\/professor-/,
      /^e2e\/professor-directory\.spec\.ts$/,
    ],
    chromium: ["e2e/professor-directory.spec.ts"],
  },
  {
    domain: "product-updates",
    paths: [
      /^src\/components\/product-updates\//,
      /^src\/lib\/(?:product-navigation|product-update-(?!actions|queries))[^/]+$/,
      /^tests\/(?:components|lib)\/product-/,
      /^e2e\/product-updates\.spec\.ts$/,
    ],
    chromium: ["e2e/product-updates.spec.ts"],
  },
  {
    domain: "wiki",
    paths: [
      /^src\/components\/wiki\//,
      /^src\/lib\/(?:breadcrumb|comment-leaf-id|document-navigation|edit-permission|headings|merge-content|plate-utils|revision-coalescing|search|suggestion|wiki-(?:draft|icon|links|routes|title|tree-state))\.[^/]+$/,
      /^tests\/(?:api|components|hooks|lib)\/wiki-/,
      /^e2e\/wiki-[^/]+\.spec\.ts$/,
    ],
    chromium: ["e2e/wiki-*.spec.ts"],
    minio: true,
  },
];

function matchesAny(path, patterns) {
  return patterns.some((pattern) => pattern.test(path));
}

function fullPlan(reason) {
  return {
    version: PLAN_VERSION,
    tier: "full",
    domain: "full",
    reason,
    install: true,
    quality: true,
    typecheck: true,
    postgres: true,
    build: true,
    chromium: true,
    minio: true,
    webkit: true,
    e2eMatrix: {
      include: [
        {
          project: "chromium-general",
          browser: "chromium",
          install_args: "--only-shell",
          minio: false,
          shards: 1,
          ci_groups: "1",
          specs: "",
        },
        {
          project: "chromium-wiki-media",
          browser: "chromium",
          install_args: "--only-shell",
          minio: true,
          shards: 2,
          ci_groups: "1",
          specs: "",
        },
      ],
    },
    webkitSpecs: "",
  };
}

export function classifyChanges(changes, options = {}) {
  if (options.forceFull) return fullPlan("main push");
  if (!Array.isArray(changes) || changes.length === 0) {
    return fullPlan("missing or empty change set");
  }

  const paths = [];
  for (const change of changes) {
    if (
      !change ||
      typeof change.status !== "string" ||
      !Array.isArray(change.paths)
    ) {
      return fullPlan("malformed change record");
    }
    if (/^[RCD]/.test(change.status)) {
      return fullPlan(`unsafe ${change.status[0]} change`);
    }
    if (!/^(?:A|M)$/.test(change.status) || change.paths.length !== 1) {
      return fullPlan(`unknown git status ${change.status}`);
    }
    paths.push(change.paths[0]);
  }

  if (paths.some((path) => matchesAny(path, FULL_RISK))) {
    return fullPlan("full-risk path");
  }

  if (paths.every((path) => matchesAny(path, DOCS_ONLY))) {
    return {
      version: PLAN_VERSION,
      tier: "docs",
      domain: "docs",
      reason: "docs-only allowlist",
      install: false,
      quality: false,
      typecheck: false,
      postgres: false,
      build: false,
      chromium: false,
      minio: false,
      webkit: false,
      e2eMatrix: { include: [] },
      webkitSpecs: "",
    };
  }

  const matchedDomains = [];
  for (const path of paths) {
    const matches = DOMAIN_RULES.filter((rule) => matchesAny(path, rule.paths));
    if (matches.length !== 1)
      return fullPlan(`unknown or ambiguous path: ${path}`);
    matchedDomains.push(matches[0]);
  }
  const domains = new Set(matchedDomains.map((rule) => rule.domain));
  if (domains.size !== 1) return fullPlan("mixed ordinary domains");

  const rule = matchedDomains[0];
  const runtimeChange = paths.some((path) => /^(?:src|e2e)\//.test(path));
  const webkit =
    rule.domain === "wiki" &&
    paths.some((path) =>
      /(?:mobile|responsive|wiki-editor|toolbar)/.test(path),
    );
  const specs = rule.chromium.join(" ");
  return {
    version: PLAN_VERSION,
    tier: "ordinary",
    domain: rule.domain,
    reason: `single-domain ${rule.domain}`,
    install: true,
    quality: true,
    typecheck: true,
    postgres: false,
    build: runtimeChange,
    chromium: runtimeChange && rule.chromium.length > 0,
    minio: runtimeChange && rule.minio === true,
    webkit,
    e2eMatrix: runtimeChange
      ? {
          include: [
            {
              project: "chromium",
              browser: "chromium",
              install_args: "--only-shell",
              minio: rule.minio === true,
              shards: 1,
              ci_groups: "0",
              specs,
            },
          ],
        }
      : { include: [] },
    webkitSpecs: webkit
      ? "e2e/wiki-edit.mobile-webkit.spec.ts e2e/header.mobile-webkit.spec.ts"
      : "",
  };
}

export function parseNameStatus(buffer) {
  const fields = buffer.toString("utf8").split("\0");
  if (fields.at(-1) === "") fields.pop();
  const changes = [];
  for (let index = 0; index < fields.length; ) {
    const status = fields[index++];
    if (!status) throw new Error("missing git status");
    const pathCount = /^[RC]/.test(status) ? 2 : 1;
    const paths = fields.slice(index, index + pathCount);
    if (paths.length !== pathCount || paths.some((path) => !path)) {
      throw new Error(`incomplete ${status} record`);
    }
    index += pathCount;
    changes.push({ status, paths });
  }
  return changes;
}

function writeOutputs(plan) {
  const output = process.env.GITHUB_OUTPUT;
  if (!output) return;
  const values = {
    plan: JSON.stringify(plan),
    tier: plan.tier,
    domain: plan.domain,
    e2e_matrix: JSON.stringify(plan.e2eMatrix),
    webkit_specs: plan.webkitSpecs,
  };
  appendFileSync(
    output,
    Object.entries(values)
      .map(([key, value]) => `${key}=${value}\n`)
      .join(""),
  );
}

function main() {
  const forceFull = process.argv.includes("--force-full");
  let plan;
  try {
    if (forceFull) {
      plan = classifyChanges([{ status: "M", paths: ["main"] }], {
        forceFull: true,
      });
    } else {
      const base = process.env.CI_BASE_SHA;
      const head = process.env.CI_HEAD_SHA || "HEAD";
      if (
        !base ||
        !/^[0-9a-f]{40}$/i.test(base) ||
        !/^[0-9a-f]{40}$/i.test(head)
      ) {
        throw new Error("CI_BASE_SHA and CI_HEAD_SHA must be full commit SHAs");
      }
      const diff = execFileSync(
        "git",
        ["diff", "--name-status", "-z", "--find-renames", base, head, "--"],
        { encoding: "buffer", maxBuffer: 10 * 1024 * 1024 },
      );
      plan = classifyChanges(parseNameStatus(diff));
    }
  } catch (error) {
    console.error(`CI classification failed closed: ${error.message}`);
    plan = fullPlan("classification error");
  }
  console.log(JSON.stringify(plan, null, 2));
  writeOutputs(plan);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main();
}
