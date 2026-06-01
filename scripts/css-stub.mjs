import { register } from "node:module";

// CSS imports (e.g. katex.min.css pulled in by @platejs/math) have no Node ESM
// loader, so tsx scripts that touch the Plate pipeline crash. Stub them as empty
// modules — the same trick vitest applies via its CSS alias.
register(
  "data:text/javascript," +
    encodeURIComponent(
      "export async function load(url, ctx, next) {" +
        "  if (url.endsWith('.css')) return { format: 'module', source: 'export default {};', shortCircuit: true };" +
        "  return next(url, ctx);" +
        "}",
    ),
);
