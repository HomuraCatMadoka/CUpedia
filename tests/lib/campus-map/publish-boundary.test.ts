import { readdirSync, readFileSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

import * as factStoreTransaction from "@/lib/campus-map/fact-store-transaction";

const sourceDirectory = fileURLToPath(
  new URL("../../../src/", import.meta.url),
);
const factStoreTransactionPath = join(
  sourceDirectory,
  "lib/campus-map/fact-store-transaction.ts",
);

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return [".ts", ".tsx"].includes(extname(entry.name)) ? [path] : [];
  });
}

function withoutTypeScriptExtension(path: string): string {
  return path.replace(/\.(?:ts|tsx|js|jsx)$/, "");
}

function resolvesToFactStoreTransaction(
  importer: string,
  specifier: string,
): boolean {
  const candidate = specifier.startsWith("@/")
    ? join(sourceDirectory, specifier.slice(2))
    : specifier.startsWith(".")
      ? resolve(dirname(importer), specifier)
      : null;
  return (
    candidate !== null &&
    withoutTypeScriptExtension(candidate) ===
      withoutTypeScriptExtension(factStoreTransactionPath)
  );
}

function runtimeDependenciesOf(file: string, text: string): string[] {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const dependencies: string[] = [];

  function record(specifier: ts.Expression | undefined, typeOnly: boolean) {
    if (
      !typeOnly &&
      specifier !== undefined &&
      ts.isStringLiteralLike(specifier) &&
      resolvesToFactStoreTransaction(file, specifier.text)
    ) {
      dependencies.push(specifier.text);
    }
  }

  function visit(node: ts.Node) {
    if (ts.isImportDeclaration(node)) {
      const importClause = node.importClause;
      const typeOnly =
        importClause?.isTypeOnly === true ||
        (importClause?.name === undefined &&
          importClause?.namedBindings !== undefined &&
          ts.isNamedImports(importClause.namedBindings) &&
          importClause.namedBindings.elements.every(
            (element) => element.isTypeOnly,
          ));
      record(node.moduleSpecifier, typeOnly);
    } else if (ts.isExportDeclaration(node)) {
      const typeOnly =
        node.isTypeOnly ||
        (node.exportClause !== undefined &&
          ts.isNamedExports(node.exportClause) &&
          node.exportClause.elements.every((element) => element.isTypeOnly));
      record(node.moduleSpecifier, typeOnly);
    } else if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) &&
          node.expression.text === "require"))
    ) {
      record(node.arguments[0], false);
    }
    ts.forEachChild(node, visit);
  }

  visit(source);
  return dependencies;
}

function productionRuntimeImportersOfFactStoreTransaction(): string[] {
  return sourceFiles(sourceDirectory)
    .map((file) => ({ file, text: readFileSync(file, "utf8") }))
    .filter(({ text }) => text.includes("fact-store-transaction"))
    .filter(({ file, text }) => runtimeDependenciesOf(file, text).length > 0)
    .map(({ file }) => relative(sourceDirectory, file))
    .sort();
}

describe("Campus Map publish module boundary", () => {
  it("keeps the storage writer behind the sole application publish seam", () => {
    expect(factStoreTransaction).not.toHaveProperty("appendCampusMapChangeset");
    expect(productionRuntimeImportersOfFactStoreTransaction()).toEqual([
      "lib/campus-map/publish.ts",
    ]);
  });
});
