import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    server: {
      deps: { inline: [/@platejs\/math/, /katex/] },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "katex/dist/katex.min.css": path.resolve(__dirname, "./tests/empty.css"),
    },
  },
});
