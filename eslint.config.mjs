import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import importPlugin from "eslint-plugin-import";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    plugins: { import: importPlugin },
    rules: {
      "import/no-extraneous-dependencies": [
        "error",
        {
          devDependencies: [
            "tests/**",
            "scripts/**",
            "vitest.config.*",
            "eslint.config.*",
            "drizzle.config.*",
          ],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "CUpedia/**",
    "cu-claw/**",
    "pi-mono/**",
  ]),
]);

export default eslintConfig;
