import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const budgets = [
  {
    route: "/",
    manifest: ".next/server/app/(main)/page_client-reference-manifest.js",
    maxBytes: 425 * 1024,
  },
  {
    route: "/wiki/[...id]",
    manifest:
      ".next/server/app/(main)/wiki/[...id]/page_client-reference-manifest.js",
    maxBytes: 550 * 1024,
  },
];

let failed = false;

for (const budget of budgets) {
  const context = { globalThis: {} };
  vm.runInNewContext(fs.readFileSync(budget.manifest, "utf8"), context);
  const manifest = Object.values(context.globalThis.__RSC_MANIFEST)[0];
  const chunks = new Set(
    manifest.entryJSFiles
      ? Object.values(manifest.entryJSFiles).flat()
      : Object.values(manifest.clientModules)
          .flatMap((module) => module.chunks)
          .filter((chunk) => chunk.endsWith(".js"))
          .map(decodeURIComponent),
  );
  const bytes = [...chunks].reduce(
    (total, chunk) => total + fs.statSync(path.join(".next", chunk)).size,
    0,
  );
  const passed = bytes <= budget.maxBytes;
  failed ||= !passed;
  console.log(
    `${passed ? "PASS" : "FAIL"} ${budget.route}: ${format(bytes)} / ${format(budget.maxBytes)}`,
  );
}

if (failed) process.exitCode = 1;

function format(bytes) {
  return `${(bytes / 1024).toFixed(1)} KiB`;
}
