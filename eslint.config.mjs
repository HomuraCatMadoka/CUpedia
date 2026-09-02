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
            "e2e/**",
            "scripts/**",
            "vitest.config.*",
            "playwright.config.*",
            "eslint.config.*",
            "drizzle.config.*",
          ],
        },
      ],
    },
  },
  {
    files: ["e2e/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["../**/src/**"],
              message: "Use the @/ alias for imports from src.",
            },
          ],
        },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "ImportExpression[source.value=/^\\.\\.\\/(?:.*\\/)?src\\//]",
          message: "Use the @/ alias for imports from src.",
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    ".next/**",
    ".next-e2e/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "CUpedia/**",
    "cu-claw/**",
    "pi-mono/**",
    "wt/**",
  ]),
]);

export default eslintConfig;
